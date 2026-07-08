import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  PAID_SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_DETAILS,
  isPaidSubscriptionPlan,
  subscriptionIsActive,
  type BillingCycle,
  type PaidSubscriptionPlan,
} from "../shared/auth";
import {
  AuthApiError,
  createCheckoutSession,
  getCurrentUser,
  requestAuthCode,
  updateNickname,
  verifyAuthCode,
  type UserProfile,
} from "./authClient";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Lang } from "./i18n";

type SubscriptionCopy = {
  productName: string;
  backHome: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  weekly: string;
  monthly: string;
  alertsName: string;
  alertsTagline: string;
  stockName: string;
  stockTagline: string;
  bestValue: string;
  choose: string;
  currentPlan: string;
  checkoutTitle: string;
  checkoutBody: string;
  changeCheckoutTitle: string;
  changeCheckoutBody: string;
  paymentMethod: string;
  card: string;
  ideal: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  idealBank: string;
  completePayment: string;
  completeChange: string;
  processing: string;
  sandboxNotice: string;
  loginTitle: string;
  loginSubtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  codeLabel: string;
  codePlaceholder: string;
  sendCode: string;
  sendCodeBusy: string;
  codeSent: string;
  codeCooldown: string;
  devCodeNotice: string;
  loginSubmit: string;
  loginBusy: string;
  socialDivider: string;
  loginWithGoogle: string;
  loginWithApple: string;
  loginWithMicrosoft: string;
  loginFinePrint: string;
  loginPreviewNotice: string;
  closeLogin: string;
  socialComingSoon: string;
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
  included: string;
  alertsFeature: string;
  stockFeature: string;
  deliveryFeature: string;
  presaleFeature: string;
  cancellationFeature: string;
  noStockFeature: string;
  compareTitle: string;
  faqTitle: string;
  faqCancelQ: string;
  faqCancelA: string;
  faqStockQ: string;
  faqStockA: string;
  faqCountryQ: string;
  faqCountryA: string;
  error: string;
};

