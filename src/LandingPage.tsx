import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AuthApiError,
  getCurrentUser,
  requestAuthCode,
  updateNickname,
  verifyAuthCode,
  type UserProfile,
} from "./authClient";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { entitlementIsActive } from "../shared/auth";
import type { Lang } from "./i18n";
import { AircoLogoMark } from "./AircoLogoMark";
import { LandingCinema } from "./LandingCinema";
import { setPageMetadata } from "./metadata";
import { AccountMenu } from "./AccountMenu";
import { LegalFooter } from "./LegalFooter";
import { AccessibleDialog } from "./AccessibleDialog";

export type LandingCopy = {
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
  storyHeatKicker: string;
  storyHeatTitle: string;
  storyHeatBody: string;
  storyAlertKicker: string;
  storyAlertTitle: string;
  storyAlertBody: string;
  storyReliefKicker: string;
  storyReliefTitle: string;
  storyReliefBody: string;
  roomTempLabel: string;
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
  authRestoreError: string;
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
    storyHeatKicker: "巴黎老宅 · 室内 34°C",
    storyHeatTitle: "窗户开着，<br />热气却散不出去。",
    storyHeatBody: "风扇只能搅动闷热的空气，厚重的石墙到了夜里仍在释放白天积下的热。这样的热浪里，空调不再是奢侈品，而是能让人好好休息的必需品。",
    storyAlertKicker: "库存提醒 · 尽快发现",
    storyAlertTitle: "不用反复刷新，<br />发现现货就能行动。",
    storyAlertBody: "扫描发现商品恢复现货后，提醒邮件会尽快发到你的邮箱。点进去、下单、付款——两天后，这台便携空调就站到了窗边。",
    storyReliefKicker: "空调到家 · 室内 24°C",
    storyReliefTitle: "凉下来的，<br />不只是屋子。",
    storyReliefBody: "冷气漫过地板的那一刻，紧绷了一天的肩膀松了下来。风扇退休了，窗还开着——但这一次，是因为夜里凉快。",
    roomTempLabel: "室内温度",
    stepFourAlertKicker: "这台空调的背后 · Airco Tracker",
    stepFourAlertTitle: "不是运气。<br />是雷达。",
    stepFourAlertBody: "46 家欧洲零售商、通常约每 10 分钟一轮扫描，并按配送国家筛选结果。预售和长交期会单独显示，不计入现货；提醒来自最近一次成功扫描。",
    trackerAlertStatus: "刚刚收到",
    trackerAlertSubject: "1 台便携空调恢复库存",
    trackerOverviewLabel: "近实时库存预览 · 通常约每 10 分钟刷新",
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
    productKicker: "近实时库存 · 通常约每 10 分钟刷新",
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
    authRestoreError: "暂时无法恢复之前的登录状态。你仍可以重新登录，或稍后再试。",
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
    statSites: "46 家网站",
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
    storyHeatKicker: "Oud appartement in Parijs · 34 °C binnen",
    storyHeatTitle: "Het raam staat open.<br />De hitte blijft hangen.",
    storyHeatBody: "De ventilator verplaatst alleen de benauwde lucht, terwijl de oude stenen muren de warmte tot lang na zonsondergang blijven afgeven. Tijdens zo’n hittegolf is een airco geen luxe meer, maar essentieel om echt tot rust te komen.",
    storyAlertKicker: "Voorraadmelding · snel op de hoogte",
    storyAlertTitle: "Niet eindeloos refreshen.<br />Handel zodra voorraad verschijnt.",
    storyAlertBody: "Zodra een scan nieuwe voorraad vindt, sturen we de melding zo snel mogelijk naar je inbox. Aanklikken, bestellen, betalen — twee dagen later stond de mobiele airco al bij het raam.",
    storyReliefKicker: "Airco thuis · 24 °C binnen",
    storyReliefTitle: "Het wordt niet alleen<br />de kamer die afkoelt.",
    storyReliefBody: "Toen de koele lucht over de vloer trok, zakte de spanning van je schouders. De ventilator is met pensioen, en het raam blijft open — nu juist omdat het ’s avonds lekker afkoelt.",
    roomTempLabel: "Binnentemperatuur",
    stepFourAlertKicker: "Achter die airco · Airco Tracker",
    stepFourAlertTitle: "Geen geluk.<br />Wel radar.",
    stepFourAlertBody: "46 Europese winkels, normaal ongeveer elke 10 minuten een scan, met resultaten gefilterd op jouw bezorgland. Pre-orders en lange levertijden staan apart en tellen niet als op voorraad; meldingen komen uit de recentste geslaagde scan.",
    trackerAlertStatus: "Zojuist ontvangen",
    trackerAlertSubject: "1 mobiele airco weer op voorraad",
    trackerOverviewLabel: "Voorbeeld van bijna-realtime voorraad · normaal circa elke 10 minuten ververst",
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
    productKicker: "Bijna-realtime voorraad · normaal circa elke 10 minuten ververst",
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
    authRestoreError: "Je eerdere sessie kon tijdelijk niet worden hersteld. Je kunt opnieuw inloggen of het later nog eens proberen.",
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
    statSites: "46 sites",
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
    storyHeatKicker: "Old Paris apartment · 34°C indoors",
    storyHeatTitle: "The window is open.<br />The heat won’t leave.",
    storyHeatBody: "The fan only stirs the heavy air, while old stone walls keep releasing the day’s heat long after sunset. In a heatwave like this, air conditioning is no longer a luxury. It is what finally makes rest possible.",
    storyAlertKicker: "Stock alert · know sooner",
    storyAlertTitle: "Stop refreshing.<br />Act when stock appears.",
    storyAlertBody: "When a scan finds newly available stock, we send an email as soon as possible. Open, order, pay — two days later the portable AC was humming by the window.",
    storyReliefKicker: "AC delivered · 24°C indoors",
    storyReliefTitle: "It isn’t only the room<br />that cools down.",
    storyReliefBody: "As the cool air rolled across the floor, the day’s tension finally left your shoulders. The fan is retired, and the window stays open — this time because the evening is pleasant.",
    roomTempLabel: "Indoor temperature",
    stepFourAlertKicker: "Behind that AC · Airco Tracker",
    stepFourAlertTitle: "Not luck.<br />Radar.",
    stepFourAlertBody: "46 European retailers, normally scanned about every 10 minutes, with results filtered for your delivery country. Pre-orders and long lead times are shown separately and never counted as in stock; alerts come from the latest successful scan.",
    trackerAlertStatus: "Just received",
    trackerAlertSubject: "1 portable AC back in stock",
    trackerOverviewLabel: "Near-real-time stock preview · normally refreshed about every 10 minutes",
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
    productKicker: "Near-real-time stock · normally refreshed about every 10 minutes",
    productTitle: "Delivery, availability<br />and price.<br />Clear at a glance.",
    productBody: "Delivery country, in-stock and pre-order status, retailer, model and price all appear in one view. Less searching, a better chance of catching genuine stock.",
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
    authRestoreError: "We could not restore your previous session. You can sign in again or try later.",
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
    statSites: "46 sites",
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
    storyHeatKicker: "Appartement ancien à Paris · 34 °C à l’intérieur",
    storyHeatTitle: "La fenêtre est ouverte.<br />La chaleur, elle, reste.",
    storyHeatBody: "Le ventilateur ne fait que brasser un air étouffant, tandis que les vieux murs restituent encore la chaleur bien après le coucher du soleil. Dans une telle canicule, la climatisation n’est plus un luxe : elle devient essentielle pour vraiment se reposer.",
    storyAlertKicker: "Alerte stock · informé rapidement",
    storyAlertTitle: "Plus besoin d’actualiser sans cesse.<br />Agissez dès qu’un stock apparaît.",
    storyAlertBody: "Lorsqu’un balayage détecte un nouveau stock, nous envoyons l’alerte par e-mail dès que possible. Ouvrir, commander, payer — deux jours plus tard, le climatiseur mobile soufflait déjà près de la fenêtre.",
    storyReliefKicker: "Clim livrée · 24 °C à l’intérieur",
    storyReliefTitle: "Ce n’est pas seulement<br />la pièce qui se rafraîchit.",
    storyReliefBody: "Quand l’air frais a glissé sur le parquet, la tension de la journée a quitté vos épaules. Le ventilateur est à la retraite, et la fenêtre reste ouverte — cette fois parce que la soirée est douce.",
    roomTempLabel: "Température intérieure",
    stepFourAlertKicker: "Derrière cette clim · Airco Tracker",
    stepFourAlertTitle: "Pas de chance.<br />Un radar.",
    stepFourAlertBody: "46 enseignes européennes, normalement balayées toutes les 10 minutes environ, avec des résultats filtrés selon votre pays de livraison. Les précommandes et longs délais sont affichés séparément et ne comptent jamais comme stock disponible ; les alertes proviennent du dernier balayage réussi.",
    trackerAlertStatus: "Reçue à l’instant",
    trackerAlertSubject: "1 climatiseur mobile de nouveau en stock",
    trackerOverviewLabel: "Aperçu quasi-temps réel · normalement actualisé toutes les 10 minutes environ",
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
    productKicker: "Stock en quasi-temps réel · normalement toutes les 10 minutes environ",
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
    authRestoreError: "Impossible de restaurer votre session précédente pour le moment. Vous pouvez vous reconnecter ou réessayer plus tard.",
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
    statSites: "46 sites",
    statCountries: "France / Pays-Bas",
    statRefresh: "Actualisation toutes les 10 min environ",
  },
};

