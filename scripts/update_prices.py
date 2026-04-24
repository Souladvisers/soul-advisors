#!/usr/bin/env python3
"""
update_prices.py
Fetches the daily PRULink fund pricing PDF from Prudential Singapore,
extracts all bid prices, and updates prulink-data.json with:
  - fund.bidPrice   (current NAV/bid price)
  - fund.bidDate    (date of the price, e.g. "23-Apr-2026")
  - meta.priceDate  (same date at the top level)

Run daily via GitHub Actions. Requires: pdfminer.six, requests
"""

import json
import re
import sys
import requests
from pathlib import Path
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextBox, LTTextLine
import tempfile
import os

PDF_URL   = "https://pruaccess.prudential.com.sg/prulinkfund/viewFundPricing.pdf?fundType=pl"
DATA_FILE = Path(__file__).parent.parent / "public" / "prulink-data.json"

# ─── Manual name overrides ───────────────────────────────────────────────────
# Maps a normalised PDF key → EXACT original fund name in data.json (as-is).
# Needed for: (a) PDF bare names that are ambiguous across multi-variant funds,
#             (b) PDF abbreviations that don't normalise to the data.json key,
#             (c) hyphen vs space differences.
OVERRIDES = {
    # Bare PDF name maps to the variant not covered by other suffixed PDF entries
    "asian income and growth fund":         "PRULink Asian Income and Growth Fund (USD) (Accumulation)",
    "asian multi-asset income fund":        "PRULink Asian Multi-Asset Income Fund (Decumulation)",
    "global multi-asset income fund":       "PRULink Global Multi-Asset Income Fund (Decumulation)",
    "singapore dynamic bond fund":          "PRULink Singapore Dynamic Bond Fund (Accumulation)",
    "strategicinvest income fund":          "PRULink StrategicInvest Income Fund (Distribution)",
    "us dividend wealth fund":              "PRULink US Dividend Wealth Fund (Distribution)",
    # "(Acc)" leaks as prefix from wrapped previous line — "low vol" ≠ "low volatility"
    "(acc) asian low vol equity fund":      "PRULink Asian Low Volatility Equity Fund (Accumulation)",
    # PDF says "Growth Fund", data.json says "Growth (SGD) (Accumulation)"
    "global equity growth fund":            "PRULink Global Equity Growth (SGD) (Accumulation)",
    # Hyphen vs space
    "china india fund":                     "PRULink China-India Fund",
    # India Opp matched via prefix anyway; kept for safety
    "india opp equity fund":                "PRULink India Opportunity Equity Fund (Accumulation)",
}


def normalise(s: str) -> str:
    s = s.lower()
    s = re.sub(r'\bprulink\b', '', s)
    s = s.replace('(accumulation)', '(acc)').replace(' accumulation', '')
    s = s.replace('(decumulation)', '(decu)').replace(' decumulation', '')
    s = s.replace('(distribution)', '(dis)').replace(' distribution', '')
    s = s.replace('opportunity', 'opp')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def parse_pdf(path: str) -> dict:
    elements = []
    for page_layout in extract_pages(path):
        for element in page_layout:
            if isinstance(element, LTTextBox):
                for line in element:
                    if isinstance(line, LTTextLine):
                        text = line.get_text().strip()
                        if text:
                            elements.append({
                                'text': text,
                                'y': line.y0,
                                'x': line.x0,
                                'page': page_layout.pageid
                            })

    # Extract date
    all_text = ' '.join(e['text'] for e in elements)
    date_m = re.search(r'Updated On (\d{2}-[A-Za-z]+-\d{4})', all_text)
    price_date = date_m.group(1) if date_m else None

    SKIP = {'Fund Name', 'First Effective', 'View Type', 'Currency',
            'Bid Price', 'Offer Price', 'Date', 'PruLink Fund Pricing'}
    bids = sorted(
        [e for e in elements if 340 < e['x'] < 370 and re.match(r'^\d+\.\d{5}$', e['text'])],
        key=lambda e: (e['page'], -e['y'])
    )
    ccys = [e for e in elements if 600 < e['x'] < 660 and e['text'] in ('SGD', 'USD')]
    name_frags = [e for e in elements
                  if e['x'] < 330 and re.search(r'[A-Za-z]', e['text'])
                  and not any(h in e['text'] for h in SKIP)]

    funds = []
    for i, bid in enumerate(bids):
        prev_bid_y = next(
            (bids[j]['y'] for j in range(i - 1, -1, -1) if bids[j]['page'] == bid['page']),
            9999
        )
        my_frags = sorted(
            [f for f in name_frags
             if f['page'] == bid['page'] and bid['y'] - 2 <= f['y'] < prev_bid_y - 2],
            key=lambda f: -f['y']
        )
        name = ' '.join(f['text'] for f in my_frags).strip()
        # Strip leading suffix fragment from previous wrapped name
        name = re.sub(r'^\([^)]+\)\s*', '', name).strip()
        # Strip title artifact on first entry
        name = re.sub(r'^PruLink Fund Pricing \(Updated On [^)]+\)\s*', '', name).strip()
        if not name:
            continue
        ccy_m = [c for c in ccys if c['page'] == bid['page'] and abs(c['y'] - bid['y']) < 5]
        ccy = ccy_m[0]['text'] if ccy_m else 'SGD'
        funds.append({'name': name, 'bid': float(bid['text']), 'ccy': ccy})

    return {'date': price_date, 'funds': funds}


