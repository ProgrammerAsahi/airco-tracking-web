import { useEffect, useState } from "react";
import { hasRealtimeStockAccess, subscriptionIsActive } from "../shared/auth";
import { AccountMenu } from "./AccountMenu";
import { getCurrentUser, syncCheckoutStatus, type UserProfile } from "./authClient";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Lang } from "./i18n";

type ReadyCopy = {
  productName: string;
  loading: string;
  title: string;
  body: string;
  inventoryCta: string;
  profile: string;
};

const READY_COPY: Record<Lang, ReadyCopy> = {
  zh: {
    productName: "Airco Tracker",
    loading: "正在读取订阅状态…",
    title: "一切已就绪",
    body: "一旦出现空调上架，我们会邮件通知您。",
    inventoryCta: "查看空调库存",
    profile: "管理账号",
  },
  nl: {
    productName: "Airco Tracker",
    loading: "Abonnement laden…",
    title: "Alles staat klaar",
    body: "Zodra er airco-voorraad verschijnt, sturen we je een e-mail.",
    inventoryCta: "Bekijk airco-voorraad",
    profile: "Account beheren",
  },
  en: {
    productName: "Airco Tracker",
    loading: "Loading subscription…",
    title: "You are all set.",
    body: "As soon as an air conditioner appears in stock, we’ll notify you by email.",
    inventoryCta: "View AC stock",
    profile: "Manage account",
  },
};

type ReadyPageProps = {
  lang: Lang;
  setLang: (next: Lang) => void;
};

export function ReadyPage({ lang, setLang }: ReadyPageProps) {
  const copy = READY_COPY[lang];
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Ready · Airco Tracker";
    let ignore = false;

    async function loadUser() {
      const params = new URLSearchParams(window.location.search);
      const checkoutSucceeded = params.get("checkout") === "success";
      const sessionId = params.get("session_id");

      if (checkoutSucceeded || sessionId) {
        try {
          const syncedUser = await syncCheckoutStatus(sessionId);
          if (!ignore) {
            const cleanUrl = `/ready?lang=${syncedUser.languagePreference}`;
            window.history.replaceState(window.history.state, "", cleanUrl);
          }
          return syncedUser;
        } catch {
          // Fall back to the locally stored profile below. Stripe can deliver
          // webhooks slightly later than the Checkout redirect.
        }
      }

      const currentUser = await getCurrentUser();
      if (currentUser && !subscriptionIsActive(currentUser)) {
        try {
          return await syncCheckoutStatus();
        } catch {
          // No stored Stripe subscription yet, or Stripe still has not finalized it.
        }
      }
      return currentUser;
    }

    loadUser()
      .then((nextUser) => {
        if (ignore) return;
        if (!nextUser) {
          window.location.replace(`/?lang=${lang}`);
          return;
        }
        if (!subscriptionIsActive(nextUser)) {
          window.location.replace(`/subscribe?lang=${nextUser.languagePreference}`);
          return;
        }
        setUser(nextUser);
      })
      .catch(() => {
        if (!ignore) window.location.replace(`/?lang=${lang}`);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [lang, setLang]);

  const inventoryUrl = user ? `/deliver-to/${user.deliveryCountry}?lang=${user.languagePreference}` : `/deliver-to/fr?lang=${lang}`;

  return (
    <main className="ready-shell">
      <header className="profile-nav ready-nav">
        <a className="landing-logo" href={`/ready?lang=${lang}`} aria-label={copy.productName}>
          <span className="landing-logo-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>{copy.productName}</span>
        </a>
        <div className="landing-nav-actions">
          <LanguageSwitcher lang={lang} setLang={setLang} />
          {user && <AccountMenu user={user} lang={lang} onLogout={() => { window.location.href = `/?lang=${lang}`; }} />}
        </div>
      </header>

      <section className="ready-card">
        <div className="ready-visual" aria-hidden="true">
          <div className="ready-window" />
          <div className="ready-curtain ready-curtain--left" />
          <div className="ready-curtain ready-curtain--right" />
          <div className="ready-breeze"><i /><i /><i /></div>
        </div>
        {loading ? (
          <p className="profile-loading">{copy.loading}</p>
        ) : (
          <>
            <p className="landing-kicker">{copy.productName}</p>
            <h1>{copy.title}</h1>
            <p>{copy.body}</p>
            <div className="ready-actions">
              {user && hasRealtimeStockAccess(user) && (
                <a className="landing-primary-button landing-primary-button--large" href={inventoryUrl}>
                  {copy.inventoryCta}
                </a>
              )}
              <a className="landing-secondary-button" href={`/profile?lang=${lang}`}>{copy.profile}</a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
