import { useEffect, useState } from "react";
import { unsubscribeEmailAlerts } from "./authClient";
import { AircoLogoMark } from "./AircoLogoMark";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Lang } from "./i18n";

type UnsubscribeCopy = {
  productName: string;
  pageDescription: string;
  title: string;
  body: string;
  confirm: string;
  working: string;
  successTitle: string;
  successBody: string;
  errorTitle: string;
  errorBody: string;
  backHome: string;
};

const COPY: Record<Lang, UnsubscribeCopy> = {
  zh: {
    productName: "Airco Tracker",
    pageDescription: "管理 Airco Tracker 库存提醒邮件偏好。",
    title: "暂停库存提醒邮件？",
    body: "这只会停止库存提醒邮件，不会取消你的订阅，也不会移除实时库存权限。",
    confirm: "确认暂停邮件",
    working: "正在保存…",
    successTitle: "库存提醒邮件已暂停",
    successBody: "之后不会再发送库存提醒。登录后可随时在个人资料中重新开启。",
    errorTitle: "这个退订链接无法使用",
    errorBody: "链接可能无效、已使用，或已被邮箱变更取代。你也可以登录后在个人资料中更改邮件偏好。",
    backHome: "返回首页",
  },
  nl: {
    productName: "Airco Tracker",
    pageDescription: "Beheer je voorkeur voor Airco Tracker-voorraadmeldingen per e-mail.",
    title: "Voorraadmeldingen per e-mail pauzeren?",
    body: "Dit stopt alleen de voorraadmails. Je abonnement en eventuele toegang tot realtime voorraad blijven behouden.",
    confirm: "E-mails pauzeren",
    working: "Opslaan…",
    successTitle: "Voorraadmails zijn gepauzeerd",
    successBody: "Je ontvangt geen voorraadmeldingen meer. Na het inloggen kun je ze altijd weer inschakelen in je profiel.",
    errorTitle: "Deze afmeldlink kan niet worden gebruikt",
    errorBody: "De link is mogelijk ongeldig, al gebruikt of vervangen na een e-mailwijziging. Je kunt de voorkeur ook wijzigen in je profiel.",
    backHome: "Terug naar home",
  },
  en: {
    productName: "Airco Tracker",
    pageDescription: "Manage your Airco Tracker stock alert email preference.",
    title: "Pause stock alert emails?",
    body: "This only stops stock alert emails. It does not cancel your subscription or remove realtime stock access.",
    confirm: "Pause alert emails",
    working: "Saving…",
    successTitle: "Stock alert emails are paused",
    successBody: "No more stock alerts will be sent. You can re-enable them in Profile after signing in.",
    errorTitle: "This unsubscribe link cannot be used",
    errorBody: "It may be invalid, already used, or superseded by an email change. You can also change this preference in Profile.",
    backHome: "Back home",
  },
  fr: {
    productName: "Airco Tracker",
    pageDescription: "Gérez votre préférence pour les alertes de stock Airco Tracker par e-mail.",
    title: "Mettre les alertes de stock en pause ?",
    body: "Cela suspend uniquement les alertes de stock par e-mail. Votre abonnement et votre accès éventuel au stock en temps réel restent actifs.",
    confirm: "Suspendre les alertes",
    working: "Enregistrement…",
    successTitle: "Les alertes de stock sont en pause",
    successBody: "Vous ne recevrez plus d’alertes de stock. Vous pourrez les réactiver à tout moment dans votre profil après vous être connecté.",
    errorTitle: "Ce lien de désinscription ne peut pas être utilisé",
    errorBody: "Il est peut-être invalide, déjà utilisé ou remplacé après un changement d’adresse e-mail. Vous pouvez aussi modifier cette préférence dans votre profil.",
    backHome: "Retour à l’accueil",
  },
};

type UnsubscribePageProps = {
  lang: Lang;
  setLang: (next: Lang) => void;
};

export function UnsubscribePage({ lang, setLang }: UnsubscribePageProps) {
  const copy = COPY[lang];
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [status, setStatus] = useState<"confirm" | "working" | "success" | "error">(
    token ? "confirm" : "error",
  );

  useEffect(() => {
    document.title = `${copy.title} · Airco Tracker`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", copy.pageDescription);
  }, [copy.pageDescription, copy.title]);

  const confirm = async () => {
    if (!token || status === "working") return;
    setStatus("working");
    try {
      await unsubscribeEmailAlerts(token);
      setStatus("success");
      window.history.replaceState(window.history.state, "", `/unsubscribe?lang=${lang}`);
    } catch {
      setStatus("error");
    }
  };

  const title = status === "success"
    ? copy.successTitle
    : status === "error"
      ? copy.errorTitle
      : copy.title;
  const body = status === "success"
    ? copy.successBody
    : status === "error"
      ? copy.errorBody
      : copy.body;

  return (
    <main className="profile-shell unsubscribe-shell">
      <header className="profile-nav">
        <a className="landing-logo" href={`/?lang=${lang}`} aria-label={copy.productName}>
          <AircoLogoMark className="landing-logo-mark" />
          <span>{copy.productName}</span>
        </a>
        <div className="landing-nav-actions">
          <LanguageSwitcher lang={lang} setLang={setLang} />
          <a className="landing-secondary-button profile-home-link" href={`/?lang=${lang}`}>{copy.backHome}</a>
        </div>
      </header>

      <section className="profile-card unsubscribe-card" aria-live="polite">
        <p className="landing-kicker">{copy.productName}</p>
        <h1>{title}</h1>
        <p>{body}</p>
        {status === "confirm" || status === "working" ? (
          <button
            className="landing-primary-button landing-primary-button--large"
            type="button"
            disabled={status === "working"}
            onClick={confirm}
          >
            {status === "working" ? copy.working : copy.confirm}
          </button>
        ) : (
          <a className="landing-secondary-button" href={`/?lang=${lang}`}>{copy.backHome}</a>
        )}
      </section>
    </main>
  );
}
