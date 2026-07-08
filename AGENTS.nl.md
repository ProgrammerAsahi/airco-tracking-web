# Airco Tracking Web — gedeelde agentinstructies

<p align="center">
  <a href="./AGENTS.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/AGENTS-简体中文-d73a49"></a>
  <a href="./AGENTS.md"><img alt="English" src="https://img.shields.io/badge/AGENTS-English-0969da"></a>
  <a href="./AGENTS.nl.md"><img alt="Nederlands" src="https://img.shields.io/badge/AGENTS-Nederlands-f58220"></a>
</p>

## Missie

Onderhoud een snel, goedkoop publiek voorraaddashboard voor mobiele airco's die naar het gekozen bezorgland kunnen worden geleverd. Toon de private `airco-tracking` live snapshot duidelijk zonder Azure-credentials bloot te stellen of Blob Storage publiek te maken.

## Eerst lezen

1. Lees `HANDOFF.md` voor actuele deployment-feiten, bekende beperkingen en waarschijnlijk volgend werk.
2. Lees de bestanden die relevant zijn voor de gevraagde laag voordat je wijzigt:
   - Browser UI: `src/`
   - Same-origin API: `server/`
   - Azure deployment: `infra/` en `scripts/`
   - Automatisering: `.github/workflows/`
3. Als de datavorm meespeelt, inspecteer dan de backend-producer in `~/airco-tracking/airco_tracker/inventory.py` als bron van waarheid.
4. Gebruik `README.md` voor gebruikersgerichte setup en architectuur. Houd het gesynchroniseerd bij gedragswijzigingen.
5. Alle Markdown-documentatie moet in Chinees, Engels en Nederlands worden onderhouden. Werk bij elke documentwijziging alle taalvarianten in dezelfde change bij.

## Niet-onderhandelbare beveiligingsregels

- Deze repository is openbaar. Commit of log nooit secrets, persoonlijke e-mailadressen, lokale machine-identiteiten, API-tokens, Client Secrets, Storage Keys, connection strings, langlevende SAS-tokens of Key Vault-waarden.
- Productie-browsercode moet het same-origin `/api/inventory` endpoint gebruiken. Geef de browser nooit directe Azure Storage-credentials.
- Houd de Blob-container privé. De Node-service leest `inventory.json` met een user-assigned Managed Identity.
- GitHub Actions authenticeert naar Azure met OIDC. Voeg geen `AZURE_CREDENTIALS` of service-principal password toe.
- Alleen niet-geheime identifiers horen in GitHub Actions Variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` en `AZURE_RESOURCE_GROUP`.
- Hergebruik waar mogelijk de bestaande least-privilege runtime identity en infrastructuur. Verbreed Azure-rollen niet zonder concrete noodzaak en expliciete toestemming.
- Behoud de strikte `script-src 'self'; style-src 'self'` CSP. Voeg geen `unsafe-inline` toe om runtime data-injectie werkend te krijgen.
- Behandel vertalingen uit Table Storage als data, niet als vertrouwde markup. Embed ze alleen als geëscapete `application/json`, valideer de shape en render ze nooit met `dangerouslySetInnerHTML`.
- Bewaar ongerelateerde gebruikerswijzigingen. Overschrijf geen dirty worktree en herschrijf gedeelde geschiedenis niet achteloos.

## Product- en designcontract

- Houd de rustige gletsjerblauwe visuele richting aan tenzij de gebruiker een redesign vraagt.
- Primair desktopdoel is een 13-inch MacBook Air-achtig viewport rond 1440×900. Behoud responsive layouts voor smallere schermen.
- De belangrijkste informatie is het aantal beschikbare producten per retailer. Retailers met voorraad sorteren eerst; daarna sorteren namen volgens Nederlandse locale-regels.
- Verouderde retailerdata moet zichtbaar onderscheidbaar blijven. Presenteer stale waarden niet als vers gecontroleerd.
- Retailer-outbound links moeten expliciet, toegankelijk en geopend worden met veilige `rel`-attributen.
- De huidige brand marks zijn gekleurde initialen, geen gedownloade officiële logo's. Introduceer geen remote logo-afhankelijkheden of auteursrechtelijke assetbundels zonder afweging met de gebruiker.
- Hardcode geen voorraadtotalen in renderlogica. Counts en site status komen uit de snapshot. Als marketingcopy het aantal gevolgde sites noemt, update die bij backend-dekkingswijzigingen.
- Behoud toetsenbordsemantiek, leesbaar contrast, reduced-motion support en geen horizontale overflow op ondersteunde breakpoints.
- Chinees, Nederlands en Engels moeten zonder reload wisselen. Zichtbare copy, fouten, documentmetadata, locale-gevoelige datums/getallen en toegankelijkheidslabels moeten synchroniseren met de gekozen taal.

## Architectuur

```text
Browser
  └─ HTTPS → Azure Container Apps (`airco-tracking-web`, scale 0–2)
                 ├─ serves `dist/` from the Vite build
                 └─ GET `/api/inventory`
                        └─ Managed Identity → private Blob
                           `airco-tracker/inventory.json`
