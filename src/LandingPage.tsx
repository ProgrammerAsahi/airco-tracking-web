import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AuthApiError,
  getCurrentUser,
  logout,
  requestAuthCode,
  updateNickname,
  userInitials,
  verifyAuthCode,
  type UserProfile,
} from "./authClient";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { entitlementIsActive } from "../shared/auth";
import type { Lang } from "./i18n";
import { AircoLogoMark } from "./AircoLogoMark";
import { LandingHeroVisual } from "./LandingHeroVisual";
import { LandingStoryVisual } from "./LandingStoryVisual";
import { LandingTrackerVisual } from "./LandingTrackerVisual";
import { LandingFinaleVisual } from "./LandingFinaleVisual";

type LandingCopy = {
  productName: string;
  pageTitle: string;
  pageDescription: string;
  navigationLabel: string;
  statusLabel: string;
  navStory: string;
  navProduct: string;
  navPreview: string;
  heroEyebrow: string;
  heroTitle: string;
  heroLead: string;
  primaryCta: string;
  secondaryCta: string;
  scrollCue: string;
  stepOneKicker: string;
  stepOneTitle: string;
  stepOneBody: string;
  stepTwoKicker: string;
  stepTwoTitle: string;
  stepTwoBody: string;
  stepThreeKicker: string;
  stepThreeTitle: string;
  stepThreeBody: string;
  stepFourAlertKicker: string;
  stepFourAlertTitle: string;
  stepFourAlertBody: string;
  trackerAlertStatus: string;
  trackerAlertSubject: string;
  trackerOverviewLabel: string;
  trackerCountryLabel: string;
  trackerCountryValue: string;
  trackerAvailabilityLabel: string;
  trackerAvailabilityValue: string;
  trackerRetailerLabel: string;
  trackerRetailerValue: string;
  trackerModelLabel: string;
  trackerModelValue: string;
  trackerPriceLabel: string;
  trackerPriceValue: string;
  productKicker: string;
  productTitle: string;
  productBody: string;
  finaleKicker: string;
  subscribeTitle: string;
  subscribeBody: string;
  subscribeNotice: string;
  loginTitle: string;
  loginSubtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  codeLabel: string;
  codePlaceholder: string;
  sendCode: string;
  sendCodeBusy: string;
  loginSubmit: string;
  loginBusy: string;
  socialDivider: string;
  loginWithGoogle: string;
  loginWithApple: string;
  loginWithMicrosoft: string;
  loginFinePrint: string;
  loginPreviewNotice: string;
  closeLogin: string;
  codeSent: string;
  codeCooldown: string;
  devCodeNotice: string;
  authErrorInvalidEmail: string;
  authErrorInvalidCode: string;
  authErrorTooMany: string;
  authErrorEmailFailed: string;
  authErrorGeneric: string;
  nicknameTitle: string;
  nicknameSubtitle: string;
  nicknameLabel: string;
  nicknamePlaceholder: string;
  nicknameSubmit: string;
  nicknameSaving: string;
  nicknameError: string;
  accountMenu: string;
  signedInAs: string;
  profile: string;
  logout: string;
  socialComingSoon: string;
  previewNl: string;
  statSites: string;
  statCountries: string;
  statRefresh: string;
};

