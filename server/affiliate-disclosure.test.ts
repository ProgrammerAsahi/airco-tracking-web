import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the affiliate disclosure merchant-neutral in every supported language", async () => {
  const [html, script] = await Promise.all([
    readFile("public/affiliate-disclosure.html", "utf8"),
    readFile("public/legal-content.js", "utf8"),
  ]);
  const disclosure = `${html}\n${script}`;

  assert.doesNotMatch(disclosure, /De[’']Longhi|Sovrn|sovrn\.co/i);
  assert.match(script, /clearly marked retailer links may earn Airco Tracker a commission at no extra cost/i);
  assert.match(script, /liens marchands clairement signalés peuvent nous rémunérer sans surcoût/i);
  assert.match(script, /duidelijk gemarkeerde winkellinks kunnen ons commissie opleveren zonder extra kosten/i);
  assert.match(script, /部分明确标识的商家链接可能让我们获得佣金，但不会增加你的价格/);
});
