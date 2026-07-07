import { useEffect, useMemo, useState } from "react";
import {
  PAID_SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_DETAILS,
  isPaidSubscriptionPlan,
  subscriptionIsActive,
  type BillingCycle,
  type PaidSubscriptionPlan,
  type PaymentMethod,
} from "../shared/auth";
import { completePreviewPayment, getCurrentUser, type UserProfile } from "./authClient";
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
  paymentMethod: string;
  card: string;
  ideal: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  idealBank: string;
  completePayment: string;
  processing: string;
  sandboxNotice: string;
  loginRequired: string;
  loginCta: string;
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
    checkoutBody: "选择支付方式。当前为支付流程预览，不会扣款；接入支付商后这里会跳转真实 Checkout。",
    paymentMethod: "支付方式",
    card: "信用卡",
    ideal: "iDEAL",
    cardNumber: "卡号",
    cardExpiry: "有效期",
    cardCvc: "CVC",
    idealBank: "选择银行",
    completePayment: "完成测试支付",
    processing: "处理中…",
    sandboxNotice: "Sandbox preview：不会真实扣款，也不会保存卡号或银行信息。",
    loginRequired: "登录后即可选择订阅方案。",
    loginCta: "回到首页登录",
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
    checkoutBody: "Kies je betaalmethode. Dit is nu een betaalpreview zonder afschrijving; later koppelen we echte Checkout.",
    paymentMethod: "Betaalmethode",
    card: "Creditcard",
    ideal: "iDEAL",
    cardNumber: "Kaartnummer",
    cardExpiry: "Vervaldatum",
    cardCvc: "CVC",
    idealBank: "Kies bank",
    completePayment: "Testbetaling afronden",
    processing: "Bezig…",
    sandboxNotice: "Sandbox preview: er wordt niets afgeschreven en we bewaren geen kaart- of bankgegevens.",
    loginRequired: "Log in om een abonnement te kiezen.",
    loginCta: "Terug naar login",
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
    checkoutBody: "Choose a payment method. This is currently a payment preview and will not charge you; later this becomes real Checkout.",
    paymentMethod: "Payment method",
    card: "Credit card",
    ideal: "iDEAL",
    cardNumber: "Card number",
    cardExpiry: "Expiry",
    cardCvc: "CVC",
    idealBank: "Choose bank",
    completePayment: "Complete test payment",
    processing: "Processing…",
    sandboxNotice: "Sandbox preview: no real charge, and no card or bank details are stored.",
    loginRequired: "Log in to choose a subscription.",
    loginCta: "Back to login",
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
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("weekly");
  const [selectedPlan, setSelectedPlan] = useState<PaidSubscriptionPlan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Subscribe · Airco Tracker";
    let ignore = false;
    getCurrentUser()
      .then((nextUser) => {
        if (ignore) return;
        setUser(nextUser);
        if (nextUser?.languagePreference && nextUser.languagePreference !== lang) setLang(nextUser.languagePreference);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [lang, setLang]);

  const visiblePlans = useMemo(
    () => PAID_SUBSCRIPTION_PLANS.filter((plan) => SUBSCRIPTION_PLAN_DETAILS[plan].billingCycle === billingCycle),
    [billingCycle],
  );

  const choosePlan = (plan: PaidSubscriptionPlan) => {
    setSelectedPlan(plan);
    window.setTimeout(() => document.getElementById("checkout")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const completePayment = async () => {
    if (!selectedPlan) return;
    setError("");
    setProcessing(true);
    try {
      const updated = await completePreviewPayment(selectedPlan, paymentMethod);
      setUser(updated);
      window.location.href = `/ready?lang=${updated.languagePreference}`;
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

      {!loading && !user && (
        <section className="subscription-login-card">
          <h2>{copy.loginRequired}</h2>
          <a className="landing-primary-button" href={`/?lang=${lang}`}>{copy.loginCta}</a>
        </section>
      )}

      <section className="subscription-grid" aria-label="Subscription plans">
        {visiblePlans.map((plan) => {
          const details = SUBSCRIPTION_PLAN_DETAILS[plan];
          const isStockPlan = details.realtimeStock;
          const isCurrent = user && subscriptionIsActive(user) && user.subscriptionPlan === plan;
          return (
            <article className={`subscription-card${isStockPlan ? " subscription-card--featured" : ""}`} key={plan}>
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
              <button className={isStockPlan ? "landing-primary-button" : "landing-secondary-button"} type="button" disabled={!user || Boolean(isCurrent)} onClick={() => choosePlan(plan)}>
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
            <h2>{copy.checkoutTitle}</h2>
            <p>{copy.checkoutBody}</p>
            <p className="checkout-sandbox">{copy.sandboxNotice}</p>
          </div>
          <div className="checkout-summary">
            <strong>{planName(selectedPlan, copy)}</strong>
            <span>€{SUBSCRIPTION_PLAN_DETAILS[selectedPlan].priceEur} / {SUBSCRIPTION_PLAN_DETAILS[selectedPlan].billingCycle === "weekly" ? copy.weekly : copy.monthly}</span>
          </div>
          <div className="payment-methods">
            <button className={paymentMethod === "card" ? "payment-method--active" : ""} type="button" onClick={() => setPaymentMethod("card")}>
              {copy.card}
            </button>
            <button className={paymentMethod === "ideal" ? "payment-method--active" : ""} type="button" onClick={() => setPaymentMethod("ideal")}>
              {copy.ideal}
            </button>
          </div>
          {paymentMethod === "card" ? (
            <div className="payment-fields">
              <input aria-label={copy.cardNumber} placeholder="4242 4242 4242 4242" />
              <input aria-label={copy.cardExpiry} placeholder="MM / YY" />
              <input aria-label={copy.cardCvc} placeholder="CVC" />
            </div>
          ) : (
            <label className="payment-bank">
              <span>{copy.idealBank}</span>
              <select>
                <option>ING</option>
                <option>ABN AMRO</option>
                <option>Rabobank</option>
                <option>Bunq</option>
                <option>Revolut</option>
              </select>
            </label>
          )}
          {error && <p className="landing-login-error">{error}</p>}
          <button className="landing-primary-button landing-primary-button--large" type="button" disabled={processing} onClick={completePayment}>
            {processing ? copy.processing : copy.completePayment}
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
    </main>
  );
}

function planName(plan: PaidSubscriptionPlan, copy: SubscriptionCopy): string {
  if (!isPaidSubscriptionPlan(plan)) return "";
  return SUBSCRIPTION_PLAN_DETAILS[plan].realtimeStock ? copy.stockName : copy.alertsName;
}
