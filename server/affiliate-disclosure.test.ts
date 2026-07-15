import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the affiliate disclosure merchant-neutral in every supported language", async () => {
  const [html, script] = await Promise.all([
    readFile("public/affiliate-disclosure.html", "utf8"),
    readFile("public/affiliate-disclosure.js", "utf8"),
  ]);
  const disclosure = `${html}\n${script}`;

  assert.doesNotMatch(disclosure, /De[’']Longhi|Sovrn|sovrn\.co/i);
  assert.match(script, /Some merchant links on Airco Tracker may be affiliate links\./);
  assert.match(script, /Certains liens vers des marchands sur Airco Tracker peuvent être des liens affiliés\./);
  assert.match(script, /Sommige links naar winkels op Airco Tracker kunnen affiliatelinks zijn\./);
  assert.match(script, /Airco Tracker 上的部分商家链接可能是推广联盟链接。/);
  assert.match(script, /This does not add to or change the price you pay/);
  assert.match(script, /Cela n’ajoute aucun coût et ne modifie pas le prix que vous payez/);
  assert.match(script, /Dit verhoogt of verandert de prijs die je betaalt niet/);
  assert.match(script, /这不会增加或改变您支付的价格/);
});
