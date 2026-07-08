@AGENTS.md
@HANDOFF.md

# Claude Code 备注

<p align="center">
  <a href="./CLAUDE.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/CLAUDE-简体中文-d73a49"></a>
  <a href="./CLAUDE.md"><img alt="English" src="https://img.shields.io/badge/CLAUDE-English-0969da"></a>
</p>

- 将 `AGENTS.md` 视为稳定的工程契约，将 `HANDOFF.md` 视为当前运行交接。
- 从 `~/airco-tracking-web` 开始工作。编辑前检查分支、工作区、远端和最近提交。
- 不要信任旧交接中的时效性事实；重新确认当前库存总数、已部署 revision、GitHub Actions 状态和 Azure provisioning state。
- 本仓库是公开仓库。不要打印或提交凭据、邮箱地址、本机身份、access token、Storage Key、SAS token 或 Key Vault 值。
- Git author 配置必须是仓库本地配置，并使用现有 GitHub noreply 身份；不要让 macOS 从机器 hostname 推断作者。
- 不要公开 Blob container，也不要把 Azure 凭据放入 Vite 变量。浏览器代码只能通过同源 `/api/inventory` 读取库存。
- 保持严格 `script-src 'self'` CSP。Table Storage 中的翻译数据必须保持为惰性 JSON，嵌入 HTML 时必须安全转义，且绝不能通过 `dangerouslySetInnerHTML` 渲染。
- 任何可见文案变更都必须同时支持中文、荷兰语和英语，包括 document metadata、本地化日期/数字、错误信息和无障碍标签。
- 任何 Markdown 文档变更都必须同时更新中文和英语版本。
- 如果变更影响库存 schema，请与 `~/airco-tracking` 协调，并同时更新前端类型、server validation、sample data、测试和交接文档。
- 完成有意义的里程碑、部署、架构决定或发现新 blocker 后，在同一变更中更新 `HANDOFF.md`。
- Azure 部署、GitHub variable 修改、force-push、域名修改或角色分配等外部变更需要明确用户授权。优先使用 OIDC 和 Managed Identity，而不是新增 secrets。
