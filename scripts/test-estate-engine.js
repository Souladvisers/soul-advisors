// Run: node scripts/test-estate-engine.js
const { faraid, intestacy } = require("../public/estate-check-engine.js");
let fails = 0;
function check(name, input, expect, fn = faraid) {
  const out = fn(input);
  const got = {}; out.rows.forEach(r => (got[r.label] = r.share.toString()));
  const ok = Object.keys(expect).length === Object.keys(got).length && Object.entries(expect).every(([k, v]) => got[k] === v);
  if (!ok) { fails++; console.log("FAIL", name, "\n  expected", expect, "\n  got     ", got); }
  else console.log("ok  ", name);
}
const M = { gender: "male", married: true };
const W = { gender: "female", married: true };
check("wife, son, daughter, mother", { ...M, sons: 1, daughters: 1, mother: true },
  { "Wife": "1/8", "Mother": "1/6", "Son": "17/36", "Daughter": "17/72" });
check("wife, father, mother, no children (Umariyyatain)", { ...M, father: true, mother: true },
  { "Wife": "1/4", "Mother": "1/4", "Father": "1/2" });
check("husband, father, mother (Umariyyatain)", { ...W, father: true, mother: true },
  { "Husband": "1/2", "Mother": "1/6", "Father": "1/3" });
check("wife + one daughter only -> Baitulmal", { ...M, daughters: 1 },
  { "Wife": "1/8", "Daughter": "1/2", "Baitulmal (MUIS)": "3/8" });
check("wife + one daughter + full uncle", { ...M, daughters: 1, fullUncles: 1 },
  { "Wife": "1/8", "Daughter": "1/2", "Uncle (father's full brother)": "3/8" });
check("wife, 2 daughters, 1 full sister (ma'a al-ghayr)", { ...M, daughters: 2, fullSisters: 1 },
  { "Wife": "1/8", "Daughters (2)": "2/3", "Sister": "5/24" });
check("daughter, son's daughter, mother, brother", { gender: "male", daughters: 1, sonsDaughters: 1, mother: true, fullBrothers: 1 },
  { "Daughter": "1/2", "Son's daughter": "1/6", "Mother": "1/6", "Brother": "1/6" });
check("husband, mother, 2 full sisters (awl to 8)", { ...W, mother: true, fullSisters: 2 },
  { "Husband": "3/8", "Mother": "1/8", "Sisters (2)": "1/2" });
check("husband, mother, 2 maternal half-sibs, full brother (Musharraka)", { ...W, mother: true, uterine: 2, fullBrothers: 1 },
  { "Husband": "1/2", "Mother": "1/6", "Maternal half-siblings (2)": "2/9", "Brother": "1/9" });
check("husband, mother, grandfather, 1 sister (Akdariyya)", { ...W, mother: true, grandfather: true, fullSisters: 1 },
  { "Husband": "1/3", "Mother": "2/9", "Grandfather (father's father)": "8/27", "Sister": "4/27" });
check("grandfather + 1 brother", { gender: "male", grandfather: true, fullBrothers: 1 },
  { "Grandfather (father's father)": "1/2", "Brother": "1/2" });
check("grandfather + 3 brothers (takes 1/3)", { gender: "male", grandfather: true, fullBrothers: 3 },
  { "Grandfather (father's father)": "1/3", "Brothers (3)": "2/3" });
check("wife, grandfather, 2 brothers", { ...M, grandfather: true, fullBrothers: 2 },
  { "Wife": "1/4", "Grandfather (father's father)": "1/4", "Brothers (2)": "1/2" });
check("wife, mother, daughter, paternal half-sister", { ...M, mother: true, daughters: 1, patSisters: 1 },
  { "Wife": "1/8", "Mother": "1/6", "Daughter": "1/2", "Paternal half-sister": "5/24" });
check("father + mother + 2 brothers (brothers blocked)", { gender: "male", father: true, mother: true, fullBrothers: 2 },
  { "Mother": "1/6", "Father": "5/6" });
check("husband, son, both grandmothers", { ...W, sons: 1, gmMaternal: true, gmPaternal: true },
  { "Husband": "1/4", "Grandmothers (2, shared equally)": "1/6", "Son": "7/12" });
check("wife, son's son, son's daughter", { ...M, sonsSons: 1, sonsDaughters: 1 },
  { "Wife": "1/8", "Son's son": "7/12", "Son's daughter": "7/24" });
check("2 daughters + son's daughter + son's son (son's son lifts her)", { gender: "male", daughters: 2, sonsDaughters: 1, sonsSons: 1 },
  { "Daughters (2)": "2/3", "Son's son": "2/9", "Son's daughter": "1/9" });
check("2 daughters + son's daughter only (excluded)", { gender: "male", daughters: 2, sonsDaughters: 1, fullUncles: 1 },
  { "Daughters (2)": "2/3", "Uncle (father's full brother)": "1/3" });
check("full sister + 2 paternal half-sisters", { gender: "male", fullSisters: 1, patSisters: 2, patCousins: 1 },
  { "Sister": "1/2", "Paternal half-sisters (2)": "1/6", "Cousin (son of father's paternal half-brother)": "1/3" });
check("father, daughter (1/6 + residue)", { gender: "male", father: true, daughters: 1 },
  { "Daughter": "1/2", "Father": "1/2" });
check("wife, 2 daughters, father, mother (awl 27)", { ...M, daughters: 2, father: true, mother: true },
  { "Wife": "1/9", "Daughters (2)": "16/27", "Mother": "4/27", "Father": "4/27" });
check("one maternal half-brother + mother", { gender: "male", mother: true, uterine: 1 },
  { "Mother": "1/3", "Maternal half-sibling": "1/6", "Baitulmal (MUIS)": "1/2" });
check("no heirs at all", { gender: "male" }, { "Baitulmal (MUIS)": "1" });

check("ISA spouse + 2 children", { married: true, children: 2 }, { "Spouse": "1/2", "Children (2)": "1/2" }, intestacy);
check("ISA spouse + 1 child + 1 deceased child line", { married: true, children: 1, deceasedChildLines: 1 },
  { "Spouse": "1/2", "Child": "1/4", "Grandchildren (through a child who has passed away)": "1/4" }, intestacy);
check("ISA spouse + parents", { married: true, father: true, mother: true }, { "Spouse": "1/2", "Parents (2)": "1/2" }, intestacy);
check("ISA siblings only", { siblings: 3 }, { "Brothers and sisters (3)": "1" }, intestacy);
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
