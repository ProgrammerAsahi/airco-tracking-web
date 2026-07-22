import {
  LEGAL_PRIVACY_VERSION,
  LEGAL_TERMS_VERSION,
  PASS_WITHDRAWAL_DAYS,
} from "../shared/legal.js";

export type LegalPublicConfiguration = {
  readyForLivePayments: boolean;
  termsVersion: string;
  privacyVersion: string;
  withdrawalDays: number;
  operatorName: string | null;
  operatorAddress: string | null;
  publicationDirector: string | null;
  hostName: string | null;
  hostAddress: string | null;
  hostPhone: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  privacyEmail: string | null;
  withdrawalEmail: string | null;
  franceMediatorName: string | null;
  franceMediatorAddress: string | null;
  franceMediatorUrl: string | null;
  businessRegistrationStatus: "registered" | "exempt_confirmed" | "not_registered" | null;
  businessRegistrationNumber: string | null;
  vatStatus: "registered" | "not_registered" | null;
  vatId: string | null;
  legalRecordRetentionYears: 7 | 10 | null;
  legalRecordRetentionBasisConfirmed: boolean;
  missingFields: string[];
};

export type LegalRuntimeConfiguration = LegalPublicConfiguration & {
  productionApproval: boolean;
};

function value(name: string): string | null {
  return process.env[name]?.trim() || null;
}

function registrationStatus(name: string): "registered" | "exempt_confirmed" | "not_registered" | null {
  const configured = value(name);
  return configured === "registered" || configured === "exempt_confirmed" || configured === "not_registered"
    ? configured
    : null;
}

function vatStatusValue(name: string): "registered" | "not_registered" | null {
  const configured = value(name);
  return configured === "registered" || configured === "not_registered" ? configured : null;
}

function legalRecordRetentionYearsValue(name: string): 7 | 10 | null {
  const configured = value(name);
  if (configured === "7") return 7;
  if (configured === "10") return 10;
  return null;
}

export function legalConfigurationFromEnvironment(): LegalRuntimeConfiguration {
  const operatorName = value("LEGAL_OPERATOR_NAME");
  const operatorAddress = value("LEGAL_OPERATOR_ADDRESS");
  const publicationDirector = value("LEGAL_PUBLICATION_DIRECTOR");
  const hostName = value("LEGAL_HOST_NAME");
  const hostAddress = value("LEGAL_HOST_ADDRESS");
  const hostPhone = value("LEGAL_HOST_PHONE");
  const contactEmail = value("LEGAL_CONTACT_EMAIL");
  const contactPhone = value("LEGAL_CONTACT_PHONE");
  const privacyEmail = value("LEGAL_PRIVACY_EMAIL");
  const withdrawalEmail = value("LEGAL_WITHDRAWAL_EMAIL");
  const franceMediatorName = value("LEGAL_FR_MEDIATOR_NAME");
  const franceMediatorAddress = value("LEGAL_FR_MEDIATOR_ADDRESS");
  const franceMediatorUrl = value("LEGAL_FR_MEDIATOR_URL");
  const businessRegistrationStatus = registrationStatus("LEGAL_BUSINESS_REGISTRATION_STATUS");
  const businessRegistrationNumber = value("LEGAL_KVK_NUMBER");
  const businessRegistrationLegalConfirmation = value("LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION")?.toLowerCase() === "true";
  const vatStatus = vatStatusValue("LEGAL_VAT_STATUS");
  const vatId = value("LEGAL_VAT_ID");
  const legalRecordRetentionYears = legalRecordRetentionYearsValue("LEGAL_RECORD_RETENTION_YEARS");
  const legalRecordRetentionBasisConfirmed = value("LEGAL_RECORD_RETENTION_BASIS_CONFIRMED")?.toLowerCase() === "true";
  const productionApproval = value("LEGAL_PRODUCTION_READY")?.toLowerCase() === "true";
  const missingFields: string[] = [];

  if (!operatorName) missingFields.push("operatorName");
  if (!operatorAddress) missingFields.push("operatorAddress");
  if (!publicationDirector) missingFields.push("publicationDirector");
  if (!hostName) missingFields.push("hostName");
  if (!hostAddress) missingFields.push("hostAddress");
  if (!hostPhone) missingFields.push("hostPhone");
  if (!contactEmail) missingFields.push("contactEmail");
  if (!contactPhone) missingFields.push("contactPhone");
  if (!privacyEmail) missingFields.push("privacyEmail");
  if (!withdrawalEmail) missingFields.push("withdrawalEmail");
  if (!franceMediatorName) missingFields.push("franceMediatorName");
  if (!franceMediatorAddress) missingFields.push("franceMediatorAddress");
  if (!franceMediatorUrl) missingFields.push("franceMediatorUrl");
  if (!businessRegistrationStatus) missingFields.push("businessRegistrationStatus");
  if (businessRegistrationStatus === "not_registered") {
    missingFields.push("businessRegistrationLegalConfirmation");
  }
  if (businessRegistrationStatus === "exempt_confirmed" && !businessRegistrationLegalConfirmation) {
    missingFields.push("businessRegistrationLegalConfirmation");
  }
  if (businessRegistrationStatus === "registered" && !businessRegistrationNumber) {
    missingFields.push("businessRegistrationNumber");
  }
  if (!vatStatus) missingFields.push("vatStatus");
  if (vatStatus === "registered" && !vatId) missingFields.push("vatId");
  if (!legalRecordRetentionYears) missingFields.push("legalRecordRetentionYears");
  if (!legalRecordRetentionBasisConfirmed) missingFields.push("legalRecordRetentionBasisConfirmed");

  return {
    readyForLivePayments: productionApproval && missingFields.length === 0,
    productionApproval,
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    withdrawalDays: PASS_WITHDRAWAL_DAYS,
    operatorName,
    operatorAddress,
    publicationDirector,
    hostName,
    hostAddress,
    hostPhone,
    contactEmail,
    contactPhone,
    privacyEmail,
    withdrawalEmail,
    franceMediatorName,
    franceMediatorAddress,
    franceMediatorUrl,
    businessRegistrationStatus,
    businessRegistrationNumber,
    vatStatus,
    vatId,
    legalRecordRetentionYears,
    legalRecordRetentionBasisConfirmed,
    missingFields,
  };
}

export function publicLegalConfiguration(
  configuration: LegalRuntimeConfiguration,
): LegalPublicConfiguration {
  const { productionApproval: _productionApproval, ...safe } = configuration;
  return safe;
}
