(function () {
  "use strict";

  var origin = "https://airco-tracker.eu";
  var supported = ["en", "nl", "fr", "zh"];
  var ogLocales = { en: "en_GB", nl: "nl_NL", fr: "fr_FR", zh: "zh_CN" };

  function ensureMeta(selector, attributes) {
    var existing = document.head.querySelector(selector);
    if (existing) return existing;
    var element = document.createElement("meta");
    Object.keys(attributes).forEach(function (key) { element.setAttribute(key, attributes[key]); });
    document.head.appendChild(element);
    return element;
  }

  function setNamedMeta(name, content) {
    ensureMeta('meta[name="' + name + '"]', { name: name }).setAttribute("content", content);
  }

  function setPropertyMeta(property, content) {
    ensureMeta('meta[property="' + property + '"]', { property: property }).setAttribute("content", content);
  }

  function localizedUrl(pathname, lang) {
    var url = new URL(pathname, origin);
    url.searchParams.set("lang", lang);
    return url.toString();
  }

  function appendLink(rel, href, hrefLang) {
    var link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    link.setAttribute("data-airco-legal-seo", "true");
    if (hrefLang) link.hreflang = hrefLang;
    document.head.appendChild(link);
  }

  function apply(options) {
    var lang = supported.indexOf(options.lang) >= 0 ? options.lang : "en";
    var indexable = options.indexable !== false;
    var currentUrl = localizedUrl(options.pathname, lang);
    var robots = indexable ? "index, follow" : "noindex, nofollow, noarchive";

    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
    document.title = options.title;
    setNamedMeta("description", options.description);
    setNamedMeta("robots", robots);
    setNamedMeta("googlebot", robots);
    setPropertyMeta("og:type", "website");
    setPropertyMeta("og:site_name", "Airco Tracker");
    setPropertyMeta("og:locale", ogLocales[lang]);
    setPropertyMeta("og:title", options.title);
    setPropertyMeta("og:description", options.description);
    setPropertyMeta("og:url", currentUrl);
    setNamedMeta("twitter:card", "summary");
    setNamedMeta("twitter:title", options.title);
    setNamedMeta("twitter:description", options.description);

    document.head.querySelectorAll('[data-airco-legal-seo="true"]').forEach(function (node) { node.remove(); });
    if (!indexable) return;
    appendLink("canonical", currentUrl);
    supported.forEach(function (alternateLang) {
      appendLink(
        "alternate",
        localizedUrl(options.pathname, alternateLang),
        alternateLang === "zh" ? "zh-CN" : alternateLang
      );
    });
    appendLink("alternate", localizedUrl(options.pathname, "en"), "x-default");
  }

  window.AIRCO_LEGAL_SEO = { apply: apply };
}());
