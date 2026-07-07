import { useEffect, useState } from "react";
import {
  PAID_SUBSCRIPTION_PLANS,
  SUPPORTED_DELIVERY_COUNTRIES,
  SUPPORTED_LANGUAGE_PREFERENCES,
  userInitials,
  subscriptionIsActive,
  isPaidSubscriptionPlan,
  type DeliveryCountry,
  type PaidSubscriptionPlan,
} from "../shared/auth";
import { cancelSubscription as cancelSubscriptionRequest, deleteAccount, getCurrentUser, logout, updatePreferences, type UserProfile } from "./authClient";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Lang } from "./i18n";

type ProfileCopy = {
  productName: string;
  backHome: string;
  title: string;
  subtitle: string;
  loading: string;
  notLoggedIn: string;
  loginFromHome: string;
  email: string;
  nickname: string;
  subscriptionPlan: string;
  subscriptionActiveUntil: string;
  subscriptionCancelScheduled: string;
  subscriptionExpired: string;
  cancelSubscription: string;
  cancelingSubscription: string;
  subscriptionCancelError: string;
  changeSubscription: string;
  pendingSubscription: string;
  deleteAccount: string;
  deleteAccountBlocked: string;
  deleteAccountTitle: string;
  deleteAccountBody: string;
  deleteAccountConfirm: string;
  deletingAccount: string;
  deleteAccountError: string;
  languagePreference: string;
  country: string;
  change: string;
  none: string;
  logout: string;
  paidPlansTitle: string;
  paidPlansBody: string;
  weeklyBasic: string;
  weeklyPriority: string;
  monthlyBasic: string;
  monthlyPriority: string;
  languageModalTitle: string;
  languageModalBody: string;
  countryModalTitle: string;
  countryModalBody: string;
  countryOk: string;
  cancel: string;
  countryConfirmTitle: string;
  countryConfirmBody: string;
  countryConfirm: string;
  saving: string;
  preferenceError: string;
  france: string;
  netherlands: string;
};

