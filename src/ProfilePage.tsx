import { useEffect, useState } from "react";
import {
  PAID_SUBSCRIPTION_PLANS,
  SUPPORTED_DELIVERY_COUNTRIES,
  SUPPORTED_LANGUAGE_PREFERENCES,
  userInitials,
  type DeliveryCountry,
  type PaidSubscriptionPlan,
} from "../shared/auth";
import { getCurrentUser, logout, updatePreferences, type UserProfile } from "./authClient";
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
    languagePreference: "语言偏好",
    country: "国家",
    change: "更改",
    none: "尚未订阅",
    logout: "登出",
    paidPlansTitle: "预留的订阅档位",
    paidPlansBody: "支付接入后，会从下面四个付费档位里选择一个写入用户资料。",
    weeklyBasic: "周订阅 · 标准",
    weeklyPriority: "周订阅 · 优先提醒",
    monthlyBasic: "月订阅 · 标准",
    monthlyPriority: "月订阅 · 优先提醒",
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
    languagePreference: "Taalvoorkeur",
    country: "Land",
    change: "Wijzigen",
    none: "Nog geen abonnement",
    logout: "Uitloggen",
    paidPlansTitle: "Voorbereide abonnementen",
    paidPlansBody: "Zodra betaling gekoppeld is, wordt één van deze vier betaalde plannen opgeslagen.",
    weeklyBasic: "Week · standaard",
    weeklyPriority: "Week · prioriteitsmeldingen",
    monthlyBasic: "Maand · standaard",
    monthlyPriority: "Maand · prioriteitsmeldingen",
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
    languagePreference: "Language preference",
    country: "Country",
    change: "Change",
    none: "Not subscribed yet",
    logout: "Log out",
    paidPlansTitle: "Prepared subscription plans",
    paidPlansBody: "Once payment is wired, one of these four paid plans will be stored on the user profile.",
    weeklyBasic: "Weekly · standard",
    weeklyPriority: "Weekly · priority alerts",
    monthlyBasic: "Monthly · standard",
    monthlyPriority: "Monthly · priority alerts",
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
    document.body.classList.toggle("landing-dialog-open", languageModalOpen || countryModalOpen || countryConfirmOpen);
    return () => document.body.classList.remove("landing-dialog-open");
  }, [countryConfirmOpen, countryModalOpen, languageModalOpen]);

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
                <dd>{user.subscriptionPlan === "none" ? copy.none : copy[PLAN_LABEL_KEYS[user.subscriptionPlan]]}</dd>
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
            <button className="profile-logout-button" type="button" onClick={handleLogout}>{copy.logout}</button>
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
    </main>
  );
}

function countryLabel(country: DeliveryCountry, copy: ProfileCopy): string {
  return country === "fr" ? copy.france : copy.netherlands;
}