const LANDING_COPY: Record<Lang, LandingCopy> = {
  zh: {
    productName: "Airco Tracker",
    pageTitle: "欧洲空调库存雷达",
    pageDescription: "Airco Tracker 持续追踪欧洲零售商的便携空调库存。",
    navigationLabel: "Airco Tracker 主导航",
    statusLabel: "Airco Tracker 追踪状态",
    navStory: "热浪现场",
    navProduct: "产品",
    navPreview: "库存演示",
    heroEyebrow: "欧洲空调库存追踪",
    heroTitle: "欧洲罕见<br />热浪来袭。",
    heroLead: "当塞纳河畔被晒到发烫，空调库存却在一小时内消失。Airco Tracker 帮你第一时间发现还能配送到你所在国家的现货。",
    primaryCta: "购买通行证",
    secondaryCta: "预览法国库存",
    scrollCue: "向下滚动，进入热浪现场",
    stepOneKicker: "Paris · 38°C",
    stepOneTitle: "太阳把城市烤成了烤箱。",
    stepOneBody: "河面反着刺眼的白光，石墙滚烫，行人像被按下慢放键。最热的那几天，空调不只是舒适品，而是家里能不能睡着的分界线。",
    stepTwoKicker: "巴黎老宅 · 室内 34°C",
    stepTwoTitle: "窗户开着，<br />热气却散不出去。",
    stepTwoBody: "风扇只能搅动闷热的空气，厚重的石墙到了夜里仍在释放白天积下的热。这样的热浪里，空调不再是奢侈品，而是能让人好好休息的必需品。",
    stepThreeKicker: "现货提醒 · 实时雷达",
    stepThreeTitle: "让现货先找到你。<br />让清凉随后到家。",
    stepThreeBody: "Airco Tracker 持续追踪能配送到你所在国家的网站，并自动区分现货与预售。<br />空调一上架，我们就立即通知你。",
    stepFourAlertKicker: "库存上架 · 邮件提醒",
    stepFourAlertTitle: "不用守着刷新。<br />现货会主动来找你。",
    stepFourAlertBody: "当能配送到你所在国家的便携空调重新上架，Airco Tracker 会立即发出邮件提醒。点开通知，就能直接查看商家和型号。",
    trackerAlertStatus: "刚刚收到",
    trackerAlertSubject: "1 台便携空调恢复库存",
    trackerOverviewLabel: "实时库存预览",
    trackerCountryLabel: "配送国家",
    trackerCountryValue: "法国",
    trackerAvailabilityLabel: "库存状态",
    trackerAvailabilityValue: "现货 7 · 预售 5",
    trackerRetailerLabel: "商家",
    trackerRetailerValue: "Rue du Commerce",
    trackerModelLabel: "型号",
    trackerModelValue: "Tristar AT-5468",
    trackerPriceLabel: "价格",
    trackerPriceValue: "€244.74",
    productKicker: "实时库存 · 一眼看清",
    productTitle: "能不能送、<br />现在能不能买，<br />一眼看清。",
    productBody: "配送国家、现货与预售、商家、型号和价格都在同一个视图里。少一点搜索，多一点抢到现货的把握。",
    finaleKicker: "夜色降临 · 清凉仍在",
    subscribeTitle: "清凉一夏，<br />从少刷新一次页面开始。",
    subscribeBody: "选择 Heatwave Alerts Pass 或 Heatwave Radar Pass，通过 Stripe 一次性安全支付，获得 90 天库存追踪服务。",
    subscribeNotice: "登录后即可购买热浪通行证。房间已经开始降温了。",
    loginTitle: "登录后开启清凉雷达",
    loginSubtitle: "输入邮箱获取验证码，登录后即可选择一次性热浪通行证并开启库存提醒。",
    emailLabel: "邮箱",
    emailPlaceholder: "you@example.com",
    codeLabel: "验证码",
    codePlaceholder: "输入 6 位验证码",
    sendCode: "发送验证码",
    sendCodeBusy: "发送中…",
    loginSubmit: "登录 / 继续购买",
    loginBusy: "登录中…",
    socialDivider: "或使用第三方账号继续",
    loginWithGoogle: "Google",
    loginWithApple: "Apple",
    loginWithMicrosoft: "Microsoft",
    loginFinePrint: "继续即表示你同意用户协议和隐私政策。",
    loginPreviewNotice: "邮箱验证码和热浪通行证一次性支付已接入；第三方登录即将开放。",
    closeLogin: "关闭登录弹窗",
    codeSent: "验证码已发送，请检查你的邮箱。",
    codeCooldown: "验证码刚刚发送过，请 {seconds} 秒后再试。",
    devCodeNotice: "本地开发验证码：{code}",
    authErrorInvalidEmail: "请填写一个有效的邮箱地址。",
    authErrorInvalidCode: "验证码无效或已过期，请重新检查或再发一次。",
    authErrorTooMany: "尝试次数太多，请重新发送验证码。",
    authErrorEmailFailed: "验证码邮件暂时发送失败，请稍后再试。",
    authErrorGeneric: "登录服务暂时不可用，请稍后再试。",
    nicknameTitle: "我们该如何称呼你？",
    nicknameSubtitle: "只需要一个昵称。它会用于你的头像和之后的个性化提示。",
    nicknameLabel: "昵称",
    nicknamePlaceholder: "我们该如何称呼您呢？",
    nicknameSubmit: "保存昵称",
    nicknameSaving: "保存中…",
    nicknameError: "昵称需要 1–40 个字符，且至少包含一个文字或数字。",
    accountMenu: "打开账号菜单",
    signedInAs: "已登录：{email}",
    profile: "个人资料",
    logout: "登出",
    socialComingSoon: "即将接入",
    previewNl: "预览荷兰库存",
    statSites: "45+ 网站",
    statCountries: "法国 / 荷兰",
    statRefresh: "约 10 分钟刷新",
  },
  nl: {
    productName: "Airco Tracker",
    pageTitle: "Europese radar voor airco-voorraad",
    pageDescription: "Airco Tracker volgt doorlopend de voorraad van mobiele airco’s bij Europese winkels.",
    navigationLabel: "Hoofdnavigatie van Airco Tracker",
    statusLabel: "Status van Airco Tracker",
    navStory: "Hittegolf",
    navProduct: "Product",
    navPreview: "Voorraad demo",
    heroEyebrow: "Airco-voorraad voor Europa",
    heroTitle: "Een zeldzame hittegolf raakt Europa.",
    heroLead: "Terwijl de kades langs de Seine gloeien, verdwijnt airco-voorraad soms binnen een uur. Airco Tracker laat zien welke winkels nog naar jouw land leveren.",
    primaryCta: "Koop een pas",
    secondaryCta: "Bekijk Frankrijk",
    scrollCue: "Scroll omlaag voor de hitte",
    stepOneKicker: "Paris · 38°C",
    stepOneTitle: "De stad voelt als een oven.",
    stepOneBody: "Het rivierlicht is fel, de stenen houden warmte vast en iedereen beweegt trager. Op zulke dagen is een mobiele airco ineens geen luxe meer.",
    stepTwoKicker: "Oud appartement in Parijs · 34 °C binnen",
    stepTwoTitle: "Het raam staat open.<br />De hitte blijft hangen.",
    stepTwoBody: "De ventilator verplaatst alleen de benauwde lucht, terwijl de oude stenen muren de warmte tot lang na zonsondergang blijven afgeven. Tijdens zo’n hittegolf is een airco geen luxe meer, maar essentieel om echt tot rust te komen.",
    stepThreeKicker: "Voorraadmeldingen · live radar",
    stepThreeTitle: "Laat voorraad jou vinden.<br />De verkoeling<br />volgt vanzelf.",
    stepThreeBody: "Airco Tracker volgt winkels die in jouw land bezorgen en scheidt voorraad van pre-orders.<br />Zodra een airco beschikbaar is, laten we het je weten.",
    stepFourAlertKicker: "Terug op voorraad · e-mailmelding",
    stepFourAlertTitle: "Je hoeft niet te blijven vernieuwen.<br />De voorraad vindt jou.",
    stepFourAlertBody: "Zodra een mobiele airco die in jouw land kan worden bezorgd weer beschikbaar is, stuurt Airco Tracker direct een e-mail. Via de melding ga je rechtstreeks naar de winkel en het juiste model.",
    trackerAlertStatus: "Zojuist ontvangen",
    trackerAlertSubject: "1 mobiele airco weer op voorraad",
    trackerOverviewLabel: "Voorbeeld van live voorraad",
    trackerCountryLabel: "Bezorgland",
    trackerCountryValue: "Frankrijk",
    trackerAvailabilityLabel: "Voorraadstatus",
    trackerAvailabilityValue: "Op voorraad 7 · Pre-order 5",
    trackerRetailerLabel: "Winkel",
    trackerRetailerValue: "Rue du Commerce",
    trackerModelLabel: "Model",
    trackerModelValue: "Tristar AT-5468",
    trackerPriceLabel: "Prijs",
    trackerPriceValue: "€ 244,74",
    productKicker: "Realtime voorraad · in één oogopslag",
    productTitle: "Bezorging, status<br />en prijs.<br />Alles in één beeld.",
    productBody: "Bezorgland, voorraad en pre-orders, winkel, model en prijs staan in één overzicht. Minder zoeken, meer kans om echte voorraad op tijd te vinden.",
    finaleKicker: "De avond valt · de kamer blijft koel",
    subscribeTitle: "Een koelere zomer begint<br />met minder refreshen.",
    subscribeBody: "Kies de Heatwave Alerts Pass of Heatwave Radar Pass en betaal één keer veilig via Stripe voor 90 dagen voorraadtracking.",
    subscribeNotice: "Log in om een Heatwave-pass te kopen. De kamer koelt alvast af.",
    loginTitle: "Log in voor je koele voorraad-radar",
    loginSubtitle: "Vul je e-mail in voor een code. Na het inloggen kies je een eenmalige Heatwave-pass en activeer je voorraadmeldingen.",
    emailLabel: "E-mail",
    emailPlaceholder: "jij@example.com",
    codeLabel: "Code",
    codePlaceholder: "Voer de 6-cijferige code in",
    sendCode: "Code sturen",
    sendCodeBusy: "Versturen…",
    loginSubmit: "Inloggen / doorgaan",
    loginBusy: "Inloggen…",
    socialDivider: "Of ga verder met",
    loginWithGoogle: "Google",
    loginWithApple: "Apple",
    loginWithMicrosoft: "Microsoft",
    loginFinePrint: "Door verder te gaan ga je akkoord met de voorwaarden en privacyverklaring.",
    loginPreviewNotice: "E-mailcodes en eenmalige betalingen voor Heatwave-passen werken; externe login volgt binnenkort.",
    closeLogin: "Sluit loginvenster",
    codeSent: "De code is verstuurd. Check je mailbox.",
    codeCooldown: "Er is net een code verstuurd. Probeer opnieuw over {seconds} seconden.",
    devCodeNotice: "Lokale ontwikkelcode: {code}",
    authErrorInvalidEmail: "Vul een geldig e-mailadres in.",
    authErrorInvalidCode: "De code is ongeldig of verlopen. Controleer hem of vraag een nieuwe aan.",
    authErrorTooMany: "Te veel pogingen. Vraag een nieuwe code aan.",
    authErrorEmailFailed: "De verificatiemail kon niet worden verstuurd. Probeer het later opnieuw.",
    authErrorGeneric: "Inloggen is tijdelijk niet beschikbaar. Probeer het later opnieuw.",
    nicknameTitle: "Hoe mogen we je noemen?",
    nicknameSubtitle: "Alleen een bijnaam. Die gebruiken we voor je avatar en latere persoonlijke meldingen.",
    nicknameLabel: "Bijnaam",
    nicknamePlaceholder: "Hoe mogen we u noemen?",
    nicknameSubmit: "Bijnaam opslaan",
    nicknameSaving: "Opslaan…",
    nicknameError: "Gebruik 1–40 tekens en minstens één letter of cijfer.",
    accountMenu: "Open accountmenu",
    signedInAs: "Ingelogd als {email}",
    profile: "Profiel",
    logout: "Uitloggen",
    socialComingSoon: "Binnenkort",
    previewNl: "Bekijk Nederland",
    statSites: "45+ sites",
    statCountries: "Frankrijk / Nederland",
    statRefresh: "± 10 min refresh",
  },
  en: {
    productName: "Airco Tracker",
    pageTitle: "European portable AC stock radar",
    pageDescription: "Airco Tracker continuously monitors portable air-conditioner stock across European retailers.",
    navigationLabel: "Airco Tracker main navigation",
    statusLabel: "Airco Tracker tracking status",
    navStory: "Heatwave",
    navProduct: "Product",
    navPreview: "Stock demo",
    heroEyebrow: "Portable AC stock tracking for Europe",
    heroTitle: "A rare heatwave is hitting Europe.",
    heroLead: "When the Seine-side stones start radiating heat, portable AC stock can vanish within an hour. Airco Tracker shows which stores can still deliver to your country.",
    primaryCta: "Buy a Pass",
    secondaryCta: "Preview France",
    scrollCue: "Scroll into the heatwave",
    stepOneKicker: "Paris · 38°C",
    stepOneTitle: "The city turns into an oven.",
    stepOneBody: "The river throws back white light, stone walls keep the heat, and pedestrians slow to a crawl. On those days, a portable AC stops being a luxury.",
    stepTwoKicker: "Old Paris apartment · 34°C indoors",
    stepTwoTitle: "The window is open.<br />The heat won’t leave.",
    stepTwoBody: "The fan only stirs the heavy air, while old stone walls keep releasing the day’s heat long after sunset. In a heatwave like this, air conditioning is no longer a luxury. It is what finally makes rest possible.",
    stepThreeKicker: "Stock alerts · live radar",
    stepThreeTitle: "Let stock find you.<br />Let cool air follow.",
    stepThreeBody: "Airco Tracker monitors stores that deliver to your country and separates in-stock units from pre-orders.<br />The moment an AC becomes available, we let you know.",
    stepFourAlertKicker: "Back in stock · email alert",
    stepFourAlertTitle: "Stop refreshing.<br />Stock comes to you.",
    stepFourAlertBody: "When a portable air conditioner that can be delivered to your country comes back in stock, Airco Tracker sends an email straight away. Open the alert to jump straight to the retailer and model.",
    trackerAlertStatus: "Just received",
    trackerAlertSubject: "1 portable AC back in stock",
    trackerOverviewLabel: "Live stock preview",
    trackerCountryLabel: "Delivery country",
    trackerCountryValue: "France",
    trackerAvailabilityLabel: "Availability",
    trackerAvailabilityValue: "In stock 7 · Pre-order 5",
    trackerRetailerLabel: "Retailer",
    trackerRetailerValue: "Rue du Commerce",
    trackerModelLabel: "Model",
    trackerModelValue: "Tristar AT-5468",
    trackerPriceLabel: "Price",
    trackerPriceValue: "€244.74",
    productKicker: "Live stock · at a glance",
    productTitle: "Delivery, availability<br />and price.<br />Clear at a glance.",
    productBody: "Delivery country, in-stock and pre-order status, retailer, model and price all live in one view. Less searching, a better chance of catching genuine stock.",
    finaleKicker: "Blue hour · comfort restored",
    subscribeTitle: "A cooler summer starts<br />with one less refresh.",
    subscribeBody: "Choose the Heatwave Alerts Pass or Heatwave Radar Pass and make one secure Stripe payment for 90 days of stock tracking.",
    subscribeNotice: "Sign in to buy a Heatwave Pass. The room is already cooling down.",
    loginTitle: "Log in to unlock your cooling radar",
    loginSubtitle: "Enter your email for a code. After signing in, choose a one-time Heatwave Pass and unlock stock alerts.",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    codeLabel: "Verification code",
    codePlaceholder: "Enter 6-digit code",
    sendCode: "Send code",
    sendCodeBusy: "Sending…",
    loginSubmit: "Log in / continue",
    loginBusy: "Signing in…",
    socialDivider: "Or continue with",
    loginWithGoogle: "Google",
    loginWithApple: "Apple",
    loginWithMicrosoft: "Microsoft",
    loginFinePrint: "By continuing, you agree to the terms and privacy policy.",
    loginPreviewNotice: "Email codes and one-time Heatwave Pass payments are available; third-party sign-in is coming soon.",
    closeLogin: "Close login dialog",
    codeSent: "Code sent. Please check your inbox.",
    codeCooldown: "A code was just sent. Try again in {seconds} seconds.",
    devCodeNotice: "Local development code: {code}",
    authErrorInvalidEmail: "Please enter a valid email address.",
    authErrorInvalidCode: "That code is invalid or expired. Check it or request a new one.",
    authErrorTooMany: "Too many attempts. Please request a new code.",
    authErrorEmailFailed: "The verification email could not be sent. Please try again later.",
    authErrorGeneric: "Login is temporarily unavailable. Please try again later.",
    nicknameTitle: "What should we call you?",
    nicknameSubtitle: "Just a nickname. We use it for your avatar and future personalized alerts.",
    nicknameLabel: "Nickname",
    nicknamePlaceholder: "What should we call you?",
    nicknameSubmit: "Save nickname",
    nicknameSaving: "Saving…",
    nicknameError: "Use 1–40 characters and include at least one letter or number.",
    accountMenu: "Open account menu",
    signedInAs: "Signed in as {email}",
    profile: "Profile",
    logout: "Log out",
    socialComingSoon: "Coming soon",
    previewNl: "Preview Netherlands",
    statSites: "45+ sites",
    statCountries: "France / Netherlands",
    statRefresh: "≈ 10 min refresh",
  },
  fr: {
    productName: "Airco Tracker",
    pageTitle: "Radar européen des climatiseurs disponibles",
    pageDescription: "Airco Tracker surveille en continu le stock de climatiseurs mobiles chez les revendeurs européens.",
    navigationLabel: "Navigation principale d’Airco Tracker",
    statusLabel: "État du suivi Airco Tracker",
    navStory: "Canicule",
    navProduct: "Produit",
    navPreview: "Aperçu du stock",
    heroEyebrow: "Suivi des climatiseurs disponibles en Europe",
    heroTitle: "Une canicule exceptionnelle frappe l’Europe.",
    heroLead: "Quand les quais de Seine se mettent à rayonner la chaleur, les climatiseurs mobiles peuvent disparaître des stocks en moins d’une heure. Airco Tracker vous indique quels magasins peuvent encore livrer dans votre pays.",
    primaryCta: "Acheter un pass",
    secondaryCta: "Voir la France",
    scrollCue: "Faites défiler pour entrer dans la canicule",
    stepOneKicker: "Paris · 38 °C",
    stepOneTitle: "La ville se transforme en four.",
    stepOneBody: "Le fleuve renvoie une lumière blanche, les murs de pierre gardent la chaleur et les passants avancent au ralenti. Ces jours-là, un climatiseur mobile n’est plus un luxe.",
    stepTwoKicker: "Appartement ancien à Paris · 34 °C à l’intérieur",
    stepTwoTitle: "La fenêtre est ouverte.<br />La chaleur, elle, reste.",
    stepTwoBody: "Le ventilateur ne fait que brasser un air étouffant, tandis que les vieux murs restituent encore la chaleur bien après le coucher du soleil. Dans une telle canicule, la climatisation n’est plus un luxe : elle devient essentielle pour vraiment se reposer.",
    stepThreeKicker: "Alertes de stock · radar en direct",
    stepThreeTitle: "Laissez le stock<br />venir à vous.<br />La fraîcheur suivra.",
    stepThreeBody: "Airco Tracker surveille les magasins qui livrent dans votre pays et distingue le stock des précommandes.<br />Dès qu’un climatiseur est disponible, nous vous prévenons.",
    stepFourAlertKicker: "Retour en stock · alerte e-mail",
    stepFourAlertTitle: "Plus besoin d’actualiser la page.<br />Le stock vient à vous.",
    stepFourAlertBody: "Dès qu’un climatiseur mobile livrable dans votre pays revient en stock, Airco Tracker vous prévient par e-mail. Ouvrez l’alerte pour retrouver aussitôt le magasin et le modèle.",
    trackerAlertStatus: "Reçue à l’instant",
    trackerAlertSubject: "1 climatiseur mobile de nouveau en stock",
    trackerOverviewLabel: "Aperçu du stock en temps réel",
    trackerCountryLabel: "Pays de livraison",
    trackerCountryValue: "France",
    trackerAvailabilityLabel: "Disponibilité",
    trackerAvailabilityValue: "En stock 7 · Précommande 5",
    trackerRetailerLabel: "Magasin",
    trackerRetailerValue: "Rue du Commerce",
    trackerModelLabel: "Modèle",
    trackerModelValue: "Tristar AT-5468",
    trackerPriceLabel: "Prix",
    trackerPriceValue: "244,74 €",
    productKicker: "Stock en temps réel · en un coup d’œil",
    productTitle: "Livraison, disponibilité<br />et prix.<br />Tout devient clair.",
    productBody: "Pays de livraison, stock et précommandes, magasin, modèle et prix sont réunis dans une seule vue. Moins de recherches, plus de chances de trouver un appareil réellement disponible.",
    finaleKicker: "L’heure bleue · la fraîcheur retrouvée",
    subscribeTitle: "Un été plus frais commence<br />par une actualisation en moins.",
    subscribeBody: "Choisissez le Heatwave Alerts Pass ou le Heatwave Radar Pass et payez une seule fois via Stripe pour 90 jours de suivi des stocks.",
    subscribeNotice: "Connectez-vous pour acheter un pass canicule. La pièce commence déjà à se rafraîchir.",
    loginTitle: "Connectez-vous pour activer votre radar fraîcheur",
    loginSubtitle: "Saisissez votre e-mail pour recevoir un code. Après connexion, choisissez un pass canicule à paiement unique et activez les alertes de stock.",
    emailLabel: "E-mail",
    emailPlaceholder: "vous@exemple.fr",
    codeLabel: "Code de vérification",
    codePlaceholder: "Saisissez le code à 6 chiffres",
    sendCode: "Envoyer le code",
    sendCodeBusy: "Envoi…",
    loginSubmit: "Se connecter / continuer",
    loginBusy: "Connexion…",
    socialDivider: "Ou continuer avec",
    loginWithGoogle: "Google",
    loginWithApple: "Apple",
    loginWithMicrosoft: "Microsoft",
    loginFinePrint: "En continuant, vous acceptez les conditions d’utilisation et la politique de confidentialité.",
    loginPreviewNotice: "Les codes par e-mail et le paiement unique des pass canicule sont disponibles ; la connexion avec un tiers arrive bientôt.",
    closeLogin: "Fermer la fenêtre de connexion",
    codeSent: "Code envoyé. Consultez votre boîte de réception.",
    codeCooldown: "Un code vient d’être envoyé. Réessayez dans {seconds} secondes.",
    devCodeNotice: "Code de développement local : {code}",
    authErrorInvalidEmail: "Saisissez une adresse e-mail valide.",
    authErrorInvalidCode: "Ce code est invalide ou a expiré. Vérifiez-le ou demandez-en un nouveau.",
    authErrorTooMany: "Trop de tentatives. Demandez un nouveau code.",
    authErrorEmailFailed: "L’e-mail de vérification n’a pas pu être envoyé. Réessayez plus tard.",
    authErrorGeneric: "La connexion est temporairement indisponible. Réessayez plus tard.",
    nicknameTitle: "Comment devons-nous vous appeler ?",
    nicknameSubtitle: "Un simple pseudonyme suffit. Il servira pour votre avatar et vos futures alertes personnalisées.",
    nicknameLabel: "Pseudonyme",
    nicknamePlaceholder: "Comment devons-nous vous appeler ?",
    nicknameSubmit: "Enregistrer le pseudonyme",
    nicknameSaving: "Enregistrement…",
    nicknameError: "Utilisez 1 à 40 caractères et au moins une lettre ou un chiffre.",
    accountMenu: "Ouvrir le menu du compte",
    signedInAs: "Connecté en tant que {email}",
    profile: "Profil",
    logout: "Se déconnecter",
    socialComingSoon: "Bientôt disponible",
    previewNl: "Voir les Pays-Bas",
    statSites: "Plus de 45 sites",
    statCountries: "France / Pays-Bas",
    statRefresh: "Actualisation toutes les 10 min environ",
  },
};

