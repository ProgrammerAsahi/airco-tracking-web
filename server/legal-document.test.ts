import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseLegalContentScript, renderLegalDocument, renderWithdrawalDocument } from "./legal-document.js";
import type { LegalPublicConfiguration } from "./legal.js";

const configuration: LegalPublicConfiguration = {
  readyForLivePayments: false,
  termsVersion: "2026-07-22",
  privacyVersion: "2026-07-22",
  withdrawalDays: 14,
  operatorName: "Example Operator",
  operatorAddress: "Example Street 1, Amsterdam",
  publicationDirector: "Example Publication Director",
  hostName: "Example Hosting Provider",
  hostAddress: "Host Street 3, Paris",
  hostPhone: "+33 1 00 00 00 00",
  contactEmail: "support@example.test",
  contactPhone: "+31 20 000 0000",
  privacyEmail: "privacy@example.test",
  withdrawalEmail: "withdrawal@example.test",
  franceMediatorName: "Example Consumer Mediator",
  franceMediatorAddress: "Mediator Street 2, Paris",
  franceMediatorUrl: "https://mediator.example.test",
  businessRegistrationStatus: "registered",
  businessRegistrationNumber: "12345678",
  vatStatus: "not_registered",
  vatId: null,
  legalRecordRetentionYears: 7,
  legalRecordRetentionBasisConfirmed: true,
  missingFields: [],
};

test("server-renders substantive localized legal text from the browser's single content source", async () => {
  const [template, script] = await Promise.all([
    readFile("public/terms.html", "utf8"),
    readFile("public/legal-content.js", "utf8"),
  ]);
  const content = parseLegalContentScript(script);
  const expectations = {
    en: ["Terms of service", "Operator and scope", "Example Operator"],
    nl: ["Gebruiksvoorwaarden", "Exploitant en toepassingsgebied", "Example Operator"],
    fr: ["Conditions d’utilisation", "Opérateur et champ", "Example Operator"],
    zh: ["服务条款", "经营者和适用范围", "Example Operator"],
  } as const;

  for (const [lang, expected] of Object.entries(expectations)) {
    const html = renderLegalDocument({
      template,
      content,
      pathname: "/terms.html",
      requestedLanguage: lang,
      configuration,
    });
    for (const phrase of expected) assert.match(html, new RegExp(phrase));
    assert.doesNotMatch(html, /<div class="legal-sections" data-sections><\/div>/);
    assert.match(html, new RegExp(`rel="canonical" href="https://airco-tracker.eu/terms.html\\?lang=${lang}"`));
    assert.match(html, new RegExp(`class="legal-brand" href="/\\?lang=${lang}"`));
  }
});

test("server-renders a localized, usable withdrawal fallback when JavaScript is disabled", async () => {
  const template = await readFile("public/withdrawal.html", "utf8");
  const html = renderWithdrawalDocument({
    template,
    requestedLanguage: "fr",
    configuration,
  });

  assert.match(html, /<html lang="fr" class="no-js">/);
  assert.match(html, /<title>Se rétracter et demander un remboursement · Airco Tracker<\/title>/);
  assert.match(html, /class="legal-brand" href="\/\?lang=fr"/);
  assert.match(html, /href="mailto:withdrawal@example\.test">withdrawal@example\.test<\/a>/);
  assert.match(html, /Se rétracter sans JavaScript/);
  assert.match(html, /href="\/terms\.html\?lang=fr"/);
});

test("legal pages do not publish the discontinued EU ODR platform link", async () => {
  const script = await readFile("public/legal-content.js", "utf8");
  assert.doesNotMatch(script, /ec\.europa\.eu\/consumers\/odr|online dispute resolution platform|ODR platform/i);
});

test("server-rendered legal pages interpolate the public phone and anchored retention period", async () => {
  const [termsTemplate, privacyTemplate, script] = await Promise.all([
    readFile("public/terms.html", "utf8"),
    readFile("public/privacy.html", "utf8"),
    readFile("public/legal-content.js", "utf8"),
  ]);
  const content = parseLegalContentScript(script);
  const terms = renderLegalDocument({
    template: termsTemplate,
    content,
    pathname: "/terms.html",
    requestedLanguage: "en",
    configuration,
  });
  const privacy = renderLegalDocument({
    template: privacyTemplate,
    content,
    pathname: "/privacy.html",
    requestedLanguage: "en",
    configuration,
  });

  assert.match(terms, /Telephone: \+31 20 000 0000/);
  assert.match(terms, /Example Consumer Mediator/);
  assert.match(terms, /https:\/\/mediator\.example\.test/);
  assert.match(privacy, /for 7 years from the latest legally relevant timestamp/);
  assert.doesNotMatch(`${terms}\n${privacy}`, /\{\{(?:contactPhone|legalRecordRetentionPeriod)\}\}/);
});

test("French legal notice publishes verified publication and hosting fields", async () => {
  const [template, script] = await Promise.all([
    readFile("public/imprint.html", "utf8"),
    readFile("public/legal-content.js", "utf8"),
  ]);
  const content = parseLegalContentScript(script);
  const html = renderLegalDocument({
    template,
    content,
    pathname: "/imprint.html",
    requestedLanguage: "fr",
    configuration,
  });

  assert.match(html, /Directeur de la publication : Example Publication Director/);
  assert.match(html, /Hébergeur/);
  assert.match(html, /Nom : Example Hosting Provider/);
  assert.match(html, /Adresse : Host Street 3, Paris/);
  assert.match(html, /Téléphone : \+33 1 00 00 00 00/);
  assert.doesNotMatch(html, /\{\{(?:publicationDirector|hostName|hostAddress|hostPhone)\}\}/);
});

test("legal notice uses explicit blocking copy instead of guessing missing host facts", async () => {
  const [template, script] = await Promise.all([
    readFile("public/imprint.html", "utf8"),
    readFile("public/legal-content.js", "utf8"),
  ]);
  const content = parseLegalContentScript(script);
  const html = renderLegalDocument({
    template,
    content,
    pathname: "/imprint.html",
    requestedLanguage: "en",
    configuration: {
      ...configuration,
      publicationDirector: null,
      hostName: null,
      hostAddress: null,
      hostPhone: null,
      missingFields: ["publicationDirector", "hostName", "hostAddress", "hostPhone"],
    },
  });

  assert.match(html, /publication director not configured — live checkout disabled/);
  assert.match(html, /hosting provider not configured — live checkout disabled/);
  assert.match(html, /hosting-provider address not configured — live checkout disabled/);
  assert.match(html, /hosting-provider telephone not configured — live checkout disabled/);
});