type LandingPageProps = {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function LandingPage({ lang, setLang, t }: LandingPageProps) {
  const copy = LANDING_COPY[lang];
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
  const [authRestoreFailed, setAuthRestoreFailed] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPageMetadata({
      pathname: "/",
      lang,
      indexable: true,
      title: `Airco Tracker · ${copy.pageTitle}`,
      description: copy.pageDescription,
    });
  }, [copy.pageDescription, copy.pageTitle, lang]);

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
      .catch(() => {
        if (!ignore) setAuthRestoreFailed(true);
      })
      .finally(() => {
        if (!ignore) setAuthReady(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

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
      setAuthRestoreFailed(false);
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

  const handleLoggedOut = () => {
    setUser(null);
    setNicknameOpen(false);
    setLoginOpen(false);
    setEmail("");
    setCode("");
  };

  return (
    <main data-lang={lang} className="landing-shell">
      <header className="landing-nav" aria-label={copy.navigationLabel}>
        <a className="landing-logo" href={`/?lang=${lang}`} aria-label={copy.productName}>
          <AircoLogoMark className="landing-logo-mark" />
          <span>{copy.productName}</span>
        </a>
        <span className="landing-nav-spacer" aria-hidden="true" />
        <div className="landing-nav-actions">
          <LanguageSwitcher lang={lang} setLang={setLang} />
          {user?.nickname ? (
            <AccountMenu user={user} lang={lang} onLogout={handleLoggedOut} />
          ) : (
            <button className="landing-nav-cta" type="button" onClick={openLogin} disabled={!authReady}>
              {copy.primaryCta}
            </button>
          )}
        </div>
      </header>

      <LandingCinema copy={copy} showSubscribeNotice={coolingPreview} onCta={openLogin} />

      {authRestoreFailed && (
        <p className="landing-toast" role="status" aria-live="polite">{copy.authRestoreError}</p>
      )}

      <LegalFooter lang={lang} />

      {loginOpen && (
        <AccessibleDialog
          className="landing-login-card"
          labelledBy="landing-login-title"
          describedBy="landing-login-description"
          initialFocusRef={emailInputRef}
          onClose={closeLogin}
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
              <p id="landing-login-description">{copy.loginSubtitle}</p>
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
              {loginMessage && <p className="landing-login-message" role="status" aria-live="polite">{loginMessage}</p>}
              {loginError && <p className="landing-login-error" role="alert">{loginError}</p>}
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
        </AccessibleDialog>
      )}

      {nicknameOpen && (
        <AccessibleDialog
          className="landing-login-card landing-nickname-card"
          labelledBy="landing-nickname-title"
          describedBy="landing-nickname-description"
          initialFocusRef={nicknameInputRef}
          onClose={() => undefined}
        >
            <div className="landing-login-brand" aria-hidden="true">
              <AircoLogoMark className="landing-logo-mark" />
              <span>{copy.productName}</span>
            </div>
            <div className="landing-login-copy">
              <p className="landing-kicker">{copy.signedInAs.replace("{email}", user?.email ?? "")}</p>
              <h2 id="landing-nickname-title">{copy.nicknameTitle}</h2>
              <p id="landing-nickname-description">{copy.nicknameSubtitle}</p>
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
              {nicknameError && <p className="landing-login-error" role="alert">{nicknameError}</p>}
              <button className="landing-login-submit" type="submit" disabled={savingNickname}>
                {savingNickname ? copy.nicknameSaving : copy.nicknameSubmit}
              </button>
            </form>
        </AccessibleDialog>
      )}
    </main>
  );
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
