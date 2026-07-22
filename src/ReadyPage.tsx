import { useEffect, useState } from "react";
import { entitlementIsActive, hasRealtimeStockAccess } from "../shared/auth";
import { AccountMenu } from "./AccountMenu";
import { getCurrentUser, syncCheckoutStatus, type UserProfile } from "./authClient";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Lang } from "./i18n";
import { AircoLogoMark } from "./AircoLogoMark";
import { setPageMetadata } from "./metadata";
import { LegalFooter } from "./LegalFooter";

type ReadyCopy = {
  productName: string;
  pageTitle: string;
  pageDescription: string;
  loading: string;
  loadError: string;
  retry: string;
  title: string;
  body: string;
  bodyPaused: string;
  inventoryCta: string;
  profile: string;
};

const READY_COPY: Record<Lang, ReadyCopy> = {
  zh: {
    productName: "Airco Tracker",
    pageTitle: "一切已就绪",
    pageDescription: "Airco Tracker 已准备好发送空调库存提醒。",
    loading: "正在读取通行证状态…",
    loadError: "暂时无法读取你的账号和通行证状态。请检查网络后重试。",
    retry: "重新加载",
    title: "一切已就绪",
    body: "一旦出现空调上架，我们会邮件通知您。",
    bodyPaused: "库存提醒邮件已暂停。你可以随时在账号页面重新开启。",
    inventoryCta: "查看空调库存",
    profile: "管理账号",
  },
  nl: {
    productName: "Airco Tracker",
    pageTitle: "Alles staat klaar",
    pageDescription: "Airco Tracker staat klaar om je meldingen over nieuwe airco-voorraad te sturen.",
    loading: "Heatwave-pass laden…",
    loadError: "Je account en Heatwave-pass konden niet worden geladen. Controleer je verbinding en probeer opnieuw.",
    retry: "Opnieuw proberen",
    title: "Alles staat klaar",
    body: "Zodra er airco-voorraad verschijnt, sturen we je een e-mail.",
    bodyPaused: "Voorraadmeldingen per e-mail zijn gepauzeerd. Je kunt ze op elk moment weer inschakelen in je account.",
    inventoryCta: "Bekijk airco-voorraad",
    profile: "Account beheren",
  },
  en: {
    productName: "Airco Tracker",
    pageTitle: "You are all set",
    pageDescription: "Airco Tracker is ready to send your portable AC stock alerts.",
    loading: "Loading Heatwave Pass…",
    loadError: "We could not load your account and Heatwave Pass. Check your connection and try again.",
    retry: "Try again",
    title: "You are all set.",
    body: "As soon as an air conditioner appears in stock, we’ll notify you by email.",
    bodyPaused: "Stock alert emails are paused. You can re-enable them at any time in your account.",
    inventoryCta: "View AC stock",
    profile: "Manage account",
  },
  fr: {
    productName: "Airco Tracker",
    pageTitle: "Tout est prêt",
    pageDescription: "Airco Tracker est prêt à vous envoyer des alertes de stock pour les climatiseurs mobiles.",
    loading: "Chargement du pass canicule…",
    loadError: "Impossible de charger votre compte et votre pass canicule. Vérifiez votre connexion et réessayez.",
    retry: "Réessayer",
    title: "Tout est prêt.",
    body: "Dès qu’un climatiseur sera disponible, nous vous préviendrons par e-mail.",
    bodyPaused: "Les alertes de stock par e-mail sont en pause. Vous pouvez les réactiver à tout moment depuis votre compte.",
    inventoryCta: "Voir les climatiseurs disponibles",
    profile: "Gérer le compte",
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
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    setPageMetadata({
      pathname: "/ready",
      lang,
      indexable: false,
      title: `${copy.pageTitle} · Airco Tracker`,
      description: copy.pageDescription,
    });
    let ignore = false;
    setLoading(true);
    setLoadError(false);

    async function loadUser() {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");

      if (sessionId) {
        try {
          const syncedUser = await syncCheckoutStatus(sessionId);
          if (!ignore) {
            const cleanUrl = `/ready?lang=${lang}`;
            window.history.replaceState(window.history.state, "", cleanUrl);
          }
          return syncedUser;
        } catch {
          // Fall back to the locally stored profile below. Stripe can deliver
          // webhooks slightly later than the Checkout redirect.
        }
      }

      return getCurrentUser();
    }

    loadUser()
      .then((nextUser) => {
        if (ignore) return;
        if (!nextUser) {
          window.location.replace(`/?lang=${lang}`);
          return;
        }
        const hasExplicitLanguage = new URLSearchParams(window.location.search).has("lang");
        const routeLanguage = hasExplicitLanguage ? lang : nextUser.languagePreference;
        if (!hasExplicitLanguage && nextUser.languagePreference !== lang) {
          setLang(nextUser.languagePreference);
        }
        if (!entitlementIsActive(nextUser)) {
          window.location.replace(`/subscribe?lang=${routeLanguage}`);
          return;
        }
        setUser(nextUser);
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [copy.pageDescription, copy.pageTitle, lang, loadAttempt, setLang]);

  const inventoryUrl = user ? `/deliver-to/${user.deliveryCountry}?lang=${lang}` : `/deliver-to/fr?lang=${lang}`;

  return (
    <main className="ready-shell">
      <header className="profile-nav ready-nav">
        <a className="landing-logo" href={`/ready?lang=${lang}`} aria-label={copy.productName}>
          <AircoLogoMark className="landing-logo-mark" />
          <span>{copy.productName}</span>
        </a>
        <div className="landing-nav-actions">
          <LanguageSwitcher lang={lang} setLang={setLang} />
          {user && <AccountMenu user={user} lang={lang} onLogout={() => { window.location.href = `/?lang=${lang}`; }} />}
        </div>
      </header>

      <section className="ready-card" aria-busy={loading}>
        <div className="ready-visual" aria-hidden="true">
          <div className="ready-window" />
          <div className="ready-curtain ready-curtain--left" />
          <div className="ready-curtain ready-curtain--right" />
          <div className="ready-breeze"><i /><i /><i /></div>
        </div>
        {loading ? (
          <p className="profile-loading" role="status" aria-live="polite">{copy.loading}</p>
        ) : loadError ? (
          <div className="ready-error" role="alert">
            <p>{copy.loadError}</p>
            <button className="landing-secondary-button" type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
              {copy.retry}
            </button>
          </div>
        ) : (
          <>
            <p className="landing-kicker">{copy.productName}</p>
            <h1>{copy.title}</h1>
            <p>{user?.emailAlertsEnabled ? copy.body : copy.bodyPaused}</p>
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
      <LegalFooter lang={lang} />
    </main>
  );
}
