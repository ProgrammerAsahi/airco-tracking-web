# Airco Tracker legal production checklist

<p align="center">
  <a href="./LEGAL_PRODUCTION_CHECKLIST.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/LEGAL-简体中文-d73a49"></a>
  <a href="./LEGAL_PRODUCTION_CHECKLIST.md"><img alt="English" src="https://img.shields.io/badge/LEGAL-English-0969da"></a>
</p>

Last updated: 2026-07-22. Update this file and the Chinese version together.

This is an engineering release checklist, not legal or tax advice. Do not enable live Stripe payments merely because the software checks pass. A Dutch/EU consumer-law lawyer and a tax adviser or accountant should confirm the facts and wording for the actual operator before launch.

## Hard release gate

Live checkout must remain disabled until every item below is supported by real evidence and the corresponding production value has been reviewed. Never insert a placeholder, guessed registration status, private home address that the operator has not approved for publication, or a mediator that has not accepted the operator.

- [ ] Confirm the contracting operator's full legal/trade name and a service address suitable for publication (`LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_ADDRESS`).
- [ ] Confirm the publication director's real name and obtain explicit approval to publish it (`LEGAL_PUBLICATION_DIRECTOR`). Do not assume that the contracting operator and publication director are legally interchangeable.
- [ ] Obtain the hosting provider's exact legal name, postal address, and telephone from the provider's current legal documentation or written confirmation (`LEGAL_HOST_NAME`, `LEGAL_HOST_ADDRESS`, `LEGAL_HOST_PHONE`). Do not infer these facts from an Azure resource name or region.
- [ ] Confirm the public support email, privacy email, withdrawal/refund email, and telephone or equivalent direct contact channel (`LEGAL_CONTACT_EMAIL`, `LEGAL_PRIVACY_EMAIL`, `LEGAL_WITHDRAWAL_EMAIL`, `LEGAL_CONTACT_PHONE`).
- [ ] Confirm with Dutch counsel whether the activity must be registered, then record either the real KVK number or a specifically confirmed exemption (`LEGAL_BUSINESS_REGISTRATION_STATUS`, `LEGAL_KVK_NUMBER`, `LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION`). `not_registered` is deliberately not sufficient for live payments.
- [ ] Obtain written tax advice on Dutch VAT, KOR if relevant, the EU EUR 10,000 cross-border digital-services/distance-sales threshold, and OSS. Record the real VAT status and, when applicable, VAT ID (`LEGAL_VAT_STATUS`, `LEGAL_VAT_ID`). Confirm that the price/receipt wording and Stripe Tax configuration match that advice.
- [ ] Join or otherwise obtain acceptance from a French consumer mediator appearing in the CECMC framework, then publish its exact name, postal address, and website (`LEGAL_FR_MEDIATOR_NAME`, `LEGAL_FR_MEDIATOR_ADDRESS`, `LEGAL_FR_MEDIATOR_URL`). A directory entry alone is not an appointment.
- [ ] Have counsel/accounting confirm whether the minimum pseudonymous order-evidence ledger is retained for exactly 7 or 10 years and from which legal event the period runs (`LEGAL_RECORD_RETENTION_YEARS`, `LEGAL_RECORD_RETENTION_BASIS_CONFIRMED`).
- [ ] Review the four language versions of Terms, Privacy Notice, Imprint, Affiliate Disclosure, checkout acceptance, purchase confirmation, withdrawal form, and refund confirmation. Resolve discrepancies before setting `LEGAL_PRODUCTION_READY=true`.

The application intentionally fails closed for live or unknown-format Stripe keys if any required field or confirmation is missing.

## Privacy and processor evidence

- [ ] Keep signed/current DPAs and transfer documentation for Microsoft Azure/ACS and Stripe; record the production regions and any applicable Standard Contractual Clauses or adequacy basis.
- [ ] Maintain a GDPR Article 30-style processing record covering account/login, payments, alert delivery, provider delivery reports, security logs, affiliate redirects, retention, deletion, and data-subject requests.
- [ ] Complete and record a legitimate-interest assessment for abuse prevention, reliability telemetry, bounce suppression, and legal-claims evidence.
- [ ] Decide with counsel whether a DPIA is required; record the conclusion and review date even if the conclusion is “not required”.
- [ ] Verify that production log retention, Event Grid dead-letter lifecycle, Service Bus TTL/DLQ behaviour, Stripe retention, and the public Privacy Notice agree.
- [ ] Test access, correction, portability, objection, deletion, unsubscribe, email-change, and identity-verification procedures. Define an owner and response deadline for privacy requests and incidents.
- [ ] Re-run a cookie/storage audit before adding analytics, advertising, CMP, social embeds, or new affiliate attribution. The current notice assumes only strictly necessary session/local preferences on Airco Tracker.

## Consumer and payment operations

- [ ] Verify the exact product names, one-time prices, 90-day duration, no-renewal statement, VAT treatment, near-real-time limitation (normally about ten minutes), and ranking disclosure across UI, Stripe, receipts, and legal text.
- [ ] Test successful, declined, 3-D Secure, abandoned, duplicated, disputed, refunded, withdrawal, email-outage, and webhook-replay cases in Stripe test mode. Preserve immutable evidence of the tested release.
- [ ] Verify that the consumer must separately request immediate performance and actively confirm electronic submission; neither box may be preselected.
- [ ] Verify the prominent online withdrawal/refund route from every authenticated/paid surface and that the EU model form remains available without JavaScript.
- [ ] Document customer-support and complaint escalation, refund timing, Stripe reconciliation, ACS bounce/suppression handling, and incident rollback ownership.
- [ ] Publish accessibility contact/remediation handling and perform a final WCAG/EAA review appropriate to the service before commercial launch.

## Release evidence

Record, without storing secrets or unnecessary personal data:

- legal and tax reviewer names/organisations, scope, decision date, and next review date;
- mediator acceptance/contract reference and published contact details;
- approved public operator facts and configuration checksum;
- publication-director approval and the dated source used to verify the hosting-provider identity, address, and telephone;
- Terms/Privacy versions accepted by the release;
- Stripe mode, product/price configuration verification, webhook event list, and test evidence;
- deployed frontend/backend commits, workflow/deployment identifiers, production smoke results, and rollback point.

## Primary references to verify at review time

- Netherlands, distance/online sales: <https://business.gov.nl/regulations/long-distance-sales-and-purchases/>
- Netherlands, business correspondence disclosures: <https://business.gov.nl/regulations/rules-business-correspondence/>
- Dutch Tax Administration, cross-border digital services/VAT: <https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/btw-diensten-particulieren>
- Dutch Tax Administration, EU VAT/OSS reporting: <https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/goederen_en_diensten_naar_andere_eu_landen/btw_berekenen_bij_diensten/wijziging_in_digitale_diensten_vanaf_2015/eu_btw_melding_doen/>
- France DGCCRF, consumer mediation: <https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/la-mediation-de-la-consommation-ce-que-vous-devez-savoir>
- France, mandatory website legal notices: <https://www.economie.gouv.fr/entreprises/developper-son-entreprise/innover-et-numeriser-son-entreprise/mentions-sur-votre-site-internet-les-obligations-respecter>
- EU ODR platform repeal (do not restore obsolete ODR links): <https://eur-lex.europa.eu/eli/reg/2024/3228/oj>
