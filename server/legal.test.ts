import assert from "node:assert/strict";
import test from "node:test";
import { legalConfigurationFromEnvironment } from "./legal.js";

const MANAGED_KEYS = [
  "LEGAL_OPERATOR_NAME",
  "LEGAL_OPERATOR_ADDRESS",
  "LEGAL_PUBLICATION_DIRECTOR",
  "LEGAL_HOST_NAME",
  "LEGAL_HOST_ADDRESS",
  "LEGAL_HOST_PHONE",
  "LEGAL_CONTACT_EMAIL",
  "LEGAL_CONTACT_PHONE",
  "LEGAL_PRIVACY_EMAIL",
  "LEGAL_WITHDRAWAL_EMAIL",
  "LEGAL_FR_MEDIATOR_NAME",
  "LEGAL_FR_MEDIATOR_ADDRESS",
  "LEGAL_FR_MEDIATOR_URL",
  "LEGAL_BUSINESS_REGISTRATION_STATUS",
  "LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION",
  "LEGAL_KVK_NUMBER",
  "LEGAL_VAT_STATUS",
  "LEGAL_VAT_ID",
  "LEGAL_RECORD_RETENTION_YEARS",
  "LEGAL_RECORD_RETENTION_BASIS_CONFIRMED",
  "LEGAL_PRODUCTION_READY",
] as const;

function withLegalEnvironment(values: Record<string, string | undefined>, assertion: () => void): void {
  const previous = Object.fromEntries(MANAGED_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of MANAGED_KEYS) delete process.env[key];
    Object.assign(process.env, values);
    assertion();
  } finally {
    for (const key of MANAGED_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const operator = {
  LEGAL_OPERATOR_NAME: "Airco Tracker Operator",
  LEGAL_OPERATOR_ADDRESS: "Example Street 1, Amsterdam",
  LEGAL_PUBLICATION_DIRECTOR: "Example Publication Director",
  LEGAL_HOST_NAME: "Example Hosting Provider",
  LEGAL_HOST_ADDRESS: "Host Street 3, Paris",
  LEGAL_HOST_PHONE: "+33 1 00 00 00 00",
  LEGAL_CONTACT_EMAIL: "support@airco-tracker.eu",
  LEGAL_CONTACT_PHONE: "+31 20 000 0000",
  LEGAL_PRIVACY_EMAIL: "privacy@airco-tracker.eu",
  LEGAL_WITHDRAWAL_EMAIL: "withdrawal@airco-tracker.eu",
  LEGAL_FR_MEDIATOR_NAME: "Example Consumer Mediator",
  LEGAL_FR_MEDIATOR_ADDRESS: "Mediator Street 2, Paris",
  LEGAL_FR_MEDIATOR_URL: "https://mediator.example.test",
  LEGAL_PRODUCTION_READY: "true",
  LEGAL_RECORD_RETENTION_YEARS: "7",
  LEGAL_RECORD_RETENTION_BASIS_CONFIRMED: "true",
};

test("allows live payments for a fully identified registered operator", () => {
  withLegalEnvironment({
    ...operator,
    LEGAL_BUSINESS_REGISTRATION_STATUS: "registered",
    LEGAL_KVK_NUMBER: "12345678",
    LEGAL_VAT_STATUS: "registered",
    LEGAL_VAT_ID: "NL123456789B01",
  }, () => {
    const configuration = legalConfigurationFromEnvironment();
    assert.equal(configuration.readyForLivePayments, true);
    assert.deepEqual(configuration.missingFields, []);
  });
});

test("fails live checkout closed when French publication or hosting facts are absent", () => {
  const { LEGAL_PUBLICATION_DIRECTOR: _director, LEGAL_HOST_PHONE: _hostPhone, ...incomplete } = operator;
  withLegalEnvironment({
    ...incomplete,
    LEGAL_BUSINESS_REGISTRATION_STATUS: "registered",
    LEGAL_KVK_NUMBER: "12345678",
    LEGAL_VAT_STATUS: "not_registered",
  }, () => {
    const configuration = legalConfigurationFromEnvironment();
    assert.equal(configuration.readyForLivePayments, false);
    assert.ok(configuration.missingFields.includes("publicationDirector"));
    assert.ok(configuration.missingFields.includes("hostPhone"));
    assert.equal(configuration.publicationDirector, null);
    assert.equal(configuration.hostPhone, null);
  });
});

test("requires explicit legal confirmation for a registration exemption", () => {
  withLegalEnvironment({
    ...operator,
    LEGAL_BUSINESS_REGISTRATION_STATUS: "exempt_confirmed",
    LEGAL_VAT_STATUS: "not_registered",
  }, () => {
    const configuration = legalConfigurationFromEnvironment();
    assert.equal(configuration.readyForLivePayments, false);
    assert.ok(configuration.missingFields.includes("businessRegistrationLegalConfirmation"));
  });
  withLegalEnvironment({
    ...operator,
    LEGAL_BUSINESS_REGISTRATION_STATUS: "exempt_confirmed",
    LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION: "true",
    LEGAL_VAT_STATUS: "not_registered",
  }, () => {
    const configuration = legalConfigurationFromEnvironment();
    assert.equal(configuration.readyForLivePayments, true);
  });
});

test("never treats an unconfirmed not-registered operator as live-payment ready", () => {
  withLegalEnvironment({
    ...operator,
    LEGAL_BUSINESS_REGISTRATION_STATUS: "not_registered",
    LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION: "true",
    LEGAL_VAT_STATUS: "not_registered",
  }, () => {
    const configuration = legalConfigurationFromEnvironment();
    assert.equal(configuration.readyForLivePayments, false);
    assert.ok(configuration.missingFields.includes("businessRegistrationLegalConfirmation"));
  });
});

test("fails live checkout closed until an allowed retention basis is explicitly confirmed", () => {
  withLegalEnvironment({
    ...operator,
    LEGAL_BUSINESS_REGISTRATION_STATUS: "registered",
    LEGAL_KVK_NUMBER: "12345678",
    LEGAL_VAT_STATUS: "not_registered",
    LEGAL_RECORD_RETENTION_YEARS: "8",
    LEGAL_RECORD_RETENTION_BASIS_CONFIRMED: "false",
  }, () => {
    const configuration = legalConfigurationFromEnvironment();
    assert.equal(configuration.readyForLivePayments, false);
    assert.ok(configuration.missingFields.includes("legalRecordRetentionYears"));
    assert.ok(configuration.missingFields.includes("legalRecordRetentionBasisConfirmed"));
  });
  withLegalEnvironment({
    ...operator,
    LEGAL_BUSINESS_REGISTRATION_STATUS: "registered",
    LEGAL_KVK_NUMBER: "12345678",
    LEGAL_VAT_STATUS: "not_registered",
    LEGAL_RECORD_RETENTION_YEARS: "10",
    LEGAL_RECORD_RETENTION_BASIS_CONFIRMED: "true",
  }, () => {
    const configuration = legalConfigurationFromEnvironment();
    assert.equal(configuration.readyForLivePayments, true);
    assert.equal(configuration.legalRecordRetentionYears, 10);
  });
});