const PROFILE_COPY: Record<Lang, ProfileCopy> = {
  zh: {
    productName: "Airco Tracker",
    backHome: "返回首页",
    title: "Profile",
    subtitle: "这里目前只保存最少的信息：邮箱、昵称、订阅档位、语言偏好和配送国家。",
    loading: "正在读取账号信息…",
    notLoggedIn: "你还没有登录。",
    loginFromHome: "回到首页登录",
    email: "邮箱",
    nickname: "昵称",
    subscriptionPlan: "订阅方案",
    subscriptionActiveUntil: "权益有效至",
    subscriptionCancelScheduled: "已取消，权益会保留到本周期结束。",
    subscriptionExpired: "订阅已过期",
    cancelSubscription: "取消订阅",
    cancelingSubscription: "取消中…",
    subscriptionCancelError: "订阅暂时无法取消，请稍后再试。",
    changeSubscription: "更改订阅方案",
    pendingSubscription: "将在 {date} 切换为 {plan}",
    deleteAccount: "注销账户",
    deleteAccountBlocked: "订阅仍在有效期内，暂时不能注销账户。",
    deleteAccountTitle: "确认注销账户？",
    deleteAccountBody: "注销后会删除你的邮箱、昵称、偏好和登录会话。这个操作不能撤销。",
    deleteAccountConfirm: "确认注销",
    deletingAccount: "注销中…",
    deleteAccountError: "账户暂时无法注销，请确认订阅已到期后再试。",
    languagePreference: "语言偏好",
    country: "国家",
    change: "更改",
    none: "尚未订阅",
    logout: "登出",
    paidPlansTitle: "预留的订阅档位",
    paidPlansBody: "支付接入后，会从下面四个付费档位里选择一个写入用户资料。",
    weeklyBasic: "周订阅 · 库存提醒",
    weeklyPriority: "周订阅 · 实时雷达",
    monthlyBasic: "月订阅 · 库存提醒",
    monthlyPriority: "月订阅 · 实时雷达",
    languageModalTitle: "选择语言偏好",
    languageModalBody: "这会保存到你的账号里，并立即切换当前页面语言。",
    countryModalTitle: "选择配送国家",
    countryModalBody: "我们会按这个国家展示可配送的网站和库存列表。",
    countryOk: "确定",
    cancel: "取消",
    countryConfirmTitle: "确认切换国家？",
    countryConfirmBody: "切换国家会改变追踪的网站列表，确认切换吗？",
    countryConfirm: "确认切换",
    saving: "保存中…",
    preferenceError: "偏好设置暂时保存失败，请稍后再试。",
    france: "法国",
    netherlands: "荷兰",
  },
  nl: {
    productName: "Airco Tracker",
    backHome: "Terug naar home",
    title: "Profile",
    subtitle: "We bewaren nu alleen het minimum: e-mail, bijnaam, abonnement, taalvoorkeur en bezorgland.",
    loading: "Accountgegevens laden…",
    notLoggedIn: "Je bent nog niet ingelogd.",
    loginFromHome: "Log in vanaf home",
    email: "E-mail",
    nickname: "Bijnaam",
    subscriptionPlan: "Abonnement",
    subscriptionActiveUntil: "Toegang geldig tot",
    subscriptionCancelScheduled: "Opgezegd; toegang blijft tot het einde van deze periode.",
    subscriptionExpired: "Abonnement verlopen",
    cancelSubscription: "Abonnement opzeggen",
    cancelingSubscription: "Opzeggen…",
    subscriptionCancelError: "We konden je abonnement niet opzeggen. Probeer het later opnieuw.",
    changeSubscription: "Abonnement wijzigen",
    pendingSubscription: "Wordt op {date} gewijzigd naar {plan}",
    deleteAccount: "Account verwijderen",
    deleteAccountBlocked: "Je abonnement is nog actief; je kunt je account nog niet verwijderen.",
    deleteAccountTitle: "Account verwijderen?",
    deleteAccountBody: "We verwijderen je e-mail, bijnaam, voorkeuren en sessies. Dit kan niet ongedaan worden gemaakt.",
    deleteAccountConfirm: "Verwijderen",
    deletingAccount: "Verwijderen…",
    deleteAccountError: "We konden je account niet verwijderen. Controleer of je abonnement is verlopen.",
    languagePreference: "Taalvoorkeur",
    country: "Land",
    change: "Wijzigen",
    none: "Nog geen abonnement",
    logout: "Uitloggen",
    paidPlansTitle: "Voorbereide abonnementen",
    paidPlansBody: "Zodra betaling gekoppeld is, wordt één van deze vier betaalde plannen opgeslagen.",
    weeklyBasic: "Week · voorraadmeldingen",
    weeklyPriority: "Week · realtime radar",
    monthlyBasic: "Maand · voorraadmeldingen",
    monthlyPriority: "Maand · realtime radar",
    languageModalTitle: "Kies je taalvoorkeur",
    languageModalBody: "We slaan dit op in je account en wisselen de huidige pagina meteen om.",
    countryModalTitle: "Kies bezorgland",
    countryModalBody: "We tonen winkels en voorraad op basis van dit land.",
    countryOk: "OK",
    cancel: "Annuleren",
    countryConfirmTitle: "Land wijzigen?",
    countryConfirmBody: "Als je van land wisselt, verandert de lijst met gevolgde winkels. Weet je het zeker?",
    countryConfirm: "Bevestigen",
    saving: "Opslaan…",
    preferenceError: "Je voorkeur kon niet worden opgeslagen. Probeer het later opnieuw.",
    france: "Frankrijk",
    netherlands: "Nederland",
  },
  en: {
    productName: "Airco Tracker",
    backHome: "Back home",
    title: "Profile",
    subtitle: "For now we only store the minimum: email, nickname, subscription plan, language preference and delivery country.",
    loading: "Loading account…",
    notLoggedIn: "You are not logged in yet.",
    loginFromHome: "Log in from home",
    email: "Email",
    nickname: "Nickname",
    subscriptionPlan: "Subscription plan",
    subscriptionActiveUntil: "Access active until",
    subscriptionCancelScheduled: "Canceled; access remains through the current period.",
    subscriptionExpired: "Subscription expired",
    cancelSubscription: "Cancel subscription",
    cancelingSubscription: "Canceling…",
    subscriptionCancelError: "We could not cancel your subscription. Please try again later.",
    changeSubscription: "Change subscription",
    pendingSubscription: "Will switch to {plan} on {date}",
    deleteAccount: "Delete account",
    deleteAccountBlocked: "Your subscription is still active, so the account cannot be deleted yet.",
    deleteAccountTitle: "Delete account?",
    deleteAccountBody: "We will delete your email, nickname, preferences and sessions. This cannot be undone.",
    deleteAccountConfirm: "Delete account",
    deletingAccount: "Deleting…",
    deleteAccountError: "We could not delete your account. Please make sure your subscription has expired.",
    languagePreference: "Language preference",
    country: "Country",
    change: "Change",
    none: "Not subscribed yet",
    logout: "Log out",
    paidPlansTitle: "Prepared subscription plans",
    paidPlansBody: "Once payment is wired, one of these four paid plans will be stored on the user profile.",
    weeklyBasic: "Weekly · stock alerts",
    weeklyPriority: "Weekly · realtime radar",
    monthlyBasic: "Monthly · stock alerts",
    monthlyPriority: "Monthly · realtime radar",
    languageModalTitle: "Choose language preference",
    languageModalBody: "We save this to your account and switch the current page immediately.",
    countryModalTitle: "Choose delivery country",
    countryModalBody: "We show stores and stock based on this country.",
    countryOk: "OK",
    cancel: "Cancel",
    countryConfirmTitle: "Confirm country switch?",
    countryConfirmBody: "Switching country will change the list of tracked websites. Do you want to continue?",
    countryConfirm: "Confirm switch",
    saving: "Saving…",
    preferenceError: "We could not save your preference. Please try again later.",
    france: "France",
    netherlands: "Netherlands",
  },
};

