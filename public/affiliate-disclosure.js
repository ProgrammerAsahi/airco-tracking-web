(() => {
  "use strict";

  const translations = {
    en: {
      titleTag: "Affiliate disclosure · Airco Tracker",
      description: "Airco Tracker affiliate disclosure for our De'Longhi link.",
      eyebrow: "Transparency",
      title: "Affiliate disclosure",
      lead: "The De’Longhi link on this page is an affiliate link.",
      details: "If you follow this link and complete a purchase, Airco Tracker may earn a commission from Sovrn, at no additional cost to you. This compensation does not affect our availability information or editorial decisions.",
      affiliateCta: "Visit De’Longhi — affiliate link",
      homeCta: "Back to Airco Tracker",
      summaryLabel: "Disclosure summary",
      summaryTitle: "Clear by design",
      summaryText: "We label commercial links so you can make an informed choice before leaving Airco Tracker.",
      footer: "Airco Tracker · Independent portable air-conditioner stock monitoring"
    },
    fr: {
      titleTag: "Information sur l’affiliation · Airco Tracker",
      description: "Information d’Airco Tracker concernant notre lien affilié De’Longhi.",
      eyebrow: "Transparence",
      title: "Information sur l’affiliation",
      lead: "Le lien De’Longhi présenté sur cette page est un lien affilié.",
      details: "Si vous suivez ce lien et effectuez un achat, Airco Tracker peut recevoir une commission de Sovrn, sans frais supplémentaires pour vous. Cette rémunération n’influence ni nos informations de disponibilité ni nos décisions éditoriales.",
      affiliateCta: "Visiter De’Longhi — lien affilié",
      homeCta: "Retour à Airco Tracker",
      summaryLabel: "Résumé de l’information",
      summaryTitle: "Une information claire",
      summaryText: "Nous signalons les liens commerciaux afin que vous puissiez faire un choix éclairé avant de quitter Airco Tracker.",
      footer: "Airco Tracker · Suivi indépendant des stocks de climatiseurs mobiles"
    },
    nl: {
      titleTag: "Affiliateverklaring · Airco Tracker",
      description: "De affiliateverklaring van Airco Tracker voor onze De’Longhi-link.",
      eyebrow: "Transparantie",
      title: "Affiliateverklaring",
      lead: "De De’Longhi-link op deze pagina is een affiliatelink.",
      details: "Als je deze link volgt en een aankoop doet, kan Airco Tracker een commissie van Sovrn ontvangen, zonder extra kosten voor jou. Deze vergoeding heeft geen invloed op onze beschikbaarheidsinformatie of redactionele keuzes.",
      affiliateCta: "Bezoek De’Longhi — affiliatelink",
      homeCta: "Terug naar Airco Tracker",
      summaryLabel: "Samenvatting van de verklaring",
      summaryTitle: "Helder uitgelegd",
      summaryText: "We markeren commerciële links, zodat je een geïnformeerde keuze kunt maken voordat je Airco Tracker verlaat.",
      footer: "Airco Tracker · Onafhankelijke voorraadmonitor voor mobiele airco’s"
    },
    zh: {
      titleTag: "推广联盟披露 · Airco Tracker",
      description: "Airco Tracker 关于 De’Longhi 推广联盟链接的披露说明。",
      eyebrow: "透明说明",
      title: "推广联盟披露",
      lead: "本页面中的 De’Longhi 链接是推广联盟链接。",
      details: "如果你通过该链接完成购买，Airco Tracker 可能会从 Sovrn 获得佣金，但你无需支付任何额外费用。此类报酬不会影响我们的库存信息或编辑决定。",
      affiliateCta: "访问 De’Longhi — 推广联盟链接",
      homeCta: "返回 Airco Tracker",
      summaryLabel: "披露摘要",
      summaryTitle: "清晰透明",
      summaryText: "我们会明确标注商业链接，让你在离开 Airco Tracker 前能够充分了解并自主选择。",
      footer: "Airco Tracker · 独立的便携空调库存监测服务"
    }
  };

  const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
  const language = Object.hasOwn(translations, requestedLanguage) ? requestedLanguage : "en";
  const copy = translations[language];

  document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  document.title = copy.titleTag;
  document.querySelector('meta[name="description"]').setAttribute("content", copy.description);

  document.querySelectorAll("[data-copy]").forEach((element) => {
    const key = element.getAttribute("data-copy");
    if (copy[key]) element.textContent = copy[key];
  });

  document.querySelectorAll("[data-copy-aria]").forEach((element) => {
    const key = element.getAttribute("data-copy-aria");
    if (copy[key]) element.setAttribute("aria-label", copy[key]);
  });

  document.querySelectorAll("[data-lang-link]").forEach((link) => {
    if (link.getAttribute("data-lang-link") === language) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
})();
