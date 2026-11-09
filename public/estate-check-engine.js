/*
 * Estate Gap Check: inheritance engine.
 * - faraid(): Shafi'i faraid as applied in Singapore (residue with no residuary heir goes to Baitulmal; no radd).
 * - intestacy(): Intestate Succession Act (non-Muslims).
 * Exact fractions throughout. Used by estate-check.html and by the tests in scripts/.
 */
(function (root) {
  "use strict";

  /* ---------- exact fractions ---------- */
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
  function F(n, d) {
    if (!(this instanceof F)) return new F(n, d);
    d = d === undefined ? 1 : d;
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d); this.n = n / g; this.d = d / g;
  }
  F.prototype.add = function (o) { return F(this.n * o.d + o.n * this.d, this.d * o.d); };
  F.prototype.sub = function (o) { return F(this.n * o.d - o.n * this.d, this.d * o.d); };
  F.prototype.mul = function (o) { return F(this.n * o.n, this.d * o.d); };
  F.prototype.div = function (o) { return F(this.n * o.d, this.d * o.n); };
  F.prototype.cmp = function (o) { return this.n * o.d - o.n * this.d; };
  F.prototype.isZero = function () { return this.n === 0; };
  F.prototype.valueOf = function () { return this.n / this.d; };
  F.prototype.toString = function () { return this.d === 1 ? String(this.n) : this.n + "/" + this.d; };
  const ZERO = F(0), ONE = F(1);
  const fmax = (...xs) => xs.reduce((a, b) => (a.cmp(b) >= 0 ? a : b));
  const fmin = (a, b) => (a.cmp(b) <= 0 ? a : b);
  const sum = (xs) => xs.reduce((a, b) => a.add(b), ZERO);

  const plural = (n, one, many) => (n === 1 ? one : `${many} (${n})`);

  /* ---------- faraid ---------- */
  /*
   * h: {
   *   gender: "male"|"female", married: bool, wives: 1-4,
   *   sons, daughters, sonsSons, sonsDaughters,          // counts (Muslim, living)
   *   father, mother, grandfather, gmMaternal, gmPaternal, // booleans
   *   fullBrothers, fullSisters, patBrothers, patSisters, uterine,
   *   fullNephews, patNephews, fullUncles, patUncles, fullCousins, patCousins
   * }
   * Returns { rows:[{key,g,label,count,share:F,basis}], notes:[], flags:{} }
   */
  function faraid(input) {
    const h = Object.assign({
      gender: "male", married: false, wives: 1, sons: 0, daughters: 0, sonsSons: 0, sonsDaughters: 0,
      father: false, mother: false, grandfather: false, gmMaternal: false, gmPaternal: false,
      fullBrothers: 0, fullSisters: 0, patBrothers: 0, patSisters: 0, uterine: 0,
      fullNephews: 0, patNephews: 0, fullUncles: 0, patUncles: 0, fullCousins: 0, patCousins: 0
    }, input);

    const male = h.gender === "male";
    const S = h.sons, D = h.daughters, SS = h.sonsSons, SD = h.sonsDaughters;
    const FB = h.fullBrothers, FS = h.fullSisters, PB = h.patBrothers, PS = h.patSisters, U = h.uterine;
    const father = !!h.father, mother = !!h.mother;
    const gf = !father && !!h.grandfather;
    const descM = S + SS > 0;                 // male descendant (son or son's son)
    const desc = descM || D + SD > 0;         // any heir descendant
    const femDesc = !descM && D + SD > 0;     // only female descendants
    const allSibs = FB + FS + PB + PS + U;    // all siblings count towards reducing the mother

    const fixed = [];      // {key,g,label,count,share,basis}
    const notes = [];
    const flags = {};
    const add = (row) => { fixed.push(row); return row; };

    /* Spouse */
    let spouseShare = ZERO;
    if (h.married) {
      if (male) {
        spouseShare = desc ? F(1, 8) : F(1, 4);
        add({ key: "wife", g: "spouse", label: h.wives > 1 ? `Wives (${h.wives}, shared equally)` : "Wife", count: h.wives, share: spouseShare,
          basis: desc ? "1/8 fixed share, because you have children or grandchildren through a son" : "1/4 fixed share, because you have no children" });
      } else {
        spouseShare = desc ? F(1, 4) : F(1, 2);
        add({ key: "husband", g: "spouse", label: "Husband", count: 1, share: spouseShare,
          basis: desc ? "1/4 fixed share, because you have children or grandchildren through a son" : "1/2 fixed share, because you have no children" });
      }
    }

    /* Mother / grandmothers */
    if (mother) {
      let s, b;
      if (desc) { s = F(1, 6); b = "1/6 fixed share, because you have children"; }
      else if (allSibs >= 2) { s = F(1, 6); b = "1/6 fixed share, because you have two or more siblings"; }
      else if (h.married && father) { s = ONE.sub(spouseShare).mul(F(1, 3)); b = "1/3 of what remains after your spouse's share (Umariyyatain case)"; }
      else { s = F(1, 3); b = "1/3 fixed share, because you have no children and fewer than two siblings"; }
      add({ key: "mother", g: "parent", label: "Mother", count: 1, share: s, basis: b });
    } else {
      const gms = (h.gmMaternal ? 1 : 0) + (h.gmPaternal && !father ? 1 : 0);
      if (gms) add({ key: "grandmothers", g: "parent", label: gms > 1 ? "Grandmothers (2, shared equally)" : (h.gmMaternal ? "Grandmother (mother's mother)" : "Grandmother (father's mother)"),
        count: gms, share: F(1, 6), basis: "1/6 fixed share, because your mother has passed away" });
    }

    /* Father / grandfather (fixed part) */
    const ancestor = father ? "father" : gf ? "grandfather" : null;
    const ancLabel = father ? "Father" : "Grandfather (father's father)";
    let ancRow = null;
    if (ancestor && desc) {
      ancRow = add({ key: ancestor, g: "parent", label: ancLabel, count: 1, share: F(1, 6),
        basis: descM ? "1/6 fixed share, because you have a son or a son's son" : "1/6 fixed share" });
    }

    /* Daughters */
    if (S === 0 && D > 0) add({ key: "daughters", g: "child", label: plural(D, "Daughter", "Daughters"), count: D,
      share: D === 1 ? F(1, 2) : F(2, 3), basis: D === 1 ? "1/2 fixed share, as the only daughter with no son" : "2/3 fixed share, shared equally, as there is no son" });

    /* Son's daughters (only when no son) */
    let sdResiduary = false;
    if (S === 0 && SD > 0) {
      if (SS > 0) sdResiduary = true;
      else if (D === 0) add({ key: "sonsDaughters", g: "grandchild", label: plural(SD, "Son's daughter", "Son's daughters"), count: SD,
        share: SD === 1 ? F(1, 2) : F(2, 3), basis: SD === 1 ? "1/2 fixed share, taking a daughter's place" : "2/3 fixed share, shared equally, taking the daughters' place" });
      else if (D === 1) add({ key: "sonsDaughters", g: "grandchild", label: plural(SD, "Son's daughter", "Son's daughters"), count: SD,
        share: F(1, 6), basis: "1/6 fixed share, completing two-thirds with your daughter" });
      else notes.push("Your son's daughters receive nothing here because your two or more daughters already take the full two-thirds.");
    }

    /* Siblings */
    const sibBlockedByDesc = descM || father;
    const uterineIn = U > 0 && !desc && !father && !gf;
    if (uterineIn) add({ key: "uterine", g: "sibling", label: plural(U, "Maternal half-sibling", "Maternal half-siblings"), count: U,
      share: U === 1 ? F(1, 6) : F(1, 3), basis: U === 1 ? "1/6 fixed share" : "1/3 fixed share, shared equally between brothers and sisters" });

    // Grandfather with full/paternal siblings follows the Shafi'i (Zayd) method, handled separately.
    const zayd = gf && !descM && FB + FS + PB + PS > 0;

    let fsMaAlGhayr = false, psMaAlGhayr = false;
    if (!sibBlockedByDesc && !zayd) {
      if (FS > 0 && FB === 0) {
        if (femDesc) fsMaAlGhayr = true;
        else add({ key: "fullSisters", g: "sibling", label: plural(FS, "Sister", "Sisters"), count: FS,
          share: FS === 1 ? F(1, 2) : F(2, 3), basis: FS === 1 ? "1/2 fixed share" : "2/3 fixed share, shared equally" });
      }
      if (PS > 0 && FB === 0 && PB === 0) {
        if (fsMaAlGhayr) { /* blocked by full sister acting as residuary */ }
        else if (femDesc && FS === 0) psMaAlGhayr = true;
        else if (FS >= 2) notes.push("Your paternal half-sisters receive nothing because your full sisters already take the full two-thirds.");
        else if (FS === 1) add({ key: "patSisters", g: "sibling", label: plural(PS, "Paternal half-sister", "Paternal half-sisters"), count: PS,
          share: F(1, 6), basis: "1/6 fixed share, completing two-thirds with your full sister" });
        else add({ key: "patSisters", g: "sibling", label: plural(PS, "Paternal half-sister", "Paternal half-sisters"), count: PS,
          share: PS === 1 ? F(1, 2) : F(2, 3), basis: PS === 1 ? "1/2 fixed share" : "2/3 fixed share, shared equally" });
      }
    }

    /* ---------- Grandfather with siblings (Zayd) ---------- */
    if (zayd) {
      flags.zayd = true;
      if (ancRow) fixed.splice(fixed.indexOf(ancRow), 1); // grandfather's share is worked out below
      const others = sum(fixed.map(r => r.share));
      const sibsOnlyOneSister = FB + PB === 0 && FS + PS === 1;
      const akdariyya = !h.married ? false : (!male && mother && sibsOnlyOneSister && !desc && fixed.length === 2 && U === 0);
      if (akdariyya) {
        flags.akdariyya = true;
        Object.assign(fixed.find(r => r.key === "husband"), { share: F(9, 27), basis: "1/2 fixed share, reduced to 1/3 under the special case (al-Akdariyya)" });
        Object.assign(fixed.find(r => r.key === "mother"), { share: F(6, 27), basis: "1/3 fixed share, reduced to 2/9 under the special case (al-Akdariyya)" });
        const sisKey = FS ? "Sister" : "Paternal half-sister";
        return finish([...fixed,
          { key: "grandfather", g: "parent", label: ancLabel, count: 1, share: F(8, 27), basis: "Special case (al-Akdariyya): grandfather and sister share 2:1" },
          { key: "sister", g: "sibling", label: sisKey, count: 1, share: F(4, 27), basis: "Special case (al-Akdariyya)" }],
          notes.concat(["This family matches a rare special case in faraid (al-Akdariyya). The Syariah Court will confirm the exact shares."]), flags);
      }
      let R = ONE.sub(others);
      let gfShare;
      if (R.cmp(F(1, 6)) <= 0) {
        gfShare = F(1, 6); // awl if needed; siblings get nothing
      } else {
        const units = 2 * (FB + PB) + (FS + PS);
        const muq = R.mul(F(2, 2 + units));
        gfShare = others.isZero() ? fmax(muq, F(1, 3)) : fmax(muq, R.mul(F(1, 3)), F(1, 6));
      }
      add({ key: "grandfather", g: "parent", label: ancLabel, count: 1, share: gfShare,
        basis: "The best of the three options the Shafi'i method gives a grandfather who shares with siblings" });
      let pool = R.sub(gfShare);
      const tot = sum(fixed.map(r => r.share));
      if (tot.cmp(ONE) > 0) {
        fixed.forEach(r => { r.share = r.share.div(tot); r.basis += ", reduced in proportion (al-awl)"; });
        pool = ZERO; flags.awl = true;
        notes.push("The fixed shares add up to more than the whole estate, so every share is reduced in proportion (al-awl).");
      }
      const sibRows = [];
      const split2to1 = (amount, b, s, bLabel, sLabel, basis) => {
        const units = 2 * b + s; if (!units || amount.isZero()) return;
        if (b) sibRows.push({ key: bLabel, g: "sibling", label: plural(b, bLabel, bLabel + "s"), count: b, share: amount.mul(F(2 * b, units)), basis });
        if (s) sibRows.push({ key: sLabel, g: "sibling", label: plural(s, sLabel, sLabel + "s"), count: s, share: amount.mul(F(s, units)), basis });
      };
      if (pool.cmp(ZERO) > 0) {
        if (FB > 0) split2to1(pool, FB, FS, "Brother", "Sister", "Shares the remainder with your grandfather (male twice the female)");
        else if (FS > 0) {
          if (PB + PS === 0) split2to1(pool, 0, FS, "Brother", "Sister", "Shares the remainder with your grandfather");
          else {
            const cap = FS === 1 ? F(1, 2) : F(2, 3);
            const fsShare = fmin(cap, pool);
            split2to1(fsShare, 0, FS, "Brother", "Sister", "Takes up to her full fixed share from the siblings' portion");
            split2to1(pool.sub(fsShare), PB, PS, "Paternal half-brother", "Paternal half-sister", "Takes what is left of the siblings' portion");
          }
        } else split2to1(pool, PB, PS, "Paternal half-brother", "Paternal half-sister", "Shares the remainder with your grandfather (male twice the female)");
      }
      notes.push("Your grandfather shares with your brothers and sisters. This uses the Shafi'i method (following Zayd ibn Thabit), which is one of the more complex areas of faraid, so treat these figures as a close estimate.");
      return finish(fixed.concat(sibRows), notes, flags);
    }

    /* ---------- Fixed shares total, awl ---------- */
    let total = sum(fixed.map(r => r.share));
    if (total.cmp(ONE) > 0) {
      fixed.forEach(r => { r.share = r.share.div(total); r.basis += ", reduced in proportion (al-awl)"; });
      flags.awl = true;
      notes.push("The fixed shares add up to more than the whole estate, so every share is reduced in proportion (al-awl).");
      total = ONE;
    }
    let R = ONE.sub(total);
    const resid = [];
    const split = (amount, mCount, fCount, mLabel, fLabel, g, basis) => {
      const units = 2 * mCount + fCount;
      if (mCount) resid.push({ key: mLabel, g, label: plural(mCount, mLabel, mLabel + "s"), count: mCount, share: amount.mul(F(2 * mCount, units)), basis });
      if (fCount) resid.push({ key: fLabel, g, label: plural(fCount, fLabel, fLabel + "s"), count: fCount, share: amount.mul(F(fCount, units)), basis });
    };
    const residBasis = "Residue (asabah): what is left after the fixed shares";
    const residBasis2 = "Residue (asabah), male twice the female";

    if (R.cmp(ZERO) > 0) {
      if (S > 0) split(R, S, D, "Son", "Daughter", "child", D ? residBasis2 : residBasis);
      else if (SS > 0) split(R, SS, sdResiduary ? SD : 0, "Son's son", "Son's daughter", "grandchild", sdResiduary ? residBasis2 : residBasis);
      else if (father || gf) {
        if (ancRow) { ancRow.share = ancRow.share.add(R); ancRow.basis = "1/6 fixed share plus the residue"; }
        else resid.push({ key: ancestor, g: "parent", label: ancLabel, count: 1, share: R, basis: residBasis });
      }
      else if (FB > 0) split(R, FB, FS, "Brother", "Sister", "sibling", FS ? residBasis2 : residBasis);
      else if (fsMaAlGhayr) resid.push({ key: "fullSisters", g: "sibling", label: plural(FS, "Sister", "Sisters"), count: FS, share: R, basis: "Residue, because there are daughters but no son (asabah ma'a al-ghayr)" });
      else if (PB > 0) split(R, PB, PS, "Paternal half-brother", "Paternal half-sister", "sibling", PS ? residBasis2 : residBasis);
      else if (psMaAlGhayr) resid.push({ key: "patSisters", g: "sibling", label: plural(PS, "Paternal half-sister", "Paternal half-sisters"), count: PS, share: R, basis: "Residue, because there are daughters but no son (asabah ma'a al-ghayr)" });
      else if (h.fullNephews > 0) resid.push({ key: "fullNephews", g: "extended", label: plural(h.fullNephews, "Nephew (full brother's son)", "Nephews (full brothers' sons)"), count: h.fullNephews, share: R, basis: residBasis });
      else if (h.patNephews > 0) resid.push({ key: "patNephews", g: "extended", label: plural(h.patNephews, "Nephew (paternal half-brother's son)", "Nephews (paternal half-brothers' sons)"), count: h.patNephews, share: R, basis: residBasis });
      else if (h.fullUncles > 0) resid.push({ key: "fullUncles", g: "extended", label: plural(h.fullUncles, "Uncle (father's full brother)", "Uncles (father's full brothers)"), count: h.fullUncles, share: R, basis: residBasis });
      else if (h.patUncles > 0) resid.push({ key: "patUncles", g: "extended", label: plural(h.patUncles, "Uncle (father's paternal half-brother)", "Uncles (father's paternal half-brothers)"), count: h.patUncles, share: R, basis: residBasis });
      else if (h.fullCousins > 0) resid.push({ key: "fullCousins", g: "extended", label: plural(h.fullCousins, "Cousin (son of father's full brother)", "Cousins (sons of father's full brothers)"), count: h.fullCousins, share: R, basis: residBasis });
      else if (h.patCousins > 0) resid.push({ key: "patCousins", g: "extended", label: plural(h.patCousins, "Cousin (son of father's paternal half-brother)", "Cousins (sons of father's paternal half-brothers)"), count: h.patCousins, share: R, basis: residBasis });
      else {
        resid.push({ key: "baitulmal", g: "other", label: "Baitulmal (MUIS)", count: 1, share: R, basis: "No residuary heir, so the residue goes to Baitulmal" });
        flags.baitulmal = true;
      }
    }

    /* Musharraka (Himariyya): full brothers left with nothing share the maternal half-siblings' third */
    if (FB > 0 && uterineIn && U >= 2 && R.isZero() && !desc && !father && !gf) {
      const ut = fixed.find(r => r.key === "uterine");
      const heads = U + FB + FS;
      const third = ut.share;
      ut.share = third.mul(F(U, heads)); ut.basis = "Shares 1/3 equally with your full siblings (al-Musharraka)";
      resid.push({ key: "Brother", g: "sibling", label: plural(FB, "Brother", "Brothers"), count: FB, share: third.mul(F(FB, heads)), basis: "Shares the maternal half-siblings' 1/3 equally (al-Musharraka)" });
      if (FS) resid.push({ key: "Sister", g: "sibling", label: plural(FS, "Sister", "Sisters"), count: FS, share: third.mul(F(FS, heads)), basis: "Shares the maternal half-siblings' 1/3 equally (al-Musharraka)" });
      flags.musharraka = true;
      notes.push("Your full siblings would otherwise get nothing, so under the Shafi'i rule (al-Musharraka) they share the maternal half-siblings' one-third equally.");
    }

    return finish(fixed.concat(resid), notes, flags);
  }

  function finish(rows, notes, flags) {
    rows = rows.filter(r => r.share.cmp(ZERO) > 0);
    const order = { spouse: 0, child: 1, grandchild: 2, parent: 3, sibling: 4, extended: 5, other: 6 };
    rows.sort((a, b) => order[a.g] - order[b.g]);
    const total = sum(rows.map(r => r.share));
    if (total.cmp(ONE) !== 0 && rows.length) throw new Error("faraid shares do not total 1: " + total);
    return { rows, notes, flags };
  }

  /* ---------- Intestate Succession Act ---------- */
  /*
   * a: { married, children, deceasedChildLines, father, mother, siblings }
   * deceasedChildLines: children who have died leaving children of their own (each line takes one child's share).
   */
  function intestacy(input) {
    const a = Object.assign({ married: false, children: 0, deceasedChildLines: 0, father: false, mother: false, siblings: 0 }, input);
    const lines = a.children + a.deceasedChildLines;
    const P = (a.father ? 1 : 0) + (a.mother ? 1 : 0);
    const rows = [], notes = [];
    const issue = (share) => {
      if (a.children) rows.push({ key: "children", g: "child", label: plural(a.children, "Child", "Children"), count: a.children, share: share.mul(F(a.children, lines)),
        basis: a.married ? "The other half, shared equally between your children" : "The whole estate, shared equally between your children" });
      if (a.deceasedChildLines) rows.push({ key: "grandchildren", g: "grandchild", label: a.deceasedChildLines === 1 ? "Grandchildren (through a child who has passed away)" : `Grandchildren (through ${a.deceasedChildLines} children who have passed away)`,
        count: a.deceasedChildLines, share: share.mul(F(a.deceasedChildLines, lines)), basis: "Each line takes the share their parent would have had" });
    };
    const parents = (share, basis) => rows.push({ key: "parents", g: "parent", label: P > 1 ? "Parents (2)" : (a.father ? "Father" : "Mother"), count: P, share, basis });
    if (a.married) {
      if (lines) { rows.push({ key: "spouse", g: "spouse", label: "Spouse", count: 1, share: F(1, 2), basis: "Half, because you have children" }); issue(F(1, 2)); }
      else if (P) { rows.push({ key: "spouse", g: "spouse", label: "Spouse", count: 1, share: F(1, 2), basis: "Half, because you have no children but a parent is alive" }); parents(F(1, 2), "The other half, because you have no children"); }
      else rows.push({ key: "spouse", g: "spouse", label: "Spouse", count: 1, share: ONE, basis: "The whole estate, because you have no children or parents" });
    } else {
      if (lines) issue(ONE);
      else if (P) parents(ONE, "The whole estate, because you have no spouse or children");
      else if (a.siblings) rows.push({ key: "siblings", g: "sibling", label: plural(a.siblings, "Brother or sister", "Brothers and sisters"), count: a.siblings, share: ONE, basis: "The whole estate, shared equally. Children of a sibling who has passed away take their parent's share." });
      else { rows.push({ key: "other", g: "other", label: "Grandparents, then uncles and aunts, then the Government", count: 1, share: ONE, basis: "Passes down the order set by the Act" }); notes.push("With no spouse, children, parents or siblings, your estate passes to grandparents, then uncles and aunts, and to the Government if there are none."); }
    }
    return { rows, notes, flags: {} };
  }

  const api = { F, faraid, intestacy };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EstateEngine = api;
})(typeof window !== "undefined" ? window : this);
