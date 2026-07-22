import type { Lang } from "./i18n";

type LegalFooterCopy = {
  navigation: string;
  withdrawal: string;
  privacy: string;
  terms: string;
  imprint: string;
  affiliate: string;
};

const COPY: Record<Lang, LegalFooterCopy> = {
  zh: {
    navigation: "法律信息与消费者支持",
    withdrawal: "撤回购买 / 申请退款",
    privacy: "隐私政策",
    terms: "服务条款",
    imprint: "经营者信息",
    affiliate: "推广联盟说明",
  },
  nl: {
    navigation: "Juridische informatie en consumentenservice",
    withdrawal: "Aankoop herroepen / terugbetaling vragen",
    privacy: "Privacyverklaring",
    terms: "Voorwaarden",
    imprint: "Bedrijfsgegevens",
    affiliate: "Affiliate-informatie",
  },
  en: {
    navigation: "Legal information and consumer support",
    withdrawal: "Withdraw purchase / request refund",
    privacy: "Privacy notice",
    terms: "Terms",
    imprint: "Imprint",
    affiliate: "Affiliate disclosure",
  },
  fr: {
    navigation: "Informations juridiques et assistance consommateurs",
    withdrawal: "Se rétracter / demander un remboursement",
    privacy: "Confidentialité",
    terms: "Conditions",
    imprint: "Mentions légales",
    affiliate: "Information sur l’affiliation",
  },
};

export function WithdrawalLink({ lang, className = "" }: { lang: Lang; className?: string }) {
  const classNames = ["site-legal-withdrawal", className].filter(Boolean).join(" ");
  return (
    <a className={classNames} href={`/withdrawal.html?lang=${lang}`}>
      {COPY[lang].withdrawal}
      <span aria-hidden="true">→</span>
    </a>
  );
}

export function LegalFooter({ lang, context = "" }: { lang: Lang; context?: string }) {
  const copy = COPY[lang];
  return (
    <footer className="site-legal-footer">
      <nav className="site-legal-footer-nav" aria-label={copy.navigation}>
        <WithdrawalLink lang={lang} />
        <span className="site-legal-footer-links">
          <a href={`/privacy.html?lang=${lang}`}>{copy.privacy}</a>
          <a href={`/terms.html?lang=${lang}`}>{copy.terms}</a>
          <a href={`/imprint.html?lang=${lang}`}>{copy.imprint}</a>
          <a href={`/affiliate-disclosure.html?lang=${lang}`}>{copy.affiliate}</a>
        </span>
      </nav>
      <span className="site-legal-footer-brand">Airco Tracker{context ? ` · ${context}` : ""}</span>
    </footer>
  );
}