def match_funds(pdf_funds: list, our_funds: list) -> dict:
    """Return map: our_fund_name → bid price"""
    our_norm = {normalise(f['name']): f['name'] for f in our_funds}
    pdf_norm  = {normalise(f['name']): f for f in pdf_funds}

    result = {}

    for pdf_key, pf in pdf_norm.items():
        # 1. Direct normalised match
        if pdf_key in our_norm:
            result[our_norm[pdf_key]] = pf['bid']
            continue

        # 2. Manual override
        override = OVERRIDES.get(pdf_key)
        if override and override in our_norm.values():
            result[override] = pf['bid']
            continue

        # 3. Substring match: pdf key is a prefix of our key
        matched = [(ok, on) for ok, on in our_norm.items() if ok.startswith(pdf_key)]
        if len(matched) == 1:
            result[matched[0][1]] = pf['bid']
            continue

        # 4. Substring match: our key starts with pdf key (strip trailing type)
        stripped = re.sub(r'\s*\([^)]+\)\s*$', '', pdf_key).strip()
        matched = [(ok, on) for ok, on in our_norm.items() if ok.startswith(stripped)]
        if len(matched) == 1:
            result[matched[0][1]] = pf['bid']
            continue

        print(f"  [UNMATCHED] PDF: {pf['name']}", file=sys.stderr)

    return result


def main():
    print("Fetching PRULink pricing PDF…")
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; SoulAdvisors/1.0)'}
    resp = requests.get(PDF_URL, headers=headers, timeout=30)
    resp.raise_for_status()
    print(f"  Downloaded {len(resp.content):,} bytes")

    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
        tmp.write(resp.content)
        tmp_path = tmp.name

    try:
        print("Parsing PDF…")
        parsed = parse_pdf(tmp_path)
        print(f"  Date: {parsed['date']}, Funds in PDF: {len(parsed['funds'])}")
    finally:
        os.unlink(tmp_path)

    print("Loading prulink-data.json…")
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print("Matching fund names…")
    price_map = match_funds(parsed['funds'], data['funds'])
    print(f"  Matched: {len(price_map)}/{len(parsed['funds'])} funds")

    # Apply prices
    updated = 0
    for fund in data['funds']:
        if fund['name'] in price_map:
            fund['bidPrice'] = price_map[fund['name']]
            fund['bidDate']  = parsed['date']
            updated += 1
        elif 'bidPrice' not in fund:
            fund['bidPrice'] = None
            fund['bidDate']  = None

    data['meta']['priceDate'] = parsed['date']
    data['meta']['pricesLive'] = True

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  Updated {updated} fund prices in prulink-data.json")
    print(f"  Price date: {parsed['date']}")

    # Exit with error if too few matched (sanity check)
    if updated < 50:
        print(f"ERROR: Only matched {updated} funds — expected 50+. Check parsing.", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
