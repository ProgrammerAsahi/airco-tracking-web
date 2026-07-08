@AGENTS.md
@HANDOFF.md

# Claude Code-notities

<p align="center">
  <a href="./CLAUDE.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/CLAUDE-简体中文-d73a49"></a>
  <a href="./CLAUDE.md"><img alt="English" src="https://img.shields.io/badge/CLAUDE-English-0969da"></a>
  <a href="./CLAUDE.nl.md"><img alt="Nederlands" src="https://img.shields.io/badge/CLAUDE-Nederlands-f58220"></a>
</p>

- Beschouw `AGENTS.md` als het stabiele engineeringcontract en `HANDOFF.md` als de actuele operationele overdracht.
- Start vanuit `~/airco-tracking-web`. Controleer branch, working tree, remote en recente commits voordat je bestanden wijzigt.
- Controleer tijdgevoelige feiten opnieuw, zoals actuele voorraadtellingen, deployed revision, GitHub Actions-status en Azure provisioning state, in plaats van op oude handoff-informatie te vertrouwen.
- Deze repository is openbaar. Print of commit nooit credentials, e-mailadressen, lokale machine-identiteiten, access tokens, Storage Keys, SAS-tokens of Key Vault-waarden.
- Houd Git author-configuratie repository-lokaal en gebruik de bestaande GitHub noreply-identiteit. Laat macOS geen auteur afleiden uit de machine-hostname.
- Maak de Blob-container niet publiek en plaats Azure-credentials niet in Vite-variabelen. Browsercode mag voorraad alleen lezen via het same-origin `/api/inventory` endpoint.
- Behoud de strikte `script-src 'self'` CSP. Vertaaldata uit Table Storage moet inert JSON blijven, veilig in HTML worden geëscapet en nooit via `dangerouslySetInnerHTML` worden gerenderd.
- Elke zichtbare tekstwijziging moet werken in Chinees, Nederlands en Engels, inclusief documentmetadata, locale-gevoelige datums/getallen, fouten en toegankelijkheidslabels.
- Elke Markdown-documentatiewijziging moet de Chinese, Engelse en Nederlandse varianten tegelijk bijwerken.
- Als een wijziging het inventory schema raakt, coördineer met `~/airco-tracking` en werk frontendtypes, servervalidatie, sample data, tests en handoff-documentatie samen bij.
- Werk `HANDOFF.md` in dezelfde wijziging bij na een betekenisvolle mijlpaal, deployment, architectuurbeslissing of nieuw gevonden blocker.
- Externe mutaties zoals Azure deployments, GitHub variable-wijzigingen, force-pushes, domeinwijzigingen of role assignments vereisen duidelijke toestemming van de gebruiker. Gebruik bij voorkeur OIDC en Managed Identity boven nieuwe secrets.