type LandingPageProps = {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function useStoryStepObserver(stepCount: number) {
  const [activeStep, setActiveStep] = useState(0);
  const stepElements = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const next = Number((visible.target as HTMLElement).dataset.step ?? 0);
        setActiveStep(Number.isFinite(next) ? next : 0);
      },
      {
        root: null,
        rootMargin: "-20% 0px -28% 0px",
        threshold: [0.2, 0.4, 0.6, 0.8],
      },
    );

    const elements = stepElements.current.slice(0, stepCount).filter(Boolean) as HTMLElement[];
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [stepCount]);

  const setStepRef = (index: number) => (element: HTMLElement | null) => {
    stepElements.current[index] = element;
  };

  return { activeStep, setStepRef };
}

export function LandingPage({ lang, setLang, t }: LandingPageProps) {
  const copy = LANDING_COPY[lang];
  const { activeStep, setStepRef } = useStoryStepObserver(2);
  const { activeStep: activeTrackerStep, setStepRef: setTrackerStepRef } = useStoryStepObserver(2);
  const [coolingPreview, setCoolingPreview] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginError, setLoginError] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCooldownSeconds, setCodeCooldownSeconds] = useState(0);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.title = `Airco Tracker · ${copy.pageTitle}`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", copy.pageDescription);
  }, [copy.pageDescription, copy.pageTitle]);

  useEffect(() => {
    let ignore = false;
    getCurrentUser()
      .then((nextUser) => {
        if (ignore) return;
        setUser(nextUser);
        const hasExplicitLanguage = new URLSearchParams(window.location.search).has("lang");
        const routeLanguage = hasExplicitLanguage ? lang : nextUser?.languagePreference ?? lang;
        if (!hasExplicitLanguage && nextUser?.languagePreference && nextUser.languagePreference !== lang) {
          setLang(nextUser.languagePreference);
        }
        if (nextUser && !nextUser.nickname) {
          setNickname("");
          setNicknameOpen(true);
        } else if (nextUser && entitlementIsActive(nextUser)) {
          window.location.replace(`/ready?lang=${routeLanguage}`);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ignore) setAuthReady(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const dialogOpen = loginOpen || nicknameOpen;
    document.body.classList.toggle("landing-dialog-open", dialogOpen);
    if (loginOpen) emailInputRef.current?.focus();
    if (nicknameOpen) nicknameInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLoginOpen(false);
    };
    if (dialogOpen) window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("landing-dialog-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [loginOpen, nicknameOpen]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (codeCooldownSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCodeCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldownSeconds]);

  const openLogin = () => {
    setCoolingPreview(true);
    setLoginError("");
    setLoginMessage("");
    if (user) {
      window.location.href = entitlementIsActive(user)
        ? `/ready?lang=${lang}`
        : `/subscribe?lang=${lang}`;
      return;
    }
    setLoginOpen(true);
  };

  const closeLogin = () => setLoginOpen(false);

  const handleSendCode = async () => {
    setLoginError("");
    setLoginMessage("");
    setSendingCode(true);
    try {
      const result = await requestAuthCode(email, lang);
      const devCode = result.devCode ? ` ${copy.devCodeNotice.replace("{code}", result.devCode)}` : "";
      setLoginMessage(`${copy.codeSent}${devCode}`);
      if (result.devCode) setCode(result.devCode);
      setCodeCooldownSeconds(result.retryAfterSeconds || 60);
    } catch (error) {
      if (error instanceof AuthApiError && error.code === "code_recently_sent" && error.retryAfterSeconds) {
        setCodeCooldownSeconds(error.retryAfterSeconds);
      }
      setLoginError(authErrorMessage(error, copy));
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    setLoginMessage("");
    setVerifyingCode(true);
    try {
      const result = await verifyAuthCode(email, code, lang);
      setUser(result.user);
      setCoolingPreview(true);
      setLoginOpen(false);
      setCode("");
      if (result.needsOnboarding || !result.user.nickname) {
        setNickname("");
        setNicknameOpen(true);
      } else if (!entitlementIsActive(result.user)) {
        window.location.href = `/subscribe?lang=${navigationLanguage(lang, result.user.languagePreference)}`;
      } else {
        window.location.href = `/ready?lang=${navigationLanguage(lang, result.user.languagePreference)}`;
      }
    } catch (error) {
      setLoginError(authErrorMessage(error, copy));
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleNicknameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNicknameError("");
    setSavingNickname(true);
    try {
      const updated = await updateNickname(nickname);
      setUser(updated);
      setNicknameOpen(false);
      setNickname("");
      if (!entitlementIsActive(updated)) {
        window.location.href = `/subscribe?lang=${navigationLanguage(lang, updated.languagePreference)}`;
      } else {
        window.location.href = `/ready?lang=${navigationLanguage(lang, updated.languagePreference)}`;
      }
    } catch {
      setNicknameError(copy.nicknameError);
    } finally {
      setSavingNickname(false);
    }
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout().catch(() => undefined);
    setUser(null);
    setNicknameOpen(false);
    setLoginOpen(false);
    setEmail("");
    setCode("");
  };

  return (
    <main data-lang={lang} className={`landing-shell landing-story--step-${activeStep}${coolingPreview ? " landing-story--cooling" : ""}`}>
      <header className="landing-nav" aria-label={copy.navigationLabel}>
        <a className="landing-logo" href={`/?lang=${lang}`} aria-label={copy.productName}>
          <AircoLogoMark className="landing-logo-mark" />
          <span>{copy.productName}</span>
        </a>
        <span className="landing-nav-spacer" aria-hidden="true" />
        <div className="landing-nav-actions">
          <LanguageSwitcher lang={lang} setLang={setLang} />
          {user?.nickname ? (
            <div className="landing-account" ref={menuRef}>
              <button
                className="landing-avatar-button"
                type="button"
                aria-label={copy.accountMenu}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {userInitials(user.nickname, user.email)}
              </button>
              {menuOpen && (
                <div className="landing-account-menu" role="menu">
                  <p>{copy.signedInAs.replace("{email}", user.email)}</p>
                  <a role="menuitem" href={`/profile?lang=${lang}`}>{copy.profile}</a>
                  <button role="menuitem" className="landing-account-logout" type="button" onClick={handleLogout}>
                    {copy.logout}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="landing-nav-cta" type="button" onClick={openLogin} disabled={!authReady}>
              {copy.primaryCta}
            </button>
          )}
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <LandingHeroVisual />
        <div className="landing-hero-copy">
          <p className="landing-kicker">{copy.heroEyebrow}</p>
          <h1 id="landing-title">{renderLandingLines(copy.heroTitle)}</h1>
          <p>{copy.heroLead}</p>
          <div className="landing-hero-actions">
            <button className="landing-primary-button" type="button" onClick={openLogin}>
              {copy.primaryCta}
            </button>
          </div>
          <div className="landing-hero-meta" aria-label={copy.statusLabel}>
            <span>{copy.statSites}</span>
            <span>{copy.statCountries}</span>
            <span>{copy.statRefresh}</span>
          </div>
        </div>
        <a className="landing-scroll-cue" href="#heatwave">
          <span aria-hidden="true" />
          {copy.scrollCue}
        </a>
      </section>

      <section id="heatwave" className="landing-story" aria-label={copy.navStory}>
        <div className="landing-stage" aria-hidden="true">
          <LandingStoryVisual />
        </div>
        <div className="landing-story-copy">
          <article className="landing-story-step landing-story-step--room landing-story-step--right" data-step="0" ref={setStepRef(0)}>
            <div className="landing-story-card">
              <p className="landing-kicker">{copy.stepTwoKicker}</p>
              <h2>{renderLandingLines(copy.stepTwoTitle)}</h2>
              <p>{copy.stepTwoBody}</p>
            </div>
          </article>
          <article className="landing-story-step landing-story-step--solution landing-story-step--right" data-step="1" ref={setStepRef(1)}>
            <div className="landing-story-card">
              <p className="landing-kicker">{copy.stepThreeKicker}</p>
              <h2>{renderLandingLines(copy.stepThreeTitle)}</h2>
              <p>{renderLandingLines(copy.stepThreeBody)}</p>
              <button className="landing-primary-button" type="button" onClick={openLogin}>
                {copy.primaryCta}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section
        id="product"
        className={`landing-product-story landing-product-story--step-${activeTrackerStep}`}
        aria-label={copy.navProduct}
      >
        <div className="landing-product-stage">
          <LandingTrackerVisual />
          <div className="landing-tracker-alert-card" aria-hidden="true">
            <span className="landing-tracker-alert-icon" aria-hidden="true">✦</span>
            <div>
              <span>{copy.trackerAlertStatus}</span>
              <strong>{copy.trackerAlertSubject}</strong>
              <small>Rue du Commerce · {copy.trackerPriceValue}</small>
            </div>
          </div>
          <div className="landing-tracker-data-rail" aria-hidden="true">
            <span className="landing-tracker-data-label">{copy.trackerOverviewLabel}</span>
            <div className="landing-tracker-data-card landing-tracker-data-card--country">
              <span>{copy.trackerCountryLabel}</span>
              <strong><i aria-hidden="true">FR</i>{copy.trackerCountryValue}</strong>
            </div>
            <div className="landing-tracker-data-card landing-tracker-data-card--stock">
              <span>{copy.trackerAvailabilityLabel}</span>
              <strong>{copy.trackerAvailabilityValue}</strong>
            </div>
            <div className="landing-tracker-data-card landing-tracker-data-card--retailer">
              <span>{copy.trackerRetailerLabel}</span>
              <strong>{copy.trackerRetailerValue}</strong>
            </div>
            <div className="landing-tracker-data-card landing-tracker-data-card--model">
              <span>{copy.trackerModelLabel}</span>
              <strong>{copy.trackerModelValue}</strong>
            </div>
            <div className="landing-tracker-data-card landing-tracker-data-card--price">
              <span>{copy.trackerPriceLabel}</span>
              <strong>{copy.trackerPriceValue}</strong>
            </div>
          </div>
        </div>
        <div className="landing-product-story-copy">
          <article
            className="landing-product-story-step landing-product-story-step--alert"
            data-step="0"
            ref={setTrackerStepRef(0)}
            aria-hidden={activeTrackerStep !== 0}
            inert={activeTrackerStep !== 0}
          >
            <div className="landing-product-story-card">
              <p className="landing-kicker">{copy.stepFourAlertKicker}</p>
              <h2>{renderLandingLines(copy.stepFourAlertTitle)}</h2>
              <p>{copy.stepFourAlertBody}</p>
            </div>
          </article>
          <article
            className="landing-product-story-step landing-product-story-step--radar"
            data-step="1"
            ref={setTrackerStepRef(1)}
            aria-hidden={activeTrackerStep !== 1}
            inert={activeTrackerStep !== 1}
          >
            <div className="landing-product-story-card">
              <p className="landing-kicker">{copy.productKicker}</p>
              <h2>{renderLandingLines(copy.productTitle)}</h2>
              <p>{copy.productBody}</p>
              <button className="landing-primary-button" type="button" onClick={openLogin}>
                {copy.primaryCta}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-finale" aria-live="polite">
        <LandingFinaleVisual />
        <div className="landing-finale-copy">
          <p className="landing-kicker">{copy.finaleKicker}</p>
          <h2>{renderLandingLines(copy.subscribeTitle)}</h2>
          <p>{copy.subscribeBody}</p>
          {coolingPreview && <p className="landing-subscribe-note">{copy.subscribeNotice}</p>}
          <button className="landing-primary-button landing-primary-button--large" type="button" onClick={openLogin}>
            {copy.primaryCta}
          </button>
        </div>
      </section>

      <footer className="page-footer">
        <span>
          <a href={`/privacy.html?lang=${lang}`} target="_blank" rel="noopener noreferrer">{t("legal_privacy_link")}</a>
          {" · "}
          <a href={`/terms.html?lang=${lang}`} target="_blank" rel="noopener noreferrer">{t("legal_terms_link")}</a>
          {" · "}
          <a href={`/imprint.html?lang=${lang}`} target="_blank" rel="noopener noreferrer">{t("legal_imprint_link")}</a>
          {" · "}
          <a href={`/affiliate-disclosure.html?lang=${lang}`} target="_blank" rel="noopener noreferrer">{t("legal_affiliate_link")}</a>
        </span>
        <span>{copy.productName}</span>
      </footer>

      {loginOpen && (
        <div className="landing-login-backdrop" onMouseDown={closeLogin}>
          <section
            className="landing-login-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-login-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="landing-login-close" type="button" onClick={closeLogin} aria-label={copy.closeLogin}>
              ×
            </button>
            <div className="landing-login-brand" aria-hidden="true">
              <AircoLogoMark className="landing-logo-mark" />
              <span>{copy.productName}</span>
            </div>
            <div className="landing-login-copy">
              <p className="landing-kicker">{copy.primaryCta}</p>
              <h2 id="landing-login-title">{copy.loginTitle}</h2>
              <p>{copy.loginSubtitle}</p>
            </div>
            <form className="landing-login-form" onSubmit={handleVerifyCode}>
              <label className="landing-login-field">
                <span>{copy.emailLabel}</span>
                <input
                  ref={emailInputRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="landing-login-field landing-login-code-field">
                <span>{copy.codeLabel}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={copy.codePlaceholder}
                  value={code}
                  maxLength={6}
                  pattern="\d{6}"
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
                <button type="button" onClick={handleSendCode} disabled={sendingCode || verifyingCode || codeCooldownSeconds > 0}>
                  {sendingCode ? copy.sendCodeBusy : codeCooldownSeconds > 0 ? `${codeCooldownSeconds}s` : copy.sendCode}
                </button>
              </label>
              {loginMessage && <p className="landing-login-message">{loginMessage}</p>}
              {loginError && <p className="landing-login-error">{loginError}</p>}
              <button className="landing-login-submit" type="submit" disabled={sendingCode || verifyingCode}>
                {verifyingCode ? copy.loginBusy : copy.loginSubmit}
              </button>
            </form>
            <div className="landing-login-divider">
              <span>{copy.socialDivider}</span>
            </div>
            <div className="landing-login-socials">
              <button type="button" disabled title={copy.socialComingSoon}><span aria-hidden="true">G</span>{copy.loginWithGoogle}</button>
              <button type="button" disabled title={copy.socialComingSoon}><span aria-hidden="true"></span>{copy.loginWithApple}</button>
              <button type="button" disabled title={copy.socialComingSoon}><span aria-hidden="true">▦</span>{copy.loginWithMicrosoft}</button>
            </div>
            <p className="landing-login-fineprint">{copy.loginFinePrint}</p>
            <p className="landing-login-fineprint">
              <a href={`/terms.html?lang=${lang}`} target="_blank" rel="noopener noreferrer">{t("legal_terms_link")}</a>
              {" · "}
              <a href={`/privacy.html?lang=${lang}`} target="_blank" rel="noopener noreferrer">{t("legal_privacy_link")}</a>
            </p>
            <p className="landing-login-preview">{copy.loginPreviewNotice}</p>
          </section>
        </div>
      )}

      {nicknameOpen && (
        <div className="landing-login-backdrop">
          <section
            className="landing-login-card landing-nickname-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-nickname-title"
          >
            <div className="landing-login-brand" aria-hidden="true">
              <AircoLogoMark className="landing-logo-mark" />
              <span>{copy.productName}</span>
            </div>
            <div className="landing-login-copy">
              <p className="landing-kicker">{copy.signedInAs.replace("{email}", user?.email ?? "")}</p>
              <h2 id="landing-nickname-title">{copy.nicknameTitle}</h2>
              <p>{copy.nicknameSubtitle}</p>
            </div>
            <form className="landing-login-form" onSubmit={handleNicknameSubmit}>
              <label className="landing-login-field">
                <span>{copy.nicknameLabel}</span>
                <input
                  ref={nicknameInputRef}
                  type="text"
                  autoComplete="nickname"
                  placeholder={copy.nicknamePlaceholder}
                  value={nickname}
                  maxLength={40}
                  onChange={(event) => setNickname(event.target.value)}
                  required
                />
              </label>
              {nicknameError && <p className="landing-login-error">{nicknameError}</p>}
              <button className="landing-login-submit" type="submit" disabled={savingNickname}>
                {savingNickname ? copy.nicknameSaving : copy.nicknameSubmit}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function renderLandingLines(value: string) {
  return value.split(/<br\s*\/?>/i).map((line, index) => (
    <span className="landing-title-line" key={`${index}-${line}`}>
      {line}
    </span>
  ));
}

function navigationLanguage(current: Lang, preference: Lang): Lang {
  return new URLSearchParams(window.location.search).has("lang") ? current : preference;
}

function authErrorMessage(error: unknown, copy: LandingCopy): string {
  if (error instanceof AuthApiError) {
    if (error.code === "invalid_email") return copy.authErrorInvalidEmail;
    if (error.code === "invalid_code" || error.code === "invalid_or_expired_code") return copy.authErrorInvalidCode;
    if (error.code === "too_many_code_attempts") return copy.authErrorTooMany;
    if (error.code === "email_send_failed") return copy.authErrorEmailFailed;
    if (error.code === "code_recently_sent" && error.retryAfterSeconds) {
      return copy.codeCooldown.replace("{seconds}", String(error.retryAfterSeconds));
    }
  }
  return copy.authErrorGeneric;
}
