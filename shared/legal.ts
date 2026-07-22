export const LEGAL_TERMS_VERSION = "2026-07-22";
export const LEGAL_PRIVACY_VERSION = "2026-07-22";
export const PASS_WITHDRAWAL_DAYS = 14;

export type CheckoutLegalAcceptance = {
  termsVersion: string;
  privacyVersion: string;
  termsAccepted: boolean;
  privacyNoticeAcknowledged: boolean;
  immediatePerformanceRequested: boolean;
};

export function isCurrentCheckoutLegalAcceptance(value: unknown): value is CheckoutLegalAcceptance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<CheckoutLegalAcceptance>;
  return candidate.termsVersion === LEGAL_TERMS_VERSION
    && candidate.privacyVersion === LEGAL_PRIVACY_VERSION
    && candidate.termsAccepted === true
    && candidate.privacyNoticeAcknowledged === true
    && candidate.immediatePerformanceRequested === true;
}
