import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildI18nDataElement,
  parseTranslationData,
  SUPPORTED_LANGS,
  type TranslationMap,
} from "../shared/i18n.js";
import { mergeTranslationBundle } from "./i18n.js";

const translations: TranslationMap = {
  hero_title: {
    zh: "哪里还有空调，<br />一眼就知道。",
    nl: "Waar is er nog een airco,<br/>in één oogopslag.",
    en: "Where to find an AC,<br/>at a glance.",
    fr: "Où trouver un climatiseur,<br/>en un coup d’œil.",
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
      fr: "Alerte & fraîcheur",
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
    valid: { zh: "中", nl: "NL", en: "EN", fr: "FR" },
    missingLanguage: { zh: "中", nl: "NL", en: "EN" },
    invalid: "not an object",
  }));
  assert.deepEqual(parsed, { valid: { zh: "中", nl: "NL", en: "EN", fr: "FR" } });
  assert.deepEqual(parseTranslationData("not json"), {});
});

test("fills missing or blank table languages from the local bundle", () => {
  const fallback = translations.hero_title;
  assert.deepEqual(mergeTranslationBundle(fallback, {
    zh: "表格中文",
    nl: "Tabel-NL",
    en: "Table EN",
    fr: "   ",
  }), {
    zh: "表格中文",
    nl: "Tabel-NL",
    en: "Table EN",
    fr: fallback.fr,
  });
});

test("rejects a table-only translation unless every language is present", () => {
  assert.equal(mergeTranslationBundle(undefined, { zh: "中", nl: "NL", en: "EN" }), null);
  assert.deepEqual(mergeTranslationBundle(undefined, { zh: "中", nl: "NL", en: "EN", fr: "FR" }), {
    zh: "中",
    nl: "NL",
    en: "EN",
    fr: "FR",
  });
});

test("keeps every local browser translation complete in all supported languages", async () => {
  const raw = JSON.parse(await readFile("test-fixtures/i18n.local.json", "utf8")) as Record<string, Record<string, unknown>>;
  assert.ok(Object.keys(raw).length > 0);
  for (const [key, bundle] of Object.entries(raw)) {
    assert.deepEqual(Object.keys(bundle).sort(), [...SUPPORTED_LANGS].sort(), key);
    for (const lang of SUPPORTED_LANGS) {
      assert.equal(typeof bundle[lang], "string", `${key}.${lang}`);
      assert.notEqual((bundle[lang] as string).trim(), "", `${key}.${lang}`);
    }
  }
  assert.deepEqual(parseTranslationData(JSON.stringify(raw)), raw);
});
