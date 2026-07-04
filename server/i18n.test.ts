import assert from "node:assert/strict";
import test from "node:test";
import { buildI18nDataElement, parseTranslationData, type TranslationMap } from "../shared/i18n.js";

const translations: TranslationMap = {
  hero_title: {
    zh: "哪里还有空调，<br />一眼就知道。",
    nl: "Waar is er nog een airco,<br/>in één oogopslag.",
    en: "Where to find an AC,<br/>at a glance.",
  },
};

test("embeds translations as CSP-safe inert JSON", () => {
  const element = buildI18nDataElement(translations);
  assert.match(element, /^<script id="i18n-data" type="application\/json">/);
  assert.doesNotMatch(element, /window\.__I18N__/);

  const raw = element.match(/^<script[^>]+>(.*)<\/script>$/)?.[1];
  assert.deepEqual(parseTranslationData(raw), translations);
});

test("escapes content that could terminate the JSON data element", () => {
  const hostile: TranslationMap = {
    value: {
      zh: "</script><script>alert(1)</script>",
      nl: "A & B",
      en: "1 < 2 > 0",
    },
  };
  const element = buildI18nDataElement(hostile);
  assert.equal((element.match(/<\/script>/g) ?? []).length, 1);

  const raw = element.match(/^<script[^>]+>(.*)<\/script>$/)?.[1];
  assert.doesNotMatch(raw ?? "", /[<>&]/);
  assert.deepEqual(parseTranslationData(raw), hostile);
});

test("ignores malformed translation bundles", () => {
  const parsed = parseTranslationData(JSON.stringify({
    valid: { zh: "中", nl: "NL", en: "EN" },
    missingLanguage: { zh: "中", en: "EN" },
    invalid: "not an object",
  }));
  assert.deepEqual(parsed, { valid: { zh: "中", nl: "NL", en: "EN" } });
  assert.deepEqual(parseTranslationData("not json"), {});
});