const PLAN_LABEL_KEYS: Record<PaidSubscriptionPlan, keyof ProfileCopy> = {
  weekly_basic: "weeklyBasic",
  weekly_priority: "weeklyPriority",
  monthly_basic: "monthlyBasic",
  monthly_priority: "monthlyPriority",
};

const LANGUAGE_OPTIONS: Record<Lang, { flag: string; label: string }> = {
  zh: { flag: "🇨🇳", label: "中文" },
  nl: { flag: "🇳🇱", label: "Nederlands" },
  en: { flag: "🇬🇧", label: "English" },
};

type ProfilePageProps = {
  lang: Lang;
  setLang: (next: Lang) => void;
};

export function ProfilePage({ lang, setLang }: ProfilePageProps) {
  const copy = PROFILE_COPY[lang];
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [countryConfirmOpen, setCountryConfirmOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<DeliveryCountry>("fr");
  const [pendingCountry, setPendingCountry] = useState<DeliveryCountry | null>(null);
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    document.title = "Profile · Airco Tracker";
    let ignore = false;
    getCurrentUser()
      .then((nextUser) => {
        if (ignore) return;
        setUser(nextUser);
        if (nextUser?.languagePreference && nextUser.languagePreference !== lang) {
          setLang(nextUser.languagePreference);
        }
        if (nextUser?.deliveryCountry) {
          setSelectedCountry(nextUser.deliveryCountry);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [lang, setLang]);

  useEffect(() => {
    document.body.classList.toggle("landing-dialog-open", languageModalOpen || countryModalOpen || countryConfirmOpen || deleteModalOpen);
    return () => document.body.classList.remove("landing-dialog-open");
  }, [countryConfirmOpen, countryModalOpen, deleteModalOpen, languageModalOpen]);

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    window.location.href = `/?lang=${lang}`;
  };

  const handleLanguageChange = async (languagePreference: Lang) => {
    if (!user) return;
    setPreferenceError("");
    setSavingPreference(true);
    try {
      const updated = await updatePreferences({ languagePreference });
      setUser(updated);
      setLang(languagePreference);
      setLanguageModalOpen(false);
    } catch {
      setPreferenceError(copy.preferenceError);
    } finally {
      setSavingPreference(false);
    }
  };

  const openCountryModal = () => {
    if (!user) return;
    setPreferenceError("");
    setSelectedCountry(user.deliveryCountry);
    setCountryModalOpen(true);
  };

  const handleCountrySelectionOk = () => {
    if (!user || selectedCountry === user.deliveryCountry) {
      setCountryModalOpen(false);
      return;
    }
    setPendingCountry(selectedCountry);
    setCountryModalOpen(false);
    setCountryConfirmOpen(true);
  };

  const confirmCountryChange = async () => {
    if (!pendingCountry) return;
    setPreferenceError("");
    setSavingPreference(true);
    try {
      const updated = await updatePreferences({ deliveryCountry: pendingCountry });
      setUser(updated);
      setCountryConfirmOpen(false);
      setPendingCountry(null);
    } catch {
      setPreferenceError(copy.preferenceError);
    } finally {
      setSavingPreference(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;
    setSubscriptionError("");
    setCancelingSubscription(true);
    try {
      const updated = await cancelSubscriptionRequest();
      setUser(updated);
    } catch {
      setSubscriptionError(copy.subscriptionCancelError);
    } finally {
      setCancelingSubscription(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setDeletingAccount(true);
    try {
      await deleteAccount();
      window.location.href = `/?lang=${lang}`;
    } catch {
      setDeleteError(copy.deleteAccountError);
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <main className="profile-shell">
      <header className="profile-nav">
        <a className="landing-logo" href={`/?lang=${lang}`} aria-label={copy.productName}>
          <span className="landing-logo-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>{copy.productName}</span>
        </a>
        <div className="landing-nav-actions">
          <LanguageSwitcher lang={lang} setLang={setLang} />
          <a className="landing-secondary-button profile-home-link" href={`/?lang=${lang}`}>{copy.backHome}</a>
        </div>
      </header>

      <section className="profile-card">
        {loading ? (
          <p className="profile-loading">{copy.loading}</p>
        ) : user ? (
          <>
            <div className="profile-card-header">
              <div className="profile-avatar" aria-hidden="true">{userInitials(user.nickname, user.email)}</div>
              <div>
                <p className="landing-kicker">{copy.productName}</p>
                <h1>{copy.title}</h1>
                <p>{copy.subtitle}</p>
              </div>
            </div>
            <dl className="profile-details">
              <div>
                <dt>{copy.email}</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>{copy.nickname}</dt>
                <dd>{user.nickname || "—"}</dd>
              </div>
              <div>
                <dt>{copy.subscriptionPlan}</dt>
                <dd>
                  <span>{user.subscriptionPlan === "none" ? copy.none : copy[PLAN_LABEL_KEYS[user.subscriptionPlan]]}</span>
                  {user.subscriptionPlan !== "none" && (
                    <span className="profile-subscription-note">
                      {subscriptionSummary(user, copy, lang)}
                    </span>
                  )}
                  {user.pendingSubscriptionPlan && user.pendingSubscriptionEffectiveAt && (
                    <span className="profile-subscription-note">
                      {copy.pendingSubscription
                        .replace("{date}", formatSubscriptionDate(user.pendingSubscriptionEffectiveAt, lang))
                        .replace("{plan}", copy[PLAN_LABEL_KEYS[user.pendingSubscriptionPlan]])}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>{copy.languagePreference}</dt>
                <dd>
                  <button className="profile-detail-action" type="button" onClick={() => setLanguageModalOpen(true)}>
                    <span>{LANGUAGE_OPTIONS[user.languagePreference].flag} {LANGUAGE_OPTIONS[user.languagePreference].label}</span>
                    <span>{copy.change}</span>
                  </button>
                </dd>
              </div>
              <div>
                <dt>{copy.country}</dt>
                <dd>
                  <button className="profile-detail-action" type="button" onClick={openCountryModal}>
                    <span>{countryLabel(user.deliveryCountry, copy)}</span>
                    <span>{copy.change}</span>
                  </button>
                </dd>
              </div>
            </dl>
            {user.subscriptionPlan !== "none" && (
              <div className="profile-subscription-actions">
                <a className="profile-change-subscription-link" href={`/subscribe?lang=${lang}`}>
                  {copy.changeSubscription}
                </a>
                {user.subscriptionCancelAtPeriodEnd ? (
                  <p>{copy.subscriptionCancelScheduled}</p>
                ) : subscriptionIsActive(user) ? (
                  <button
                    className="profile-cancel-subscription-button"
                    type="button"
                    disabled={cancelingSubscription}
                    onClick={handleCancelSubscription}
                  >
                    {cancelingSubscription ? copy.cancelingSubscription : copy.cancelSubscription}
                  </button>
                ) : null}
                {subscriptionError && <p className="landing-login-error">{subscriptionError}</p>}
              </div>
            )}
            <div className="profile-account-actions">
              <button className="profile-logout-button" type="button" onClick={handleLogout}>{copy.logout}</button>
              <button
                className="profile-delete-account-button"
                type="button"
                disabled={subscriptionIsActive(user)}
                title={subscriptionIsActive(user) ? copy.deleteAccountBlocked : undefined}
                onClick={() => setDeleteModalOpen(true)}
              >
                {copy.deleteAccount}
              </button>
            </div>
            {subscriptionIsActive(user) && <p className="profile-delete-hint">{copy.deleteAccountBlocked}</p>}
          </>
        ) : (
          <div className="profile-empty">
            <h1>{copy.notLoggedIn}</h1>
            <a className="landing-primary-button" href={`/?lang=${lang}`}>{copy.loginFromHome}</a>
          </div>
        )}
      </section>

      <section className="profile-plans">
        <div>
          <p className="landing-kicker">{copy.subscriptionPlan}</p>
          <h2>{copy.paidPlansTitle}</h2>
          <p>{copy.paidPlansBody}</p>
        </div>
        <div className="profile-plan-grid">
          {PAID_SUBSCRIPTION_PLANS.map((plan) => (
            <article key={plan}>
              <strong>{copy[PLAN_LABEL_KEYS[plan]]}</strong>
              <span>{plan}</span>
            </article>
          ))}
        </div>
      </section>

      {languageModalOpen && user && (
        <div className="landing-login-backdrop" onMouseDown={() => setLanguageModalOpen(false)}>
          <section
            className="landing-login-card profile-preference-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-language-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="landing-login-copy">
              <p className="landing-kicker">{copy.languagePreference}</p>
              <h2 id="profile-language-title">{copy.languageModalTitle}</h2>
              <p>{copy.languageModalBody}</p>
            </div>
            <div className="profile-option-list">
              {SUPPORTED_LANGUAGE_PREFERENCES.map((language) => (
                <button
                  key={language}
                  className={`profile-option${language === user.languagePreference ? " profile-option--active" : ""}`}
                  type="button"
                  disabled={savingPreference}
                  onClick={() => handleLanguageChange(language)}
                >
                  <span>{LANGUAGE_OPTIONS[language].flag} {LANGUAGE_OPTIONS[language].label}</span>
                  <span>{language === user.languagePreference ? "✓" : ""}</span>
                </button>
              ))}
            </div>
            {preferenceError && <p className="landing-login-error">{preferenceError}</p>}
          </section>
        </div>
      )}

      {countryModalOpen && user && (
        <div className="landing-login-backdrop" onMouseDown={() => setCountryModalOpen(false)}>
          <section
            className="landing-login-card profile-preference-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-country-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="landing-login-copy">
              <p className="landing-kicker">{copy.country}</p>
              <h2 id="profile-country-title">{copy.countryModalTitle}</h2>
              <p>{copy.countryModalBody}</p>
            </div>
            <div className="profile-option-list">
              {SUPPORTED_DELIVERY_COUNTRIES.map((country) => (
                <button
                  key={country}
                  className={`profile-option${country === selectedCountry ? " profile-option--active" : ""}`}
                  type="button"
                  onClick={() => setSelectedCountry(country)}
                >
                  <span>{countryLabel(country, copy)}</span>
                  <span>{country === selectedCountry ? "✓" : ""}</span>
                </button>
              ))}
            </div>
            <div className="profile-modal-actions">
              <button className="landing-secondary-button" type="button" onClick={() => setCountryModalOpen(false)}>
                {copy.cancel}
              </button>
              <button className="landing-primary-button" type="button" onClick={handleCountrySelectionOk}>
                {copy.countryOk}
              </button>
            </div>
          </section>
        </div>
      )}

      {countryConfirmOpen && (
        <div className="landing-login-backdrop" onMouseDown={() => setCountryConfirmOpen(false)}>
          <section
            className="landing-login-card profile-preference-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-country-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="landing-login-copy">
              <p className="landing-kicker">{pendingCountry ? countryLabel(pendingCountry, copy) : copy.country}</p>
              <h2 id="profile-country-confirm-title">{copy.countryConfirmTitle}</h2>
              <p>{copy.countryConfirmBody}</p>
            </div>
            {preferenceError && <p className="landing-login-error">{preferenceError}</p>}
            <div className="profile-modal-actions">
              <button className="landing-secondary-button" type="button" disabled={savingPreference} onClick={() => setCountryConfirmOpen(false)}>
                {copy.cancel}
              </button>
              <button className="landing-primary-button" type="button" disabled={savingPreference} onClick={confirmCountryChange}>
                {savingPreference ? copy.saving : copy.countryConfirm}
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteModalOpen && user && (
        <div className="landing-login-backdrop" onMouseDown={() => setDeleteModalOpen(false)}>
          <section
            className="landing-login-card profile-preference-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="landing-login-copy">
              <p className="landing-kicker">{user.email}</p>
              <h2 id="profile-delete-title">{copy.deleteAccountTitle}</h2>
              <p>{copy.deleteAccountBody}</p>
            </div>
            {deleteError && <p className="landing-login-error">{deleteError}</p>}
            <div className="profile-modal-actions">
              <button className="landing-secondary-button" type="button" disabled={deletingAccount} onClick={() => setDeleteModalOpen(false)}>
                {copy.cancel}
              </button>
              <button className="profile-delete-confirm-button" type="button" disabled={deletingAccount} onClick={handleDeleteAccount}>
                {deletingAccount ? copy.deletingAccount : copy.deleteAccountConfirm}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function countryLabel(country: DeliveryCountry, copy: ProfileCopy): string {
  return country === "fr" ? copy.france : copy.netherlands;
}

function subscriptionSummary(user: UserProfile, copy: ProfileCopy, lang: Lang): string {
  if (isPaidSubscriptionPlan(user.subscriptionPlan) && user.subscriptionStatus === "none") return copy.subscriptionExpired;
  if (!subscriptionIsActive(user)) return copy.subscriptionExpired;
  if (!user.subscriptionCurrentPeriodEnd) return "";
  return `${copy.subscriptionActiveUntil} ${formatSubscriptionDate(user.subscriptionCurrentPeriodEnd, lang)}`;
}

function formatSubscriptionDate(value: string, lang: Lang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang === "nl" ? "nl-NL" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
