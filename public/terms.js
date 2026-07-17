(() => {
  "use strict";

  const translations = {
    en: {
      titleTag: "Terms of service · Airco Tracker",
      description: "The terms that govern the use of Airco Tracker.",
      eyebrow: "Terms",
      title: "Terms of service",
      lead: "The rules for using Airco Tracker and buying a Heatwave Pass.",
      draftNotice: "Draft skeleton pending legal review. Every field marked [TODO: …] must be completed by the operator before this page is final.",
      s1Title: "1. The service",
      s1Body: "Airco Tracker monitors the stock of portable air conditioners at European retailers and provides stock-alert emails and a realtime inventory dashboard for models that can be delivered to your chosen country.",
      s2Title: "2. Passes and payment",
      s2Body: "Paid features are sold as one-time 90-day passes: the Heatwave Alerts Pass (€5) for stock-alert emails and the Heatwave Radar Pass (€10) which adds the realtime dashboard. Passes do not renew automatically and expire after 90 days. Prices include VAT [TODO: confirm VAT treatment]. Payment is processed by Stripe.",
      s3Title: "3. Right of withdrawal",
      s3Body: "As an EU consumer you normally have 14 days to withdraw from a distance contract. Because a pass is digital content supplied immediately, we ask for your express consent to start right away; once the digital service has begun with that consent, you acknowledge that you lose your right of withdrawal.",
      s4Title: "4. Refunds",
      s4Body: "[TODO: refund policy — state when, if ever, refunds are granted and how to request one.]",
      s5Title: "5. Availability and accuracy",
      s5Body: "Stock and price information comes from retailer websites and may lag behind reality. Airco Tracker does not guarantee that a product is in stock or available at the shown price. Always confirm availability, price, and delivery on the retailer's own site before ordering.",
      s6Title: "6. Liability",
      s6Body: "To the extent permitted by mandatory law, Airco Tracker is not liable for indirect damages or for losses resulting from outdated retailer information. [TODO: final liability wording]",
      s7Title: "7. Governing law",
      s7Body: "These terms are governed by [TODO: governing law, e.g. the law of the Netherlands]. [TODO: competent court or dispute forum]",
      s8Title: "8. Contact",
      s8Body: "Questions about these terms: [TODO: contact email].",
      homeCta: "Back to Airco Tracker",
      summaryLabel: "Pass summary",
      summaryTitle: "One-time, 90 days",
      summaryText: "No auto-renewal: every pass simply expires.",
      footer: "Airco Tracker · Independent portable air-conditioner stock monitoring"
    },
    fr: {
      titleTag: "Conditions d’utilisation · Airco Tracker",
      description: "Les conditions qui régissent l’utilisation d’Airco Tracker.",
      eyebrow: "Conditions",
      title: "Conditions d’utilisation",
      lead: "Les règles d’utilisation d’Airco Tracker et d’achat d’un pass canicule.",
      draftNotice: "Ébauche en attente de validation juridique. Chaque champ marqué [TODO: …] doit être complété par l’exploitant avant que cette page soit définitive.",
      s1Title: "1. Le service",
      s1Body: "Airco Tracker surveille les stocks de climatiseurs mobiles chez des revendeurs européens et propose des alertes de stock par e-mail ainsi qu’un tableau de bord des stocks en temps réel pour les modèles livrables dans le pays de votre choix.",
      s2Title: "2. Pass et paiement",
      s2Body: "Les fonctionnalités payantes sont vendues sous forme de pass de 90 jours à paiement unique : le Heatwave Alerts Pass (5 €) pour les alertes de stock par e-mail et le Heatwave Radar Pass (10 €) qui ajoute le tableau de bord en temps réel. Les pass ne se renouvellent pas automatiquement et expirent au bout de 90 jours. Les prix s’entendent TVA comprise [TODO: confirm VAT treatment]. Le paiement est traité par Stripe.",
      s3Title: "3. Droit de rétractation",
      s3Body: "En tant que consommateur de l’UE, vous disposez normalement d’un délai de 14 jours pour vous rétracter d’un contrat à distance. Un pass étant un contenu numérique fourni immédiatement, nous vous demandons votre consentement exprès pour commencer tout de suite ; une fois le service numérique commencé avec ce consentement, vous reconnaissez perdre votre droit de rétractation.",
      s4Title: "4. Remboursements",
      s4Body: "[TODO: refund policy — state when, if ever, refunds are granted and how to request one.]",
      s5Title: "5. Disponibilité et exactitude",
      s5Body: "Les informations de stock et de prix proviennent des sites des revendeurs et peuvent accuser un retard. Airco Tracker ne garantit ni la disponibilité d’un produit ni le prix affiché. Vérifiez toujours la disponibilité, le prix et la livraison sur le site du revendeur avant de commander.",
      s6Title: "6. Responsabilité",
      s6Body: "Dans la mesure où le droit impératif le permet, Airco Tracker n’est pas responsable des dommages indirects ni des pertes résultant d’informations de revendeurs obsolètes. [TODO: final liability wording]",
      s7Title: "7. Droit applicable",
      s7Body: "Les présentes conditions sont régies par [TODO: governing law, e.g. the law of the Netherlands]. [TODO: competent court or dispute forum]",
      s8Title: "8. Contact",
      s8Body: "Questions sur ces conditions : [TODO: contact email].",
      homeCta: "Retour à Airco Tracker",
      summaryLabel: "Résumé du pass",
      summaryTitle: "Paiement unique, 90 jours",
      summaryText: "Pas de renouvellement automatique : chaque pass expire simplement.",
      footer: "Airco Tracker · Suivi indépendant des stocks de climatiseurs mobiles"
    },
    nl: {
      titleTag: "Servicevoorwaarden · Airco Tracker",
      description: "De voorwaarden voor het gebruik van Airco Tracker.",
      eyebrow: "Voorwaarden",
      title: "Servicevoorwaarden",
      lead: "De regels voor het gebruik van Airco Tracker en het kopen van een Heatwave-pass.",
      draftNotice: "Concept op basis van een sjabloon, nog juridisch te beoordelen. Elk veld met de markering [TODO: …] moet door de exploitant worden ingevuld voordat deze pagina definitief is.",
      s1Title: "1. De dienst",
      s1Body: "Airco Tracker volgt de voorraad mobiele airco’s bij Europese winkels en biedt voorraadmeldingen per e-mail en een realtime voorraaddashboard voor modellen die in het door jou gekozen land kunnen worden bezorgd.",
      s2Title: "2. Passen en betaling",
      s2Body: "Betaalde functies worden verkocht als eenmalige passen van 90 dagen: de Heatwave Alerts Pass (€ 5) voor voorraadmeldingen per e-mail en de Heatwave Radar Pass (€ 10) met daarnaast het realtime dashboard. Passen worden niet automatisch verlengd en verlopen na 90 dagen. Prijzen zijn inclusief btw [TODO: confirm VAT treatment]. Betalingen worden verwerkt door Stripe.",
      s3Title: "3. Herroepingsrecht",
      s3Body: "Als consument in de EU heb je normaal gesproken 14 dagen bedenktijd bij een overeenkomst op afstand. Omdat een pas digitale inhoud is die direct wordt geleverd, vragen we je uitdrukkelijke toestemming om meteen te beginnen; zodra de digitale dienst met die toestemming is begonnen, erken je dat je je herroepingsrecht verliest.",
      s4Title: "4. Terugbetalingen",
      s4Body: "[TODO: refund policy — state when, if ever, refunds are granted and how to request one.]",
      s5Title: "5. Beschikbaarheid en nauwkeurigheid",
      s5Body: "Voorraad- en prijsinformatie komt van websites van winkels en kan achterlopen bij de werkelijkheid. Airco Tracker garandeert niet dat een product op voorraad is of tegen de getoonde prijs beschikbaar is. Controleer beschikbaarheid, prijs en bezorging altijd op de site van de winkel voordat je bestelt.",
      s6Title: "6. Aansprakelijkheid",
      s6Body: "Voor zover dwingend recht dat toestaat, is Airco Tracker niet aansprakelijk voor indirecte schade of voor verliezen als gevolg van verouderde winkelinformatie. [TODO: final liability wording]",
      s7Title: "7. Toepasselijk recht",
      s7Body: "Op deze voorwaarden is [TODO: governing law, e.g. the law of the Netherlands] van toepassing. [TODO: competent court or dispute forum]",
      s8Title: "8. Contact",
      s8Body: "Vragen over deze voorwaarden: [TODO: contact email].",
      homeCta: "Terug naar Airco Tracker",
      summaryLabel: "Samenvatting van de pas",
      summaryTitle: "Eenmalig, 90 dagen",
      summaryText: "Geen automatische verlenging: elke pas verloopt vanzelf.",
      footer: "Airco Tracker · Onafhankelijke voorraadmonitor voor mobiele airco’s"
    },
    zh: {
      titleTag: "用户协议 · Airco Tracker",
      description: "使用 Airco Tracker 的服务条款。",
      eyebrow: "条款",
      title: "用户协议",
      lead: "使用 Airco Tracker 及购买热浪通行证的规则。",
      draftNotice: "本页面为待法律审核的草稿骨架。所有以 [待填写:…] 标注的内容均需经营者补全后方可作为正式版本。",
      s1Title: "1. 服务内容",
      s1Body: "Airco Tracker 监测欧洲零售商的便携空调库存,为可配送到您所选国家的型号提供库存上架邮件提醒和实时库存面板。",
      s2Title: "2. 通行证与支付",
      s2Body: "付费功能以一次性 90 天通行证形式出售:Heatwave Alerts Pass(€5)提供库存邮件提醒;Heatwave Radar Pass(€10)在此基础上增加实时面板。通行证不自动续费,90 天后到期。价格含增值税 [待填写:确认增值税处理方式]。支付由 Stripe 处理。",
      s3Title: "3. 撤销权",
      s3Body: "作为欧盟消费者,您通常享有 14 天远程合同撤销权。由于通行证属于立即提供的数字内容,我们会请求您明确同意立即开始;在您作出该同意后数字服务一经开始,即视为您确认失去撤销权。",
      s4Title: "4. 退款",
      s4Body: "[待填写:退款政策——说明在何种情况下可以退款以及如何申请。]",
      s5Title: "5. 可用性与准确性",
      s5Body: "库存和价格信息来自零售商网站,可能滞后于实际情况。Airco Tracker 不保证商品一定有货或一定以所显示的价格出售。下单前请始终在零售商官网确认库存、价格和配送信息。",
      s6Title: "6. 责任限制",
      s6Body: "在强制性法律允许的范围内,Airco Tracker 不对间接损失或因零售商信息过时造成的损失承担责任。[待填写:最终责任条款措辞]",
      s7Title: "7. 适用法律",
      s7Body: "本条款受 [待填写:适用法律,例如荷兰法律] 管辖。[待填写:管辖法院或争议解决机构]",
      s8Title: "8. 联系方式",
      s8Body: "如对本条款有疑问,请联系 [待填写:联系邮箱]。",
      homeCta: "返回 Airco Tracker",
      summaryLabel: "通行证摘要",
      summaryTitle: "一次性购买,90 天有效",
      summaryText: "不自动续费:通行证到期即失效。",
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
