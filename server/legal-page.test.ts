import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

type LegalContent = Record<string, { common: Record<string, string> }>;

test("localizes every dynamic registration and VAT status in all four languages", async () => {
  const script = await readFile("public/legal-content.js", "utf8");
  const window: { AIRCO_LEGAL_CONTENT?: LegalContent } = {};
  vm.runInNewContext(script, { window });
  const content = window.AIRCO_LEGAL_CONTENT;
  assert.ok(content);
  const keys = [
    "registrationRegistered",
    "registrationNumberNotPublished",
    "registrationExempt",
    "registrationBlocked",
    "statusNotConfigured",
    "vatRegistered",
    "vatIdNotPublished",
    "vatNotRegistered",
    "phoneNotConfigured",
    "publicationDirectorNotConfigured",
    "hostNotConfigured",
    "hostAddressNotConfigured",
    "hostPhoneNotConfigured",
    "mediatorNotConfigured",
    "retentionNotConfigured",
    "years",
  ];
  for (const lang of ["en", "nl", "fr", "zh"]) {
    assert.ok(content[lang], lang);
    for (const key of keys) assert.ok(content[lang]!.common[key]?.trim(), `${lang}.${key}`);
  }
  assert.match(content.nl!.common.vatNotRegistered, /btw/i);
  assert.match(content.fr!.common.registrationBlocked, /paiements réels désactivés/i);
  assert.match(content.zh!.common.statusNotConfigured, /未配置/);
});

test("legal-page renderer never falls back to embedded English status prose", async () => {
  const script = await readFile("public/legal-page.js", "utf8");
  assert.match(script, /registration\(config, localized\.common\)/);
  assert.match(script, /vat\(config, localized\.common\)/);
  assert.doesNotMatch(script, /registration exemption legally confirmed/);
  assert.doesNotMatch(script, /not VAT registered; no VAT is charged/);
});
