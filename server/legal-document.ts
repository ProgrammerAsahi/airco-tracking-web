import vm from "node:vm";
import type { LegalPublicConfiguration } from "./legal.js";

const SUPPORTED_LANGUAGES = ["en", "nl", "fr", "zh"] as const;
type LegalLanguage = typeof SUPPORTED_LANGUAGES[number];
type LegalPage = "terms" | "privacy" | "affiliate" | "imprint";

type LegalCommon = Record<string, string> & {
  brand: string;
  back: string;
  withdraw: string;
  effective: string;
  incomplete: string;
};

type LegalPageContent = {
  eyebrow: string;
  title: string;
  lead: string;
  sections: Array<[string, string]>;
};

type LegalLocaleContent = {
  common: LegalCommon;
  pages: Record<LegalPage, LegalPageContent>;
};

type LegalContent = Record<LegalLanguage, LegalLocaleContent>;

const PAGE_BY_PATH: Record<string, LegalPage> = {
  "/terms.html": "terms",
  "/privacy.html": "privacy",
  "/affiliate-disclosure.html": "affiliate",
  "/imprint.html": "imprint",
};

const OG_LOCALES: Record<LegalLanguage, string> = {
  en: "en_GB",
  nl: "nl_NL",
  fr: "fr_FR",
  zh: "zh_CN",
};

const WITHDRAWAL_METADATA: Record<LegalLanguage, { title: string; description: string }> = {
  en: {
    title: "Withdraw and request a refund",
    description: "Withdraw from an Airco Tracker purchase within 14 days and request a full refund.",
  },
  nl: {
    title: "Herroepen en terugbetaling vragen",
    description: "Herroep een Airco Tracker-aankoop binnen 14 dagen en vraag een volledige terugbetaling.",
  },
  fr: {
    title: "Se rétracter et demander un remboursement",
    description: "Rétractez-vous d’un achat Airco Tracker sous 14 jours et demandez un remboursement intégral.",
  },
  zh: {
    title: "撤回购买并申请退款",
    description: "在 14 天内撤回 Airco Tracker 购买并申请全额退款。",
  },
};

export function isServerRenderedLegalPath(pathname: string): boolean {
  return pathname in PAGE_BY_PATH;
}

export function parseLegalContentScript(script: string): LegalContent {
  const context: { window: { AIRCO_LEGAL_CONTENT?: LegalContent } } = { window: {} };
  vm.runInNewContext(script, context, { timeout: 100, filename: "legal-content.js" });
  const content = context.window.AIRCO_LEGAL_CONTENT;
  if (!content || !SUPPORTED_LANGUAGES.every((lang) => content[lang])) {
    throw new Error("Legal content is incomplete");
  }
  return content;
}

