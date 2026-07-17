(() => {
  "use strict";

  const translations = {
    en: {
      titleTag: "Imprint · Airco Tracker",
      description: "Operator identification for Airco Tracker.",
      eyebrow: "Imprint",
      title: "Imprint",
      lead: "Legal identification of the operator of Airco Tracker.",
      draftNotice: "Draft skeleton pending legal review. Every field marked [TODO: …] must be completed by the operator before this page is final.",
      s1Title: "1. Operator",
      s1Body: "[TODO: operator legal name]",
      s2Title: "2. Address",
      s2Body: "[TODO: registered address]",
      s3Title: "3. Contact",
      s3Body: "Email: [TODO: contact email]",
      s4Title: "4. Registration",
      s4Body: "KvK (Dutch Chamber of Commerce): [TODO: KvK number]. VAT identification number: [TODO: VAT number].",
      s5Title: "5. Responsible person",
      s5Body: "[TODO: name of the person responsible for the content]",
      homeCta: "Back to Airco Tracker",
      summaryLabel: "Service note",
      summaryTitle: "Independent monitoring",
      summaryText: "Airco Tracker is an independent stock monitor and is not affiliated with the listed retailers.",
      footer: "Airco Tracker · Independent portable air-conditioner stock monitoring"
    },
    fr: {
      titleTag: "Mentions légales · Airco Tracker",
      description: "Identification de l’exploitant d’Airco Tracker.",
      eyebrow: "Mentions légales",
      title: "Mentions légales",
      lead: "Identification légale de l’exploitant d’Airco Tracker.",
      draftNotice: "Ébauche en attente de validation juridique. Chaque champ marqué [TODO: …] doit être complété par l’exploitant avant que cette page soit définitive.",
      s1Title: "1. Exploitant",
      s1Body: "[TODO: operator legal name]",
      s2Title: "2. Adresse",
      s2Body: "[TODO: registered address]",
      s3Title: "3. Contact",
      s3Body: "E-mail : [TODO: contact email]",
      s4Title: "4. Immatriculation",
      s4Body: "KvK (Chambre de commerce néerlandaise) : [TODO: KvK number]. Numéro d’identification TVA : [TODO: VAT number].",
      s5Title: "5. Personne responsable",
      s5Body: "[TODO: name of the person responsible for the content]",
      homeCta: "Retour à Airco Tracker",
      summaryLabel: "Note de service",
      summaryTitle: "Surveillance indépendante",
      summaryText: "Airco Tracker est un moniteur de stock indépendant et n’est pas affilié aux revendeurs mentionnés.",
      footer: "Airco Tracker · Suivi indépendant des stocks de climatiseurs mobiles"
    },
    nl: {
      titleTag: "Colofon · Airco Tracker",
      description: "Identificatie van de exploitant van Airco Tracker.",
      eyebrow: "Colofon",
      title: "Colofon",
      lead: "Wettelijke identificatie van de exploitant van Airco Tracker.",
      draftNotice: "Concept op basis van een sjabloon, nog juridisch te beoordelen. Elk veld met de markering [TODO: …] moet door de exploitant worden ingevuld voordat deze pagina definitief is.",
      s1Title: "1. Exploitant",
      s1Body: "[TODO: operator legal name]",
      s2Title: "2. Adres",
      s2Body: "[TODO: registered address]",
      s3Title: "3. Contact",
      s3Body: "E-mail: [TODO: contact email]",
      s4Title: "4. Registratie",
      s4Body: "KvK (Kamer van Koophandel): [TODO: KvK number]. Btw-identificatienummer: [TODO: VAT number].",
      s5Title: "5. Verantwoordelijke persoon",
      s5Body: "[TODO: name of the person responsible for the content]",
      homeCta: "Terug naar Airco Tracker",
      summaryLabel: "Servicenotitie",
      summaryTitle: "Onafhankelijke monitoring",
      summaryText: "Airco Tracker is een onafhankelijke voorraadmonitor en is niet verbonden aan de vermelde winkels.",
      footer: "Airco Tracker · Onafhankelijke voorraadmonitor voor mobiele airco’s"
    },
    zh: {
      titleTag: "网站信息 · Airco Tracker",
      description: "Airco Tracker 经营者信息公示。",
      eyebrow: "网站信息",
      title: "网站信息(Imprint)",
      lead: "Airco Tracker 经营者的法定身份信息。",
      draftNotice: "本页面为待法律审核的草稿骨架。所有以 [待填写:…] 标注的内容均需经营者补全后方可作为正式版本。",
      s1Title: "1. 经营者",
      s1Body: "[待填写:经营者名称]",
      s2Title: "2. 地址",
      s2Body: "[待填写:注册地址]",
      s3Title: "3. 联系方式",
      s3Body: "电子邮箱:[待填写:联系邮箱]",
      s4Title: "4. 注册信息",
      s4Body: "KvK(荷兰商会)注册号:[待填写:KvK 号码]。增值税识别号:[待填写:增值税号]。",
      s5Title: "5. 内容负责人",
      s5Body: "[待填写:内容负责人姓名]",
      homeCta: "返回 Airco Tracker",
      summaryLabel: "服务说明",
      summaryTitle: "独立监测",
      summaryText: "Airco Tracker 是独立的库存监测服务,与所列零售商无隶属关系。",
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
