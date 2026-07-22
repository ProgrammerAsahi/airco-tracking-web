import type { Lang } from "./i18n";

const SITE_ORIGIN = "https://airco-tracker.eu";
const SOCIAL_IMAGE = `${SITE_ORIGIN}/media/hero-seine-heatwave-v1.jpg`;
const LANGUAGES: readonly Lang[] = ["zh", "nl", "en", "fr"];
const OG_LOCALES: Record<Lang, string> = {
  zh: "zh_CN",
  nl: "nl_NL",
  en: "en_GB",
  fr: "fr_FR",
};

type PageMetadata = {
  pathname: string;
  lang: Lang;
  indexable: boolean;
  title?: string;
  description?: string;
};

function ensureMeta(selector: string, attributes: Record<string, string>): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  if (existing) return existing;
  const element = document.createElement("meta");
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.head.append(element);
  return element;
}

function setNamedMeta(name: string, content: string): void {
  ensureMeta(`meta[name="${name}"]`, { name }).setAttribute("content", content);
}

function setPropertyMeta(property: string, content: string): void {
  ensureMeta(`meta[property="${property}"]`, { property }).setAttribute("content", content);
}

function removeManagedLinks(rel: string): void {
  document.head
    .querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"][data-airco-metadata]`)
    .forEach((element) => element.remove());
}

function appendManagedLink(rel: string, href: string, hrefLang?: string): void {
  const element = document.createElement("link");
  element.rel = rel;
  element.href = href;
  element.dataset.aircoMetadata = "true";
  if (hrefLang) element.hreflang = hrefLang;
  document.head.append(element);
}

function localizedUrl(pathname: string, lang: Lang): string {
  const url = new URL(pathname, SITE_ORIGIN);
  url.searchParams.set("lang", lang);
  return url.toString();
}

/** Keep route metadata synchronized in this client-routed application. */
export function setPageMetadata({
  pathname,
  lang,
  indexable,
  title,
  description,
}: PageMetadata): void {
  if (title) {
    document.title = title;
    setPropertyMeta("og:title", title);
    setNamedMeta("twitter:title", title);
  }
  if (description) {
    setNamedMeta("description", description);
    setPropertyMeta("og:description", description);
    setNamedMeta("twitter:description", description);
  }

  const robots = indexable
    ? "index, follow, max-image-preview:large"
    : "noindex, nofollow, noarchive";
  setNamedMeta("robots", robots);
  setNamedMeta("googlebot", robots);
  setPropertyMeta("og:type", "website");
  setPropertyMeta("og:site_name", "Airco Tracker");
  setPropertyMeta("og:locale", OG_LOCALES[lang]);
  setPropertyMeta("og:image", SOCIAL_IMAGE);
  setNamedMeta("twitter:card", "summary_large_image");
  setNamedMeta("twitter:image", SOCIAL_IMAGE);

  removeManagedLinks("canonical");
  removeManagedLinks("alternate");
  const currentUrl = localizedUrl(pathname, lang);
  setPropertyMeta("og:url", currentUrl);
  if (!indexable) return;

  appendManagedLink("canonical", currentUrl);
  for (const language of LANGUAGES) {
    appendManagedLink("alternate", localizedUrl(pathname, language), language === "zh" ? "zh-CN" : language);
  }
  appendManagedLink("alternate", localizedUrl(pathname, "en"), "x-default");
}