```

- React entry en UI: `src/App.tsx`
- Brand metadata: `src/brands.ts`
- Browserdatatypes: `src/types.ts`
- Gletsjerblauwe responsive styling: `src/styles.css`
- Node HTTP-service: `server/server.ts`
- Runtime contractvalidatie: `server/inventory.ts`
- Contracttests: `server/inventory.test.ts`
- Niet-gevoelige lokale fixture: `test-fixtures/inventory.sample.json`
- Gedeeld datacontract: `shared/inventory.ts`
- Gedeeld vertaalcontract/parser: `shared/i18n.ts`
- Table Storage-vertalingsloader en CSP-veilige serializer: `server/i18n.ts`
- Browser translation hook en taalpersistentie: `src/i18n.ts`
- Container image: `Dockerfile`
- Container App-definitie: `infra/app.bicep`
- Repository-specifieke OIDC credential: `infra/github-oidc.bicep`
- Deployment en verificatie: `scripts/deploy.sh`, `scripts/verify-deployment.mjs`
- CI/CD: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

De frontend-repository hergebruikt de resource group, Container Apps Environment, ACR, Storage Account en runtime user-assigned identity van het backendproject. Zij bezit alleen de `airco-tracking-web` Container App en de repository-specifieke GitHub OIDC trust.

## Inventory datacontract

- Huidige schema version: `1`.
- De producer is de `updated_inventory()` output van de backend repository.
- Productie leest de private Blob via `/api/inventory`; development proxyt `/api` naar een lokale Node-server die `test-fixtures/inventory.sample.json` leest.
- Verplichte top-level velden omvatten `version`, `updated_at`, `refresh_interval_seconds`, aggregate counts en `sites`.
- Elke site bevat `status`, `stale`, attempt/success timestamps, `available_product_count` en `products`.
- De server valideert de shape voordat hij teruggeeft. Accepteer geen onbekende schema version stilzwijgend.
- Een schemawijziging vereist gecoördineerde updates aan:
  1. Backend snapshot producer en tests.
  2. `server/inventory.ts` en tests.
  3. `src/types.ts` en UI-gedrag.
  4. `test-fixtures/inventory.sample.json`.
  5. README en handoff-documentatie in beide repositories.

## Standaard lokale workflow

Gebruik Node.js 22 en pnpm 11.7 vanuit de repository-root:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Development preview (twee terminals):

```bash
# Terminal 1: start the API server with sample data
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start

# Terminal 2: start Vite dev server (proxies /api to :4174)
pnpm dev
# http://127.0.0.1:4173
```

Productiemodus-integratiecheck:

```bash
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

Controleer bij layout- of CSS-wijzigingen de pagina op 1440×900 en minstens één smal breakpoint. Bevestig card count, stocked-card count, totaal, horizontale overflow en browser console errors. Een lokale Vite preview alleen is niet genoeg voor API/serverwijzigingen; draai ook de productiemodus-check.

## CI/CD en Azure workflow

- Pull requests en handmatige CI-runs gebruiken `.github/workflows/ci.yml`.
- Pushes naar `main` gebruiken `.github/workflows/deploy.yml`; pure Markdown/docs-wijzigingen worden genegeerd en triggeren geen productiedeployment.
- Deployment draait tests, typechecks, bouwt browser/server artifacts, compileert Bicep, logt in met OIDC, bouwt in ACR, deployt een immutable full-SHA image en verifieert `/health`, het strict-CSP i18n HTML-contract en `/api/inventory`.
- De Container App gebruikt externe HTTPS ingress, een Blob-cache van 30 seconden en 0–2 replicas.
- `scripts/bootstrap-github-oidc.sh` is een eenmalige of reparatieoperatie. Draai het niet routinematig.
- Documentation-only commits mogen `[skip ci]` gebruiken wanneer geen deployed artifact is gewijzigd.
- Registreer na een geautoriseerde deployment feature commit/image, Actions run, production response counts en provisioning state in `HANDOFF.md`.

## Wijzigingsworkflow

1. Inspecteer `git status`, `git log` en huidige remote state.
2. Pull of fetch vóór het werk als een andere agent kan hebben gepusht.
3. Maak de kleinste coherente wijziging en voeg gerichte tests toe voor server- of contractlogica.
4. Draai de standaard verificatiecommando's.
5. Doe browser visual QA voor UI-wijzigingen en productiemodus API QA voor serverwijzigingen.
6. Werk de drietalige `README` bij wanneer setup, architectuur, runtimevariabelen of deploymentgedrag verandert.
7. Werk de drietalige `HANDOFF` bij wanneer current state, next work, productie-evidence of blockers veranderen.
8. Commit met de repository-lokale GitHub noreply author. Push/deploy alleen met toestemming.

## Handoffkwaliteit

Houd `HANDOFF.md` feitelijk en compact genoeg zodat een nieuwe agent het snel kan scannen. Scheid duurzame regels (dit bestand) van actuele feiten (handoff). Registreer exacte commando's en verificatie-evidence, maar nooit persoonsgegevens, secretwaarden, tokens of onnodige Azure-identifiers.
