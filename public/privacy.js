(() => {
  "use strict";

  const translations = {
    en: {
      titleTag: "Privacy policy · Airco Tracker",
      description: "How Airco Tracker processes personal data (GDPR Article 13 information).",
      eyebrow: "Privacy",
      title: "Privacy policy",
      lead: "How Airco Tracker collects, uses, and protects your personal data.",
      draftNotice: "Draft pending legal review. Every field marked [TODO: …] must be completed by the operator before this page is final. Version of 18 July 2026.",
      s1Title: "1. Controller",
      s1Body: "The controller of your personal data is [TODO: operator legal name], [TODO: registered address], reachable at [TODO: privacy contact email].",
      s2Title: "2. Data we process",
      s2Body: "Airco Tracker processes only the data needed to run the service: your email address (account and sign-in codes), your nickname, your language and delivery-country preferences, and — when you buy a pass — your payment card brand and last four digits plus your Stripe customer ID. Your IP address is used only in memory for rate limiting and is never stored; email verification codes expire after ten minutes. We do not use analytics or tracking cookies. The only cookie is the strictly necessary session cookie that keeps you signed in, and your language choice is stored in your browser's localStorage.",
      s3Title: "3. Purposes",
      s3Body: "We use this data to authenticate your account with one-time email codes, to grant and manage your paid pass, to send the stock-alert emails you asked for, and to show you the realtime inventory dashboard.",
      s4Title: "4. Legal bases",
      s4Body: "Processing is based on performance of the contract you enter with us (GDPR Art. 6(1)(b)), on our legitimate interest in operating and securing the service (Art. 6(1)(f)), and — where required — on your consent (Art. 6(1)(a)), which you can withdraw at any time.",
      s5Title: "5. Processors and international transfers",
      s5Body: "We use Microsoft Azure, including Azure Communication Services for email, hosted in EU regions (West Europe), and Stripe for payment processing. These providers process data on our behalf under data processing agreements. Azure-hosted data stays in the EU. Stripe is based in the United States, so limited payment-related data is transferred there under the EU standard contractual clauses included in Stripe's data processing agreement.",
      s6Title: "6. Retention",
      s6Body: "Alert outbox rows are deleted after 30 days and terminal email delivery rows after 90 days. Hard-bounce suppression stores only an irreversible fingerprint of the address, never the address itself. Account data is kept until you ask us to delete your account; deletion requests are honoured without undue delay.",
      s7Title: "7. Your rights",
      s7Body: "You have the right to access, rectify, or erase your data, to restrict or object to processing, and to data portability. You also have the right to lodge a complaint with the Dutch supervisory authority, the Autoriteit Persoonsgegevens. We do not use your data for automated decision-making or profiling.",
      s8Title: "8. Contact",
      s8Body: "For any privacy question or request, contact [TODO: privacy contact email].",
      homeCta: "Back to Airco Tracker",
      summaryLabel: "Privacy summary",
      summaryTitle: "No tracking, minimal data",
      summaryText: "No analytics cookies, no ad trackers — only the data needed to run your alerts.",
      footer: "Airco Tracker · Independent portable air-conditioner stock monitoring"
    },
    fr: {
      titleTag: "Politique de confidentialité · Airco Tracker",
      description: "Comment Airco Tracker traite vos données personnelles (information au titre de l’article 13 du RGPD).",
      eyebrow: "Confidentialité",
      title: "Politique de confidentialité",
      lead: "Comment Airco Tracker collecte, utilise et protège vos données personnelles.",
      draftNotice: "Ébauche en attente de validation juridique. Chaque champ marqué [TODO: …] doit être complété par l’exploitant avant que cette page soit définitive. Version du 18 juillet 2026.",
      s1Title: "1. Responsable du traitement",
      s1Body: "Le responsable du traitement de vos données personnelles est [TODO: operator legal name], [TODO: registered address], joignable à [TODO: privacy contact email].",
      s2Title: "2. Données traitées",
      s2Body: "Airco Tracker ne traite que les données nécessaires au service : votre adresse e-mail (compte et codes de connexion), votre pseudonyme, vos préférences de langue et de pays de livraison et — lorsque vous achetez un pass — la marque et les quatre derniers chiffres de votre carte de paiement ainsi que votre identifiant client Stripe. Votre adresse IP n’est utilisée qu’en mémoire pour la limitation de débit et n’est jamais stockée ; les codes de vérification e-mail expirent au bout de dix minutes. Nous n’utilisons aucun cookie d’analyse ou de suivi. Le seul cookie est le cookie de session strictement nécessaire qui vous maintient connecté ; votre choix de langue est conservé dans le localStorage de votre navigateur.",
      s3Title: "3. Finalités",
      s3Body: "Nous utilisons ces données pour authentifier votre compte avec des codes à usage unique envoyés par e-mail, attribuer et gérer votre pass payant, envoyer les alertes de stock que vous avez demandées et vous présenter le tableau de bord des stocks en temps réel.",
      s4Title: "4. Bases légales",
      s4Body: "Le traitement repose sur l’exécution du contrat conclu avec vous (RGPD art. 6(1)(b)), sur notre intérêt légitime à exploiter et sécuriser le service (art. 6(1)(f)) et — lorsque requis — sur votre consentement (art. 6(1)(a)), que vous pouvez retirer à tout moment.",
      s5Title: "5. Sous-traitants et transferts internationaux",
      s5Body: "Nous utilisons Microsoft Azure, y compris Azure Communication Services pour l’e-mail, hébergé dans des régions de l’UE (Europe de l’Ouest), et Stripe pour le traitement des paiements. Ces prestataires traitent les données pour notre compte dans le cadre d’accords de traitement des données. Les données hébergées par Azure restent dans l’UE. Stripe est établi aux États-Unis : des données de paiement limitées y sont transférées au titre des clauses contractuelles types de l’UE incluses dans son accord de traitement des données.",
      s6Title: "6. Durées de conservation",
      s6Body: "Les lignes de la boîte d’envoi d’alertes sont supprimées après 30 jours et les lignes de livraison d’e-mails terminées après 90 jours. La suppression des rebonds permanents ne conserve qu’une empreinte irréversible de l’adresse, jamais l’adresse elle-même. Les données du compte sont conservées jusqu’à ce que vous demandiez la suppression de votre compte ; les demandes de suppression sont traitées sans retard injustifié.",
      s7Title: "7. Vos droits",
      s7Body: "Vous disposez d’un droit d’accès, de rectification ou d’effacement de vos données, de limitation ou d’opposition au traitement, ainsi qu’à la portabilité des données. Vous avez également le droit d’introduire une réclamation auprès de l’autorité de contrôle néerlandaise, l’Autoriteit Persoonsgegevens. Vos données ne font l’objet d’aucune décision automatisée ni d’aucun profilage.",
      s8Title: "8. Contact",
      s8Body: "Pour toute question ou demande relative à la confidentialité, contactez [TODO: privacy contact email].",
      homeCta: "Retour à Airco Tracker",
      summaryLabel: "Résumé de la confidentialité",
      summaryTitle: "Aucun suivi, données minimales",
      summaryText: "Pas de cookies d’analyse ni de traceurs publicitaires — uniquement les données nécessaires à vos alertes.",
      footer: "Airco Tracker · Suivi indépendant des stocks de climatiseurs mobiles"
    },
    nl: {
      titleTag: "Privacyverklaring · Airco Tracker",
      description: "Hoe Airco Tracker persoonsgegevens verwerkt (AVG-artikel 13-informatie).",
      eyebrow: "Privacy",
      title: "Privacyverklaring",
      lead: "Hoe Airco Tracker je persoonsgegevens verzamelt, gebruikt en beschermt.",
      draftNotice: "Concept dat nog juridisch moet worden beoordeeld. Elk veld met de markering [TODO: …] moet door de exploitant worden ingevuld voordat deze pagina definitief is. Versie van 18 juli 2026.",
      s1Title: "1. Verwerkingsverantwoordelijke",
      s1Body: "De verwerkingsverantwoordelijke voor je persoonsgegevens is [TODO: operator legal name], [TODO: registered address], bereikbaar via [TODO: privacy contact email].",
      s2Title: "2. Gegevens die we verwerken",
      s2Body: "Airco Tracker verwerkt alleen de gegevens die nodig zijn om de dienst te leveren: je e-mailadres (account en inlogcodes), je bijnaam, je taal- en bezorglandvoorkeuren en — als je een pas koopt — het merk en de laatste vier cijfers van je betaalkaart plus je Stripe-klantnummer. Je IP-adres wordt alleen in het geheugen gebruikt voor snelheidsbeperking en wordt nooit opgeslagen; e-mailverificatiecodes verlopen na tien minuten. We gebruiken geen analytische of trackingcookies. De enige cookie is de strikt noodzakelijke sessiecookie waarmee je ingelogd blijft; je taalkeuze wordt in de localStorage van je browser bewaard.",
      s3Title: "3. Doeleinden",
      s3Body: "We gebruiken deze gegevens om je account te verifiëren met eenmalige e-mailcodes, je betaalde pas te verlenen en te beheren, de door jou gevraagde voorraadmeldingen te e-mailen en je het realtime voorraaddashboard te tonen.",
      s4Title: "4. Rechtsgronden",
      s4Body: "De verwerking is gebaseerd op de uitvoering van de overeenkomst met jou (AVG art. 6(1)(b)), op ons gerechtvaardigd belang bij het exploiteren en beveiligen van de dienst (art. 6(1)(f)) en — waar vereist — op je toestemming (art. 6(1)(a)), die je op elk moment kunt intrekken.",
      s5Title: "5. Verwerkers en internationale doorgifte",
      s5Body: "We gebruiken Microsoft Azure, inclusief Azure Communication Services voor e-mail, gehost in EU-regio’s (West-Europa), en Stripe voor betalingsverwerking. Deze partijen verwerken gegevens in onze opdracht op basis van verwerkersovereenkomsten. Bij Azure gehoste gegevens blijven in de EU. Stripe is gevestigd in de Verenigde Staten; beperkte betaalgegevens worden daar doorgegeven op grond van de EU-standaardcontractbepalingen in Stripes verwerkersovereenkomst.",
      s6Title: "6. Bewaartermijnen",
      s6Body: "Rijen in de meldings-outbox worden na 30 dagen verwijderd en definitieve e-mailafleveringsrijen na 90 dagen. Onderdrukking van harde bounces bewaart alleen een onomkeerbare vingerafdruk van het adres, nooit het adres zelf. Accountgegevens worden bewaard totdat je ons vraagt je account te verwijderen; verwijderingsverzoeken worden zonder onredelijke vertraging ingewilligd.",
      s7Title: "7. Je rechten",
      s7Body: "Je hebt recht op inzage, rectificatie of verwijdering van je gegevens, op beperking van en bezwaar tegen de verwerking, en op gegevensoverdraagbaarheid. Je hebt ook het recht een klacht in te dienen bij de Autoriteit Persoonsgegevens. Je gegevens worden niet gebruikt voor geautomatiseerde besluitvorming of profilering.",
      s8Title: "8. Contact",
      s8Body: "Voor privacyvragen of -verzoeken kun je contact opnemen via [TODO: privacy contact email].",
      homeCta: "Terug naar Airco Tracker",
      summaryLabel: "Privacysamenvatting",
      summaryTitle: "Geen tracking, minimale data",
      summaryText: "Geen analytische cookies, geen advertentietrackers — alleen de data die nodig is voor je meldingen.",
      footer: "Airco Tracker · Onafhankelijke voorraadmonitor voor mobiele airco’s"
    },
    zh: {
      titleTag: "隐私政策 · Airco Tracker",
      description: "Airco Tracker 如何处理您的个人数据（GDPR 第 13 条告知）。",
      eyebrow: "隐私",
      title: "隐私政策",
      lead: "Airco Tracker 如何收集、使用和保护您的个人数据。",
      draftNotice: "本页面为待法律审核的草稿。所有以 [待填写:…] 标注的内容均需经营者补全后方可作为正式版本。版本日期:2026 年 7 月 18 日。",
      s1Title: "1. 数据控制者",
      s1Body: "您的个人数据控制者为 [待填写:经营者名称],地址 [待填写:注册地址],联系方式 [待填写:隐私联系邮箱]。",
      s2Title: "2. 我们处理的数据",
      s2Body: "Airco Tracker 仅处理运行服务所必需的数据:您的邮箱地址(用于账号和登录验证码)、昵称、语言与配送国家偏好;购买通行证时还会保存支付卡品牌与后四位以及 Stripe 客户 ID。您的 IP 地址仅在内存中用于速率限制,从不存储;邮箱验证码十分钟后过期。我们不使用任何分析或跟踪 Cookie——唯一的 Cookie 是维持登录状态所必需的会话 Cookie;您的语言选择保存在浏览器 localStorage 中。",
      s3Title: "3. 处理目的",
      s3Body: "我们使用这些数据来:通过邮箱一次性验证码验证您的账号、授予并管理您的付费通行证、发送您订阅的库存提醒邮件,以及向您展示实时库存面板。",
      s4Title: "4. 法律依据",
      s4Body: "处理基于:履行与您订立的合同(GDPR 第 6(1)(b) 条);我们运营和保障服务安全的合法利益(第 6(1)(f) 条);以及在必要时经您同意(第 6(1)(a) 条),您可随时撤回同意。",
      s5Title: "5. 数据处理者与国际传输",
      s5Body: "我们使用托管于欧盟区域(西欧)的 Microsoft Azure(包括用于发送邮件的 Azure Communication Services),以及用于支付处理的 Stripe。这些服务商依据数据处理协议代表我们处理数据。Azure 托管的数据保存在欧盟境内。Stripe 位于美国,有限的支付相关数据会依据其数据处理协议中的欧盟标准合同条款传输至美国。",
      s6Title: "6. 保存期限",
      s6Body: "提醒发件箱记录在 30 天后删除,终态邮件投递记录在 90 天后删除。硬退信抑制只保存邮箱地址的不可逆指纹,绝不保存地址本身。账号数据保存至您请求删除账号为止;我们会在无不当延迟的情况下处理删除请求。",
      s7Title: "7. 您的权利",
      s7Body: "您有权访问、更正或删除您的数据,限制或反对处理,以及要求数据可携带。您还有权向荷兰监管机构 Autoriteit Persoonsgegevens(个人数据管理局)投诉。我们不会将您的数据用于自动化决策或用户画像。",
      s8Title: "8. 联系方式",
      s8Body: "如有任何隐私问题或请求,请联系 [待填写:隐私联系邮箱]。",
      homeCta: "返回 Airco Tracker",
      summaryLabel: "隐私摘要",
      summaryTitle: "无跟踪,最少数据",
      summaryText: "没有分析 Cookie,没有广告跟踪器——只保留运行提醒服务所需的数据。",
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
