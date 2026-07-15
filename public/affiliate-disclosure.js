(() => {
  "use strict";

  const translations = {
    en: {
      titleTag: "Affiliate disclosure · Airco Tracker",
      description: "How Airco Tracker uses affiliate links to some merchants.",
      eyebrow: "Transparency",
      title: "Affiliate disclosure",
      lead: "Some merchant links on Airco Tracker may be affiliate links.",
      details: "If you follow one of these links and complete a purchase, Airco Tracker may earn a commission. This does not add to or change the price you pay, and it does not influence our availability information or editorial decisions.",
      homeCta: "Back to Airco Tracker",
      summaryLabel: "Disclosure summary",
      summaryTitle: "Clear by design",
      summaryText: "We label commercial links so you can make an informed choice before leaving Airco Tracker.",
      footer: "Airco Tracker · Independent portable air-conditioner stock monitoring"
    },
    fr: {
      titleTag: "Information sur l’affiliation · Airco Tracker",
      description: "Comment Airco Tracker utilise des liens affiliés vers certains marchands.",
      eyebrow: "Transparence",
      title: "Information sur l’affiliation",
      lead: "Certains liens vers des marchands sur Airco Tracker peuvent être des liens affiliés.",
      details: "Si vous suivez l’un de ces liens et effectuez un achat, Airco Tracker peut recevoir une commission. Cela n’ajoute aucun coût et ne modifie pas le prix que vous payez, et n’influence ni nos informations de disponibilité ni nos décisions éditoriales.",
      homeCta: "Retour à Airco Tracker",
      summaryLabel: "Résumé de l’information",
      summaryTitle: "Une information claire",
      summaryText: "Nous signalons les liens commerciaux afin que vous puissiez faire un choix éclairé avant de quitter Airco Tracker.",
      footer: "Airco Tracker · Suivi indépendant des stocks de climatiseurs mobiles"
    },
    nl: {
      titleTag: "Affiliateverklaring · Airco Tracker",
      description: "Hoe Airco Tracker affiliatelinks naar sommige winkels gebruikt.",
      eyebrow: "Transparantie",
      title: "Affiliateverklaring",
      lead: "Sommige links naar winkels op Airco Tracker kunnen affiliatelinks zijn.",
      details: "Als je een van deze links volgt en een aankoop doet, kan Airco Tracker een commissie ontvangen. Dit verhoogt of verandert de prijs die je betaalt niet en heeft geen invloed op onze beschikbaarheidsinformatie of redactionele keuzes.",
      homeCta: "Terug naar Airco Tracker",
      summaryLabel: "Samenvatting van de verklaring",
      summaryTitle: "Helder uitgelegd",
      summaryText: "We markeren commerciële links, zodat je een geïnformeerde keuze kunt maken voordat je Airco Tracker verlaat.",
      footer: "Airco Tracker · Onafhankelijke voorraadmonitor voor mobiele airco’s"
    },
    zh: {
      titleTag: "推广联盟披露 · Airco Tracker",
      description: "Airco Tracker 关于部分商家推广联盟链接的披露说明。",
      eyebrow: "透明说明",
      title: "推广联盟披露",
      lead: "Airco Tracker 上的部分商家链接可能是推广联盟链接。",
      details: "如果您通过其中一个链接完成购买，Airco Tracker 可能会获得佣金。这不会增加或改变您支付的价格，也不会影响我们的库存信息或编辑决定。",
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