const SUBSCRIPTION_COPY: Record<Lang, SubscriptionCopy> = {
  zh: {
    productName: "Airco Tracker",
    backHome: "返回首页",
    eyebrow: "热浪季订阅",
    title: "别再错过刚上线的空调库存。",
    subtitle: "选择邮件提醒，或者解锁实时库存雷达。随时取消，权益保留到当前周期结束。",
    weekly: "每周",
    monthly: "每月",
    alertsName: "库存提醒",
    alertsTagline: "适合只想收到上线邮件、不需要实时看库存的用户。",
    stockName: "实时雷达",
    stockTagline: "适合正在热浪里抢空调、需要直接查看实时库存的用户。",
    bestValue: "推荐",
    choose: "选择方案",
    currentPlan: "当前方案",
    checkoutTitle: "确认订阅",
    checkoutBody: "下一步会跳转到 Stripe 安全结账页完成信用卡付款。卡号不会经过 Airco Tracker 服务器。",
    changeCheckoutTitle: "确认更改订阅",
    changeCheckoutBody: "我们会通过 Stripe 更新你当前的订阅，并使用已有付款方式处理差额。卡号不会经过 Airco Tracker 服务器。",
    paymentMethod: "支付方式",
    card: "信用卡",
    ideal: "iDEAL",
    cardNumber: "卡号",
    cardExpiry: "有效期",
    cardCvc: "CVC",
    idealBank: "选择银行",
    completePayment: "前往 Stripe 安全支付",
    completeChange: "确认更改订阅",
    processing: "处理中…",
    sandboxNotice: "当前先接入信用卡路径。iDEAL/Wero 可以在 Stripe 稳定后继续加入。",
    loginTitle: "登录后继续订阅",
    loginSubtitle: "输入邮箱获取验证码。登录成功后会继续打开你刚选择的支付选项。",
    emailLabel: "邮箱",
    emailPlaceholder: "you@example.com",
    codeLabel: "验证码",
    codePlaceholder: "输入 6 位验证码",
    sendCode: "发送验证码",
    sendCodeBusy: "发送中…",
    codeSent: "验证码已发送，请检查你的邮箱。",
    codeCooldown: "验证码刚刚发送过，请 {seconds} 秒后再试。",
    devCodeNotice: "本地开发验证码：{code}",
    loginSubmit: "登录并继续",
    loginBusy: "登录中…",
    socialDivider: "或使用第三方账号继续",
    loginWithGoogle: "Google",
    loginWithApple: "Apple",
    loginWithMicrosoft: "Microsoft",
    loginFinePrint: "继续即表示你同意之后接入的用户协议和隐私政策。",
    loginPreviewNotice: "邮箱验证码已接入；第三方登录和真实支付会在下一阶段接入。",
    closeLogin: "关闭登录弹窗",
    socialComingSoon: "即将接入",
    authErrorInvalidEmail: "请填写一个有效的邮箱地址。",
    authErrorInvalidCode: "验证码无效或已过期，请重新检查或再发一次。",
    authErrorTooMany: "尝试次数太多，请重新发送验证码。",
    authErrorEmailFailed: "验证码邮件暂时发送失败，请稍后再试。",
    authErrorGeneric: "登录服务暂时不可用，请稍后再试。",
    nicknameTitle: "我们该如何称呼你？",
    nicknameSubtitle: "只需要一个昵称。它会用于你的头像和之后的个性化提示。",
    nicknameLabel: "昵称",
    nicknamePlaceholder: "我们该如何称呼您呢？",
    nicknameSubmit: "保存昵称并继续",
    nicknameSaving: "保存中…",
    nicknameError: "昵称需要 1–40 个字符，且至少包含一个文字或数字。",
    included: "包含",
    alertsFeature: "库存上线邮件提醒",
    stockFeature: "实时库存页面访问",
    deliveryFeature: "按配送国家筛选网站",
    presaleFeature: "现货/预售区分",
    cancellationFeature: "可随时取消，权益保留到周期结束",
    noStockFeature: "不包含实时库存页面",
    compareTitle: "权益对比",
    faqTitle: "常见问题",
    faqCancelQ: "可以随时取消吗？",
    faqCancelA: "可以。取消后不会再续费，但当前周期内的权益会继续保留。",
    faqStockQ: "为什么收到提醒后商品可能已经没了？",
    faqStockA: "热浪期间库存变化非常快。我们会尽快提醒，但无法保证商家库存一定保留到你打开链接时。",
    faqCountryQ: "可以切换国家吗？",
    faqCountryA: "可以，在 Profile 里切换配送国家后，实时库存页面会自动展示对应国家的网站列表。",
    error: "订阅暂时无法完成，请稍后再试。",
  },
  nl: {
    productName: "Airco Tracker",
    backHome: "Terug naar home",
    eyebrow: "Hittegolf-abonnement",
    title: "Mis geen nieuwe airco-voorraad meer.",
    subtitle: "Kies e-mailmeldingen of ontgrendel de realtime voorraad-radar. Altijd opzegbaar; toegang loopt door tot het einde van je periode.",
    weekly: "Wekelijks",
    monthly: "Maandelijks",
    alertsName: "Voorraadmeldingen",
    alertsTagline: "Voor wie alleen e-mail wil ontvangen en geen realtime voorraadpagina nodig heeft.",
    stockName: "Realtime radar",
    stockTagline: "Voor wie tijdens een hittegolf direct wil zien waar voorraad beschikbaar is.",
    bestValue: "Aanbevolen",
    choose: "Kies plan",
    currentPlan: "Huidig plan",
    checkoutTitle: "Bevestig abonnement",
    checkoutBody: "Hierna ga je naar de beveiligde Stripe Checkout om met creditcard te betalen. Kaartgegevens raken onze server niet.",
    changeCheckoutTitle: "Bevestig abonnementswijziging",
    changeCheckoutBody: "We werken je bestaande abonnement bij via Stripe en gebruiken je opgeslagen betaalmethode voor het verschil. Kaartgegevens raken onze server niet.",
    paymentMethod: "Betaalmethode",
    card: "Creditcard",
    ideal: "iDEAL",
    cardNumber: "Kaartnummer",
    cardExpiry: "Vervaldatum",
    cardCvc: "CVC",
    idealBank: "Kies bank",
    completePayment: "Naar veilige Stripe-betaling",
    completeChange: "Wijzig abonnement",
    processing: "Bezig…",
    sandboxNotice: "We koppelen nu eerst creditcardbetalingen. iDEAL/Wero kan daarna worden toegevoegd.",
    loginTitle: "Log in om door te gaan",
    loginSubtitle: "Vul je e-mail in voor een code. Na het inloggen openen we direct de betaalopties voor je gekozen plan.",
    emailLabel: "E-mail",
    emailPlaceholder: "jij@example.com",
    codeLabel: "Code",
    codePlaceholder: "Voer de 6-cijferige code in",
    sendCode: "Code sturen",
    sendCodeBusy: "Versturen…",
    codeSent: "De code is verstuurd. Check je mailbox.",
    codeCooldown: "Er is net een code verstuurd. Probeer opnieuw over {seconds} seconden.",
    devCodeNotice: "Lokale ontwikkelcode: {code}",
    loginSubmit: "Inloggen en doorgaan",
    loginBusy: "Inloggen…",
    socialDivider: "Of ga verder met",
    loginWithGoogle: "Google",
    loginWithApple: "Apple",
    loginWithMicrosoft: "Microsoft",
    loginFinePrint: "Door verder te gaan ga je later akkoord met de voorwaarden en privacyverklaring.",
    loginPreviewNotice: "E-mailcodes zijn gekoppeld; OAuth en echte betaling komen in de volgende stap.",
    closeLogin: "Sluit loginvenster",
    socialComingSoon: "Binnenkort",
    authErrorInvalidEmail: "Vul een geldig e-mailadres in.",
    authErrorInvalidCode: "De code is ongeldig of verlopen. Controleer hem of vraag een nieuwe aan.",
    authErrorTooMany: "Te veel pogingen. Vraag een nieuwe code aan.",
    authErrorEmailFailed: "De verificatiemail kon niet worden verstuurd. Probeer het later opnieuw.",
    authErrorGeneric: "Inloggen is tijdelijk niet beschikbaar. Probeer het later opnieuw.",
    nicknameTitle: "Hoe mogen we je noemen?",
    nicknameSubtitle: "Alleen een bijnaam. Die gebruiken we voor je avatar en latere persoonlijke meldingen.",
    nicknameLabel: "Bijnaam",
    nicknamePlaceholder: "Hoe mogen we u noemen?",
    nicknameSubmit: "Opslaan en doorgaan",
    nicknameSaving: "Opslaan…",
    nicknameError: "Gebruik 1–40 tekens en minstens één letter of cijfer.",
    included: "Inbegrepen",
    alertsFeature: "E-mail bij nieuwe voorraad",
    stockFeature: "Toegang tot realtime voorraad",
    deliveryFeature: "Winkels filteren op bezorgland",
    presaleFeature: "Op voorraad/pre-order gescheiden",
    cancellationFeature: "Altijd opzegbaar, toegang tot einde periode",
    noStockFeature: "Geen realtime voorraadpagina",
    compareTitle: "Vergelijk functies",
    faqTitle: "Veelgestelde vragen",
    faqCancelQ: "Kan ik altijd opzeggen?",
    faqCancelA: "Ja. Na opzeggen verlengen we niet meer, maar je toegang blijft tot het einde van de huidige periode.",
    faqStockQ: "Waarom kan voorraad na een melding alweer weg zijn?",
    faqStockA: "Tijdens hittegolven verandert voorraad snel. We melden zo snel mogelijk, maar kunnen winkelvoorraad niet reserveren.",
    faqCountryQ: "Kan ik van land wisselen?",
    faqCountryA: "Ja, in Profile. Daarna toont de realtime pagina automatisch winkels voor dat land.",
    error: "Abonnement kon niet worden voltooid. Probeer het later opnieuw.",
  },
  en: {
    productName: "Airco Tracker",
    backHome: "Back home",
    eyebrow: "Heatwave subscription",
    title: "Stop missing newly available AC stock.",
    subtitle: "Choose email alerts, or unlock the realtime stock radar. Cancel anytime; access continues until the end of your current period.",
    weekly: "Weekly",
    monthly: "Monthly",
    alertsName: "Stock alerts",
    alertsTagline: "For users who only want email alerts and do not need the realtime stock page.",
    stockName: "Realtime radar",
    stockTagline: "For users actively trying to buy an AC during a heatwave.",
    bestValue: "Recommended",
    choose: "Choose plan",
    currentPlan: "Current plan",
    checkoutTitle: "Confirm subscription",
    checkoutBody: "Next, you will be redirected to secure Stripe Checkout to pay by card. Card details never touch Airco Tracker servers.",
    changeCheckoutTitle: "Confirm subscription change",
    changeCheckoutBody: "We will update your existing subscription through Stripe and use your saved payment method for any difference. Card details never touch Airco Tracker servers.",
    paymentMethod: "Payment method",
    card: "Credit card",
    ideal: "iDEAL",
    cardNumber: "Card number",
    cardExpiry: "Expiry",
    cardCvc: "CVC",
    idealBank: "Choose bank",
    completePayment: "Continue to secure Stripe payment",
    completeChange: "Confirm subscription change",
    processing: "Processing…",
    sandboxNotice: "We are wiring the card path first. iDEAL/Wero can be added after Stripe is stable.",
    loginTitle: "Log in to continue",
    loginSubtitle: "Enter your email for a code. After login, we will open payment options for the plan you selected.",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    codeLabel: "Verification code",
    codePlaceholder: "Enter 6-digit code",
    sendCode: "Send code",
    sendCodeBusy: "Sending…",
    codeSent: "Code sent. Please check your inbox.",
    codeCooldown: "A code was just sent. Try again in {seconds} seconds.",
    devCodeNotice: "Local development code: {code}",
    loginSubmit: "Log in and continue",
    loginBusy: "Signing in…",
    socialDivider: "Or continue with",
    loginWithGoogle: "Google",
    loginWithApple: "Apple",
    loginWithMicrosoft: "Microsoft",
    loginFinePrint: "By continuing, you will later agree to the terms and privacy policy.",
    loginPreviewNotice: "Email codes are wired; OAuth and real payment come next.",
    closeLogin: "Close login dialog",
    socialComingSoon: "Coming soon",
    authErrorInvalidEmail: "Please enter a valid email address.",
    authErrorInvalidCode: "That code is invalid or expired. Check it or request a new one.",
    authErrorTooMany: "Too many attempts. Please request a new code.",
    authErrorEmailFailed: "The verification email could not be sent. Please try again later.",
    authErrorGeneric: "Login is temporarily unavailable. Please try again later.",
    nicknameTitle: "What should we call you?",
    nicknameSubtitle: "Just a nickname. We use it for your avatar and future personalized alerts.",
    nicknameLabel: "Nickname",
    nicknamePlaceholder: "What should we call you?",
    nicknameSubmit: "Save and continue",
    nicknameSaving: "Saving…",
    nicknameError: "Use 1–40 characters and include at least one letter or number.",
    included: "Included",
    alertsFeature: "Email alerts when stock appears",
    stockFeature: "Realtime stock page access",
    deliveryFeature: "Store filtering by delivery country",
    presaleFeature: "In-stock/pre-order separation",
    cancellationFeature: "Cancel anytime, access through period end",
    noStockFeature: "No realtime stock page",
    compareTitle: "Compare features",
    faqTitle: "FAQ",
    faqCancelQ: "Can I cancel anytime?",
    faqCancelA: "Yes. After cancellation, renewal stops and your current access remains until the end of the billing period.",
    faqStockQ: "Why can stock be gone after I receive an alert?",
    faqStockA: "Heatwave inventory moves very quickly. We notify as fast as possible, but stores do not reserve stock for us.",
    faqCountryQ: "Can I switch country?",
    faqCountryA: "Yes, from Profile. The realtime page then automatically shows stores for that delivery country.",
    error: "We could not complete the subscription. Please try again later.",
  },
};

