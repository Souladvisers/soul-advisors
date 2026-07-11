#!/usr/bin/env python3
"""
scrape_dividends.py
Scrapes Prudential Singapore fund pages for latest dividend/distribution data
and updates prulink-data.json with fresh dividend history and bid prices.

Run daily via GitHub Actions alongside update_prices.py.
Requires: beautifulsoup4, requests
"""

import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

DATA_FILE = Path(__file__).parent.parent / "public" / "prulink-data.json"
BASE_URL  = "https://www.prudential.com.sg/products/wealth-accumulation/ilp/prulink-funds/"
HEADERS   = {"User-Agent": "Mozilla/5.0 (compatible; SoulAdvisors/1.0)"}

# Verified slugs for all distribution funds (name → slug)
FUND_SLUGS = {
    "PRULink Asian Fixed-Income Fund (Distribution)":             "prulink-asian-fixed-income-fund-distribution",
    "PRULink Asian Income and Growth Fund (Distribution)":        "prulink-asian-income-and-growth-fund-distribution",
    "PRULink Asian Income Fund":                                  "prulink-asian-income-fund",
    "PRULink Asian Multi-Asset Income Fund (Decumulation)":       "prulink-asian-multi-asset-income-fund-decumulation",
    "PRULink Asian Multi-Asset Income Fund (Distribution)":       "prulink-asian-multi-asset-income-fund-distribution",
    "PRULink Global Diversified Income Fund (Distribution)":      "prulink-global-diversified-income-fund-distribution",
    "PRULink Global Dividend Wealth Fund (Distribution)":         "prulink-global-dividend-wealth-fund-distribution",
    "PRULink Global Equity Fund (Distribution)":                  "prulink-global-equity-fund-distribution",
    "PRULink Global Managed Fund (Distribution)":                 "prulink-global-managed-fund-distribution",
    "PRULink Global Multi-Asset Income Fund (Decumulation)":      "prulink-global-multi-asset-income-fund-decumulation",
    "PRULink Global Multi-Asset Income Fund (Distribution)":      "prulink-global-multi-asset-income-fund-distribution",
    "PRULink Global Signature CIO Income Fund (Distribution)":    "prulink-global-signature-cio-income-fund-distribution",
    "PRULink Singapore Dynamic Bond Fund (Distribution)":         "prulink-singapore-dynamic-bond-fund-distribution",
    "PRULink StrategicInvest Income Fund (Distribution)":         "prulink-strategicinvest-income-fund-distribution",
    "PRULink StrategicInvest Income Fund (USD) (Distribution)":   "prulink-strategicinvest-income-fund-usd-distribution",
    "PRULink US Dividend Wealth Fund (Distribution)":             "prulink-us-dividend-wealth-fund-distribution",
    "PRULink US Dividend Wealth Fund (USD) (Distribution)":       "prulink-us-dividend-wealth-fund-usd-distribution",
}


def parse_rate(text):
    """Parse a dividend rate string into a dict with rateCents or ratePct."""
    text = text.strip().lower()
    if "cent" in text:
        m = re.search(r"([\d.]+)\s*cent", text)
        if m:
            return {"rateCents": float(m.group(1))}
    m = re.search(r"([\d.]+)\s*%", text)
    if m:
        return {"ratePct": round(float(m.group(1)) / 100, 6)}
    return {}


def parse_date(text):
    """Normalise date strings like '15 June 2026' → '2026-06-15'."""
    text = text.strip()
    for fmt in ("%d %B %Y", "%d %b %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return text  # return as-is if unparseable


def scrape_fund(name, slug):
    url = BASE_URL + slug
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        print(f"  [ERROR] {name}: {e}", file=sys.stderr)
        return None, []

    soup = BeautifulSoup(resp.text, "html.parser")

    # ── Bid price ─────────────────────────────────────────────────────────
    bid_price = None
    span = soup.find("span", class_="ilp-value")
    if span:
        m = re.search(r"\$([\d.]+)", span.get_text())
        if m:
            bid_price = float(m.group(1))

    # ── Dividends ─────────────────────────────────────────────────────────
    dividends = []
    div_list = soup.find("div", class_="ilp-dividend-list")
    if div_list:
        for item in div_list.find_all("div", class_="item"):
            cols = item.find_all("div", class_="col")
            if len(cols) < 2:
                continue
            date_text = cols[0].get_text(strip=True)
            rate_text = cols[1].get_text(strip=True)
            if not date_text or date_text.lower() in ("declaration", ""):
                continue
            rate = parse_rate(rate_text)
            if not rate:
                continue
            entry = {"date": parse_date(date_text)}
            entry.update(rate)
            dividends.append(entry)

    # Prudential shows newest-first; reverse to oldest-first to match our convention
    dividends.reverse()
    return bid_price, dividends


def merge_dividends(existing, fresh):
    """Merge fresh dividends into existing list (oldest-first), no duplicates by date."""
    by_date = {d.get("date"): d for d in existing}
    for d in fresh:
        date = d.get("date")
        if date and date not in by_date:
            by_date[date] = d
    return sorted(by_date.values(), key=lambda d: d.get("date", ""))


def main():
    print("Loading prulink-data.json…")
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    funds_by_name = {f["name"]: f for f in data["funds"]}
    changed = 0

    for fund_name, slug in FUND_SLUGS.items():
        if fund_name not in funds_by_name:
            print(f"  [SKIP] Not in data.json: {fund_name}", file=sys.stderr)
            continue

        print(f"  Scraping {fund_name}…")
        bid_price, fresh_divs = scrape_fund(fund_name, slug)

        fund = funds_by_name[fund_name]
        orig = json.dumps({"b": fund.get("bidPrice"), "d": fund.get("dividends", [])})

        if bid_price is not None:
            fund["bidPrice"] = bid_price
        if fresh_divs:
            fund["dividends"] = merge_dividends(fund.get("dividends", []), fresh_divs)
        fund["url"] = BASE_URL + slug
        fund["lastDividendScrape"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        if json.dumps({"b": fund.get("bidPrice"), "d": fund.get("dividends", [])}) != orig:
            changed += 1

        time.sleep(1.5)  # polite crawl delay

    data["meta"]["dividendScrapeDate"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Done. {changed}/{len(FUND_SLUGS)} funds had changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
