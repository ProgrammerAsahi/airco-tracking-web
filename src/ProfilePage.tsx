import { useEffect, useState } from "react";
import { PAID_SUBSCRIPTION_PLANS, userInitials, type PaidSubscriptionPlan } from "../shared/auth";
import { getCurrentUser, logout, type UserProfile } from "./authClient";
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
  none: string;
  logout: string;
  paidPlansTitle: string;
  paidPlansBody: string;
  weeklyBasic: string;
  weeklyPriority: string;
  monthlyBasic: string;
  monthlyPriority: string;
};

const PROFILE_COPY: Record<Lang, ProfileCopy> = {
  zh: {
    productName: "Airco Tracker",
    backHome: "返回首页",
    title: "Profile",
    subtitle: "这里目前只保存最少的信息：邮箱、昵称和订阅档位。",
    loading: "正在读取账号信息…",
    notLoggedIn: "你还没有登录。",
    loginFromHome: "回到首页登录",
    email: "邮箱",
    nickname: "昵称",
    subscriptionPlan: "订阅方案",
    none: "尚未订阅",
    logout: "登出",
    paidPlansTitle: "预留的订阅档位",
    paidPlansBody: "支付接入后，会从下面四个付费档位里选择一个写入用户资料。",
    weeklyBasic: "周订阅 · 标准",
    weeklyPriority: "周订阅 · 优先提醒",
    monthlyBasic: "月订阅 · 标准",
    monthlyPriority: "月订阅 · 优先提醒",
  },
  nl: {
    productName: "Airco Tracker",
    backHome: "Terug naar home",
    title: "Profile",
    subtitle: "We bewaren nu alleen het minimum: e-mail, bijnaam en abonnementsplan.",
    loading: "Accountgegevens laden…",
    notLoggedIn: "Je bent nog niet ingelogd.",
    loginFromHome: "Log in vanaf home",
    email: "E-mail",
    nickname: "Bijnaam",
    subscriptionPlan: "Abonnement",
    none: "Nog geen abonnement",
    logout: "Uitloggen",
    paidPlansTitle: "Voorbereide abonnementen",
    paidPlansBody: "Zodra betaling gekoppeld is, wordt één van deze vier betaalde plannen opgeslagen.",
    weeklyBasic: "Week · standaard",
    weeklyPriority: "Week · prioriteitsmeldingen",
    monthlyBasic: "Maand · standaard",
    monthlyPriority: "Maand · prioriteitsmeldingen",
  },
  en: {
    productName: "Airco Tracker",
    backHome: "Back home",
    title: "Profile",
    subtitle: "For now we only store the minimum: email, nickname and subscription plan.",
    loading: "Loading account…",
    notLoggedIn: "You are not logged in yet.",
    loginFromHome: "Log in from home",
    email: "Email",
    nickname: "Nickname",
    subscriptionPlan: "Subscription plan",
    none: "Not subscribed yet",
    logout: "Log out",
    paidPlansTitle: "Prepared subscription plans",
    paidPlansBody: "Once payment is wired, one of these four paid plans will be stored on the user profile.",
    weeklyBasic: "Weekly · standard",
    weeklyPriority: "Weekly · priority alerts",
    monthlyBasic: "Monthly · standard",
    monthlyPriority: "Monthly · priority alerts",
  },
};

const PLAN_LABEL_KEYS: Record<PaidSubscriptionPlan, keyof ProfileCopy> = {
  weekly_basic: "weeklyBasic",
  weekly_priority: "weeklyPriority",
  monthly_basic: "monthlyBasic",
  monthly_priority: "monthlyPriority",
};

type ProfilePageProps = {
  lang: Lang;
  setLang: (next: Lang) => void;
};

export function ProfilePage({ lang, setLang }: ProfilePageProps) {
  const copy = PROFILE_COPY[lang];
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Profile · Airco Tracker";
    let ignore = false;
    getCurrentUser()
      .then((nextUser) => {
        if (!ignore) setUser(nextUser);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    window.location.href = `/?lang=${lang}`;
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
    </main>
  );
}
