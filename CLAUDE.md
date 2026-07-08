@AGENTS.md
@HANDOFF.md

# Claude Code notes

<p align="center">
  <a href="./CLAUDE.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/CLAUDE-简体中文-d73a49"></a>
  <a href="./CLAUDE.md"><img alt="English" src="https://img.shields.io/badge/CLAUDE-English-0969da"></a>
</p>

- Treat `AGENTS.md` as the stable engineering contract and `HANDOFF.md` as the current operational handoff.
- Start work from `~/airco-tracking-web`. Check the branch, working tree, remote, and recent commits before editing.
- Re-check time-sensitive facts such as current inventory totals, the deployed revision, GitHub Actions status, and Azure provisioning state instead of trusting an old handoff entry.
- This repository is public. Never print or commit credentials, email addresses, local machine identities, access tokens, Storage Keys, SAS tokens, or Key Vault values.
- Keep Git author configuration repository-local and use the existing GitHub noreply identity. Do not let macOS infer an author from the machine hostname.
- Do not make the Blob container public and do not move Azure credentials into Vite variables. Browser code must read inventory only from the same-origin `/api/inventory` endpoint.
- Keep the strict `script-src 'self'` CSP. Translation data from Table Storage must remain inert JSON, be HTML-safe when embedded, and never be rendered through `dangerouslySetInnerHTML`.
- Any visible-copy change must work in Chinese, Dutch, and English, including document metadata, locale-sensitive dates/numbers, errors, and accessible labels.
- Any Markdown documentation change must update the Chinese and English variants together.
- If a change affects the inventory schema, coordinate it with `~/airco-tracking` and update frontend types, server validation, sample data, tests, and handoff documentation together.
- After a meaningful milestone, deployment, architectural decision, or newly discovered blocker, update `HANDOFF.md` in the same change.
- External mutations such as Azure deployments, GitHub variable changes, force-pushes, domain changes, or role assignments require clear user authorization. Prefer OIDC and Managed Identity over new secrets.