export function renderLegalDocument(options: {
  template: string;
  content: LegalContent;
  pathname: string;
  requestedLanguage: string | null;
  configuration: LegalPublicConfiguration;
}): string {
  const page = PAGE_BY_PATH[options.pathname];
  if (!page) return options.template;

  const lang = isLegalLanguage(options.requestedLanguage) ? options.requestedLanguage : "en";
  const localized = options.content[lang];
  const common = localized.common;
  const pageContent = localized.pages[page] ?? options.content.en.pages[page];
  const replaceValues = legalReplaceValues(options.configuration, common);
  const replaceLegalValues = (value: string) => value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => replaceValues[key] ?? "");
  const title = `${pageContent.title} · Airco Tracker`;
  const description = replaceLegalValues(pageContent.lead);
  const version = page === "privacy" ? options.configuration.privacyVersion : options.configuration.termsVersion;
  const sections = pageContent.sections.map(([heading, body]) => (
    `<section class="legal-section"><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(replaceLegalValues(body))}</p></section>`
  )).join("");

  let html = options.template;
  html = html.replace(/<html\s+lang="[^"]*">/, `<html lang="${lang === "zh" ? "zh-CN" : lang}">`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*">/, `<meta name="description" content="${escapeHtmlAttribute(description)}">`);
  html = replaceDataText(html, "brand", common.brand);
  html = replaceDataText(html, "back", common.back);
  html = replaceDataText(html, "withdraw", common.withdraw);
  html = replaceDataText(html, "eyebrow", pageContent.eyebrow);
  html = replaceDataText(html, "title", pageContent.title);
  html = replaceDataText(html, "lead", description);
  html = replaceDataText(html, "version", `${common.effective}: ${version}`);
  html = replaceDataText(html, "warning", common.incomplete);
  html = html.replace(/<div class="legal-sections" data-sections>.*?<\/div>/s, `<div class="legal-sections" data-sections>${sections}</div>`);
  html = localizeNavigation(html, options.pathname, lang);
  html = html.replace(/(<a\s+class="legal-brand"\s+href=")[^"]*(")/, `$1/?lang=${lang}$2`);
  html = html.replace(/(<a\s+class="legal-button"\s+data-back\s+href=")[^"]*(")/, `$1/?lang=${lang}$2`);
  html = html.replace(/(<a\s+class="legal-button legal-button--primary"\s+data-withdraw\s+href=")[^"]*(")/, `$1/withdrawal.html?lang=${lang}$2`);
  if (options.configuration.readyForLivePayments) {
    html = html.replace(/<p class="legal-warning" data-warning>/, '<p class="legal-warning" data-warning hidden>');
  }
  html = html.replace("</head>", `${seoMarkup(options.pathname, lang, title, description)}</head>`);
  return html;
}

export function renderWithdrawalDocument(options: {
  template: string;
  requestedLanguage: string | null;
  configuration: LegalPublicConfiguration;
}): string {
  const lang = isLegalLanguage(options.requestedLanguage) ? options.requestedLanguage : "en";
  const metadata = WITHDRAWAL_METADATA[lang];
  const contact = options.configuration.withdrawalEmail || options.configuration.contactEmail || "";
  let html = options.template;
  html = html.replace(/<html\s+lang="[^"]*"/, `<html lang="${lang === "zh" ? "zh-CN" : lang}"`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(metadata.title)} · Airco Tracker</title>`);
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*">/, `<meta name="description" content="${escapeHtmlAttribute(metadata.description)}">`);
  html = localizeNavigation(html, "/withdrawal.html", lang);
  html = html.replace(/(<a\s+class="legal-brand"\s+href=")[^"]*(")/, `$1/?lang=${lang}$2`);
  html = html.replace(/(<a\s+class="legal-button"\s+id="withdrawal-terms"\s+href=")[^"]*(")/, `$1/terms.html?lang=${lang}$2`);
  html = html.replace(/(<a\s+class="legal-button"\s+id="withdrawal-home"\s+href=")[^"]*(")/, `$1/?lang=${lang}$2`);
  html = html
    .replaceAll("{{withdrawalEmailAttribute}}", escapeHtmlAttribute(contact))
    .replaceAll("{{withdrawalEmailText}}", escapeHtml(contact));
  return html;
}

function isLegalLanguage(value: string | null): value is LegalLanguage {
  return value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function legalReplaceValues(configuration: LegalPublicConfiguration, common: LegalCommon): Record<string, string> {
  const notConfigured = (key: string) => common[key] || common.statusNotConfigured || "not configured";
  return {
    operatorName: configuration.operatorName || notConfigured("operatorNotConfigured"),
    operatorAddress: configuration.operatorAddress || notConfigured("addressNotConfigured"),
    publicationDirector: configuration.publicationDirector || notConfigured("publicationDirectorNotConfigured"),
    hostName: configuration.hostName || notConfigured("hostNotConfigured"),
    hostAddress: configuration.hostAddress || notConfigured("hostAddressNotConfigured"),
    hostPhone: configuration.hostPhone || notConfigured("hostPhoneNotConfigured"),
    contactEmail: configuration.contactEmail || notConfigured("contactNotConfigured"),
    contactPhone: configuration.contactPhone || notConfigured("phoneNotConfigured"),
    privacyEmail: configuration.privacyEmail || notConfigured("privacyContactNotConfigured"),
    withdrawalEmail: configuration.withdrawalEmail || notConfigured("withdrawalContactNotConfigured"),
    franceMediator: franceMediator(configuration, common),
    registration: registration(configuration, common),
    vat: vat(configuration, common),
    legalRecordRetentionPeriod: retentionPeriod(configuration, common),
  };
}

function franceMediator(configuration: LegalPublicConfiguration, common: LegalCommon): string {
  if (!configuration.franceMediatorName || !configuration.franceMediatorAddress || !configuration.franceMediatorUrl) {
    return common.mediatorNotConfigured;
  }
  return [configuration.franceMediatorName, configuration.franceMediatorAddress, configuration.franceMediatorUrl].join(", ");
}

function registration(configuration: LegalPublicConfiguration, common: LegalCommon): string {
  if (configuration.businessRegistrationStatus === "registered") {
    return configuration.businessRegistrationNumber
      || `${common.registrationRegistered} (${common.registrationNumberNotPublished})`;
  }
  if (configuration.businessRegistrationStatus === "exempt_confirmed") return common.registrationExempt;
  if (configuration.businessRegistrationStatus === "not_registered") return common.registrationBlocked;
  return common.statusNotConfigured;
}

function vat(configuration: LegalPublicConfiguration, common: LegalCommon): string {
  if (configuration.vatStatus === "registered") {
    return configuration.vatId || `${common.vatRegistered} (${common.vatIdNotPublished})`;
  }
  if (configuration.vatStatus === "not_registered") return common.vatNotRegistered;
  return common.statusNotConfigured;
}

function retentionPeriod(configuration: LegalPublicConfiguration, common: LegalCommon): string {
  if (
    configuration.legalRecordRetentionBasisConfirmed
    && (configuration.legalRecordRetentionYears === 7 || configuration.legalRecordRetentionYears === 10)
  ) {
    return `${configuration.legalRecordRetentionYears} ${common.years || "years"}`;
  }
  return common.retentionNotConfigured || common.statusNotConfigured;
}

function replaceDataText(html: string, attribute: string, value: string): string {
  const pattern = new RegExp(`(<([a-z][a-z0-9]*)\\b[^>]*\\sdata-${attribute}(?:="[^"]*")?[^>]*>).*?(<\\/\\2>)`, "is");
  return html.replace(pattern, `$1${escapeHtml(value)}$3`);
}

function localizeNavigation(html: string, pathname: string, current: LegalLanguage): string {
  let result = html;
  for (const lang of SUPPORTED_LANGUAGES) {
    const pattern = new RegExp(`<a\\s+data-lang="${lang}"[^>]*>`, "i");
    const currentAttribute = lang === current ? ' aria-current="page"' : "";
    result = result.replace(pattern, `<a data-lang="${lang}" href="${pathname}?lang=${lang}"${currentAttribute}>`);
  }
  return result;
}

function seoMarkup(pathname: string, lang: LegalLanguage, title: string, description: string): string {
  const origin = "https://airco-tracker.eu";
  const localizedUrl = (next: LegalLanguage) => `${origin}${pathname}?lang=${next}`;
  const alternates = SUPPORTED_LANGUAGES.map((next) => (
    `<link rel="alternate" hreflang="${next === "zh" ? "zh-CN" : next}" href="${localizedUrl(next)}" data-airco-legal-seo="true">`
  )).join("");
  return [
    '<meta name="robots" content="index, follow">',
    '<meta name="googlebot" content="index, follow">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Airco Tracker">',
    `<meta property="og:locale" content="${OG_LOCALES[lang]}">`,
    `<meta property="og:title" content="${escapeHtmlAttribute(title)}">`,
    `<meta property="og:description" content="${escapeHtmlAttribute(description)}">`,
    `<meta property="og:url" content="${localizedUrl(lang)}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${escapeHtmlAttribute(title)}">`,
    `<meta name="twitter:description" content="${escapeHtmlAttribute(description)}">`,
    `<link rel="canonical" href="${localizedUrl(lang)}" data-airco-legal-seo="true">`,
    alternates,
    `<link rel="alternate" hreflang="x-default" href="${localizedUrl("en")}" data-airco-legal-seo="true">`,
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll("\n", " ");
}
