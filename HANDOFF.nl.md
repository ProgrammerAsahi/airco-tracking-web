# Airco Tracking Web — actuele overdracht

<p align="center">
  <a href="./HANDOFF.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/HANDOFF-简体中文-d73a49"></a>
  <a href="./HANDOFF.md"><img alt="English" src="https://img.shields.io/badge/HANDOFF-English-0969da"></a>
  <a href="./HANDOFF.nl.md"><img alt="Nederlands" src="https://img.shields.io/badge/HANDOFF-Nederlands-f58220"></a>
</p>

Laatst bijgewerkt: 2026-07-08 (Europe/Amsterdam)

Documentatieregel: werk de Chinese, Engelse en Nederlandse handoffvarianten tegelijk bij wanneer actuele status, verificatie-evidence, blockers of volgende stappen wijzigen.

## Huidig doel

Bied een publieke, goedkope Airco Tracker-portal en read-only voorraaddashboard. Het productiedashboard leest de private `inventory.json` via een same-origin API en Managed Identity, en toont directe voorraad en voorverkoop voor retailers die naar het doelbezorgland kunnen leveren. De publieke homepage (`/`) is een hittegolfportal; voorraadpagina's staan onder `/deliver-to/<country>`; taal en bezorgland blijven onafhankelijk.

De productrichting omvat inmiddels login, gebruikersprofiel, abonnementen en Stripe Checkout. Het kaartbetalingspad is in Stripe sandbox doorlopen: een `monthly_priority` testaankoop is geslaagd en na terugkeer/verversen verschijnen de rechten. De abonnements- en betalingstestmatrix staat in `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md` en de Engelse/Nederlandse varianten.

## Repository en productie

- Repository: `https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch: `main`
- Local path: `~/airco-tracking-web`
- Live URL: `https://airco-tracker.eu/`
- Container App: `airco-tracking-web`
- Azure resource group: `airco-tracker-rg`
- Backend repository: `https://github.com/ProgrammerAsahi/airco-tracking`
- Runtime image registry: hergebruikt backend ACR, image name `airco-tracking-web:<full-git-sha>`
- Custom domain: `airco-tracker.eu` en `www.airco-tracker.eu` staan in `infra/app.bicep`. Verwijder `customDomains` niet; anders kan een toekomstige Bicep deployment handmatige hostname bindings wissen.
- Deployment workflow: `.github/workflows/deploy.yml`. Pure Markdown/docs-wijzigingen worden door `paths-ignore` genegeerd en triggeren geen productiedeployment.

## Geïmplementeerd

### Browser UI

- React 19 + TypeScript + Vite.
- Publieke portal `/`: hittegolfverhaal, gletsjerblauw/glassmorphism design, subscription CTA.
- Loginervaring: e-mailcode UI, third-party login placeholders, nicknamekaart, avatar dropdown, profilepagina.
- Gebruikersvoorkeuren: nickname, taal en land; land bepaalt voorraadentry `/deliver-to/nl` of `/deliver-to/fr`, taal wisselt onafhankelijk.
- Ready-pagina: toont “alles is gereed” na betaling/abonnement; priority-gebruikers kunnen naar voorraadpagina.
- Abonnementspagina: vier plannen via weekly/monthly × basic/priority; basic is alleen e-mailalerts, priority bevat realtime voorraadpagina's.
- Voorraadpagina: `/deliver-to/<country>` filtert op backend `delivery_coverage`; ondersteunt directe voorraad/voorverkoop en retailer detail overlay.
- Meertaligheid: Chinees, Nederlands en Engels wisselen zonder reload; datums, getallen, metadata, fouten en toegankelijkheidslabels volgen de taal.

### Same-origin API

- `server/server.ts` serveert zowel de statische Vite build als API's.
- `/api/inventory` leest private Blob met Managed Identity en doet schema validation, caching en rate limiting.
- Auth/session/userinformatie gebruikt Azure Table Storage; minimale opslag van persoonsgegevens.
- Stripe-integratie gebruikt hosted Checkout; kaartnummers raken de Airco Tracker-server niet.
- `/api/billing/webhook` valideert Stripe signatures; requests zonder signature krijgen 400.
- `/api/billing/sync-checkout-status` kan bij webhookvertraging checkout/subscriptionstatus uit Stripe halen en gebruikersrechten herstellen.

### Azure en CI/CD

- Azure Container Apps Consumption, scale 0–2.
- Hergebruik van backend Container Apps Environment, ACR, Storage Account, resource group en runtime UAMI.
- GitHub Actions gebruikt OIDC; geen `AZURE_CREDENTIALS` secret of client secret.
- Push naar `main` deployt productie; docs-only push deployt niet.

## Huidige bekende status

- Stripe test mode heeft vier Price IDs:
  - `weekly_basic`: €10/week
  - `weekly_priority`: €20/week
  - `monthly_basic`: €15/month
  - `monthly_priority`: €30/month
- Stripe webhook endpoint: `https://airco-tracker.eu/api/billing/webhook`
- Vereiste events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Recent bevestigd:
  - `/health` geeft 200 in productie.
  - `/ready?lang=zh` geeft 200 in productie.
  - Webhook zonder signature geeft 400 in productie.
  - Checkout sync API zonder login geeft 401 in productie.
  - Gebruiker ziet na refresh rechten na `monthly_priority` testaankoop.

## Mogelijke volgende stappen

Dit zijn opties, geen automatische toestemming:

1. Test verder volgens `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md`: annulering, planrechten, betaalfouten, Test Clock expiry en planwijzigingen.
2. Implementeer of bevestig planwijzigingen: basic → priority direct actief; priority → basic pas na huidige periode.
3. Breid Stripe Checkout uit met iDEAL, PayPal of andere betaalmethoden.
4. Blijf bij fixes voor `/deliver-to/*` taalwissel en profile/ready-details de drietalige UI en documentatie synchroon houden.

## Standaard lokale verificatie

```bash
cd ~/airco-tracking-web
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
bash -n scripts/*.sh
git diff --check
```

Productiemodus-check:

```bash
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

## Resume-checklist

```bash
cd ~/airco-tracking-web
git status --short
git log -5 --oneline
git fetch origin
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

Daarna:

1. Lees `CLAUDE.md`, `AGENTS.md` en deze handoff.
2. Controleer GitHub Actions variables, Azure-status en productierespons opnieuw vóór tijdgevoelige acties.
3. UI work vereist browserverificatie op 1440×900 en één smal breakpoint.
4. Server work vereist productiemodus API QA.
5. Schema work moet met de backend repository worden gecoördineerd.
6. Werk na betekenisvol werk, deployment of blocker-wijziging de drietalige handoff bij.

Registreer geen persoonsgegevens, secretwaarden, tokens, lokale machine-identiteiten of onnodige Azure-identifiers in dit bestand.