type SubscriptionPageProps = {
  lang: Lang;
  setLang: (next: Lang) => void;
};

export function SubscriptionPage({ lang, setLang }: SubscriptionPageProps) {
  const copy = SUBSCRIPTION_COPY[lang];
  const [user, setUser] = useState<UserProfile | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("weekly");
  const [selectedPlan, setSelectedPlan] = useState<PaidSubscriptionPlan | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
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
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.title = "Subscribe · Airco Tracker";
    let ignore = false;
    getCurrentUser()
      .then((nextUser) => {
        if (ignore) return;
        setUser(nextUser);
      })
      .catch(() => undefined);
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
      if (event.key === "Escape" && loginOpen) setLoginOpen(false);
    };
    if (dialogOpen) window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("landing-dialog-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [loginOpen, nicknameOpen]);

  useEffect(() => {
    if (codeCooldownSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCodeCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldownSeconds]);

  const visiblePlans = useMemo(
    () => PAID_SUBSCRIPTION_PLANS.filter((plan) => SUBSCRIPTION_PLAN_DETAILS[plan].billingCycle === billingCycle),
    [billingCycle],
  );
  const isChangingSubscription = Boolean(user && subscriptionIsActive(user));

  const scrollToCheckout = () => {
    window.setTimeout(() => document.getElementById("checkout")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const choosePlan = (plan: PaidSubscriptionPlan) => {
    setSelectedPlan(plan);
    setError("");
    if (!user) {
      setLoginError("");
      setLoginMessage("");
      setLoginOpen(true);
      return;
    }
    scrollToCheckout();
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
      setLoginOpen(false);
      setCode("");
      if (result.needsOnboarding || !result.user.nickname) {
        setNickname("");
        setNicknameOpen(true);
      } else {
        scrollToCheckout();
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
      scrollToCheckout();
    } catch {
      setNicknameError(copy.nicknameError);
    } finally {
      setSavingNickname(false);
    }
  };

  const completePayment = async () => {
    if (!selectedPlan) return;
    setError("");
    setProcessing(true);
    try {
      const checkout = await createCheckoutSession(selectedPlan, lang);
      window.location.href = checkout.url;
    } catch {
      setError(copy.error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="subscription-shell">
      <header className="profile-nav subscription-nav">
        <a className="landing-logo" href={`/?lang=${lang}`} aria-label={copy.productName}>
          <span className="landing-logo-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>{copy.productName}</span>
        </a>
        <div className="landing-nav-actions">
          <LanguageSwitcher lang={lang} setLang={setLang} />
          <a className="landing-secondary-button profile-home-link" href={`/?lang=${lang}`}>{copy.backHome}</a>
        </div>
      </header>

      <section className="subscription-hero">
        <p className="landing-kicker">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <div className="subscription-toggle" aria-label="Billing cycle">
          <button className={billingCycle === "weekly" ? "subscription-toggle--active" : ""} type="button" onClick={() => setBillingCycle("weekly")}>
            {copy.weekly}
          </button>
          <button className={billingCycle === "monthly" ? "subscription-toggle--active" : ""} type="button" onClick={() => setBillingCycle("monthly")}>
            {copy.monthly}
          </button>
        </div>
      </section>

      <section className="subscription-grid" aria-label="Subscription plans">
        {visiblePlans.map((plan) => {
          const details = SUBSCRIPTION_PLAN_DETAILS[plan];
          const isStockPlan = details.realtimeStock;
          const isCurrent = user && subscriptionIsActive(user) && user.subscriptionPlan === plan;
          return (
            <article className={`subscription-card${isStockPlan ? " subscription-card--featured" : ""}${isCurrent ? " subscription-card--current" : ""}`} key={plan} aria-current={isCurrent ? "true" : undefined}>
              {isStockPlan && <span className="subscription-badge">{copy.bestValue}</span>}
              <div>
                <p className="landing-kicker">{isStockPlan ? copy.stockName : copy.alertsName}</p>
                <h2>€{details.priceEur}<span> / {billingCycle === "weekly" ? copy.weekly : copy.monthly}</span></h2>
                <p>{isStockPlan ? copy.stockTagline : copy.alertsTagline}</p>
              </div>
              <ul>
                <li>{copy.alertsFeature}</li>
                <li>{isStockPlan ? copy.stockFeature : copy.noStockFeature}</li>
                <li>{copy.deliveryFeature}</li>
                <li>{copy.cancellationFeature}</li>
              </ul>
              <button className={isStockPlan ? "landing-primary-button" : "landing-secondary-button"} type="button" disabled={Boolean(isCurrent)} onClick={() => choosePlan(plan)}>
                {isCurrent ? copy.currentPlan : copy.choose}
              </button>
            </article>
          );
        })}
      </section>

      {selectedPlan && user && (
        <section id="checkout" className="checkout-card">
          <div>
            <p className="landing-kicker">{copy.paymentMethod}</p>
            <h2>{isChangingSubscription ? copy.changeCheckoutTitle : copy.checkoutTitle}</h2>
            <p>{isChangingSubscription ? copy.changeCheckoutBody : copy.checkoutBody}</p>
            <p className="checkout-sandbox">{copy.sandboxNotice}</p>
          </div>
          <div className="checkout-summary">
            <strong>{planName(selectedPlan, copy)}</strong>
            <span>€{SUBSCRIPTION_PLAN_DETAILS[selectedPlan].priceEur} / {SUBSCRIPTION_PLAN_DETAILS[selectedPlan].billingCycle === "weekly" ? copy.weekly : copy.monthly}</span>
          </div>
          <div className="payment-methods">
            <button className="payment-method--active" type="button" disabled>
              {copy.card}
            </button>
          </div>
          {error && <p className="landing-login-error">{error}</p>}
          <button className="landing-primary-button landing-primary-button--large" type="button" disabled={processing} onClick={completePayment}>
            {processing ? copy.processing : isChangingSubscription ? copy.completeChange : copy.completePayment}
          </button>
        </section>
      )}

      <section className="subscription-compare">
        <h2>{copy.compareTitle}</h2>
        <div className="subscription-compare-grid">
          <span>{copy.alertsFeature}</span><strong>✓</strong><strong>✓</strong>
          <span>{copy.stockFeature}</span><strong>—</strong><strong>✓</strong>
          <span>{copy.presaleFeature}</span><strong>✓</strong><strong>✓</strong>
          <span>{copy.cancellationFeature}</span><strong>✓</strong><strong>✓</strong>
        </div>
      </section>

      <section className="subscription-faq">
        <h2>{copy.faqTitle}</h2>
        <details>
          <summary>{copy.faqCancelQ}</summary>
          <p>{copy.faqCancelA}</p>
        </details>
        <details>
          <summary>{copy.faqStockQ}</summary>
          <p>{copy.faqStockA}</p>
        </details>
        <details>
          <summary>{copy.faqCountryQ}</summary>
          <p>{copy.faqCountryA}</p>
        </details>
      </section>

      {loginOpen && (
        <div className="landing-login-backdrop" onMouseDown={closeLogin}>
          <section
            className="landing-login-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-login-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="landing-login-close" type="button" onClick={closeLogin} aria-label={copy.closeLogin}>
              ×
            </button>
            <div className="landing-login-brand" aria-hidden="true">
              <span className="landing-logo-mark"><i /><i /><i /></span>
              <span>{copy.productName}</span>
            </div>
            <div className="landing-login-copy">
              <p className="landing-kicker">{copy.choose}</p>
              <h2 id="subscription-login-title">{copy.loginTitle}</h2>
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
            aria-labelledby="subscription-nickname-title"
          >
            <div className="landing-login-brand" aria-hidden="true">
              <span className="landing-logo-mark"><i /><i /><i /></span>
              <span>{copy.productName}</span>
            </div>
            <div className="landing-login-copy">
              <p className="landing-kicker">{email}</p>
              <h2 id="subscription-nickname-title">{copy.nicknameTitle}</h2>
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

function planName(plan: PaidSubscriptionPlan, copy: SubscriptionCopy): string {
  if (!isPaidSubscriptionPlan(plan)) return "";
  return SUBSCRIPTION_PLAN_DETAILS[plan].realtimeStock ? copy.stockName : copy.alertsName;
}

function authErrorMessage(error: unknown, copy: SubscriptionCopy): string {
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
