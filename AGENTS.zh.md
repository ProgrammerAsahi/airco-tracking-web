# Airco Tracking Web — 共享代理说明

<p align="center">
  <a href="./AGENTS.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/AGENTS-简体中文-d73a49"></a>
  <a href="./AGENTS.md"><img alt="English" src="https://img.shields.io/badge/AGENTS-English-0969da"></a>
</p>

## 使命

维护一个快速、低成本的公开库存 dashboard，用于展示可配送至荷兰/法国等目标国家的便携空调库存。清晰展示私有 `airco-tracking` 实时快照，同时不暴露 Azure 凭据，也不公开 Blob Storage。

## 先读

1. 阅读 `HANDOFF.md`，了解当前部署事实、已知限制和可能的下一步工作。
2. 编辑前阅读与请求层相关的文件：
   - 浏览器 UI：`src/`
   - 同源 API：`server/`
   - Azure 部署：`infra/` 和 `scripts/`
   - 自动化：`.github/workflows/`
3. 如果涉及数据 shape，以 `~/airco-tracking/airco_tracker/inventory.py` 的后端 producer 作为事实来源。
4. 使用 `README.md` 获取面向用户的 setup 和架构信息。行为变化时保持 README 同步。
5. 所有 Markdown 文档都必须维护中文和英语版本。修改任意文档时，在同一变更中更新两个语言版本。

## 不可协商的安全规则

- 本仓库是公开仓库。不要提交或记录 secrets、个人邮箱地址、本机身份、API token、Client Secret、Storage Key、connection string、长期 SAS token 或 Key Vault 值。
- 生产浏览器代码必须调用同源 `/api/inventory`。不要把 Azure Storage 凭据直接给浏览器。
- Blob container 必须保持私有。Node service 使用 user-assigned Managed Identity 读取 `inventory.json`。
- GitHub Actions 使用 OIDC 登录 Azure。不要添加 `AZURE_CREDENTIALS` 或 service-principal password。
- GitHub Actions Variables 只允许存放非秘密标识符：`AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_SUBSCRIPTION_ID` 和 `AZURE_RESOURCE_GROUP`。
- 尽量复用现有 least-privilege runtime identity 和基础设施。没有具体需求和明确授权，不要扩大 Azure 角色。
- 保持严格的 `script-src 'self'; style-src 'self'` CSP。不要为了运行时数据注入而添加 `unsafe-inline`。
- 将 Table Storage 加载的翻译视为数据，而不是可信 markup。只能作为已转义的 `application/json` 嵌入，验证 shape，绝不要用 `dangerouslySetInnerHTML` 渲染。
- 保留用户无关改动。不要覆盖 dirty worktree，也不要随意重写共享历史。

## 产品和设计契约

- 除非用户要求 redesign，否则保持冷静的冰川蓝视觉方向。
- 主要桌面目标是 13 英寸 MacBook Air 风格视口，约 1440×900。窄屏也必须保持响应式布局。
- 主要信息是每个零售商的可购买商品数量。有库存的零售商优先，然后按荷兰 locale 规则排序名称。
- 过期/陈旧的零售商数据必须明显可区分。不要把 stale 值呈现为刚检查过。
- 零售商外链必须清楚、可访问，并带安全 `rel` 属性。
- 当前品牌标识是彩色首字母，不是下载的官方 logo。未经用户权衡许可，不要引入远程 logo 依赖或版权 asset bundle。
- 不要在渲染逻辑中硬编码库存总数。count 和站点状态来自 snapshot。如果营销文案提到追踪网站数量，后端覆盖范围变化时要更新。
- 保持键盘语义、可读对比度、reduced-motion 支持，并在支持断点无横向溢出。
- 中文、荷兰语和英语必须无需刷新即可切换。可见文案、错误、document metadata、本地化日期/数字和无障碍标签要与所选语言同步。

## 架构

```text
Browser
  └─ HTTPS → Azure Container Apps (`airco-tracking-web`, scale 0–2)
                 ├─ serves `dist/` from the Vite build
                 └─ GET `/api/inventory`
                        └─ Managed Identity → private Blob
                           `airco-tracker/inventory.json`
```

- React 入口和 UI：`src/App.tsx`
- 品牌 metadata：`src/brands.ts`
- 浏览器数据类型：`src/types.ts`
- 冰川蓝响应式样式：`src/styles.css`
- Node HTTP service：`server/server.ts`
- 运行时 contract validation：`server/inventory.ts`
- Contract tests：`server/inventory.test.ts`
- 非敏感本地 fixture：`test-fixtures/inventory.sample.json`
- 共享数据 contract：`shared/inventory.ts`
- 共享翻译 contract/parser：`shared/i18n.ts`
- Table Storage translation loader 和 CSP-safe serializer：`server/i18n.ts`
- 浏览器 translation hook 和语言持久化：`src/i18n.ts`
- Container image：`Dockerfile`
- Container App 定义：`infra/app.bicep`
- 仓库专属 OIDC credential：`infra/github-oidc.bicep`
- 部署和验证：`scripts/deploy.sh`、`scripts/verify-deployment.mjs`
- CI/CD：`.github/workflows/ci.yml`、`.github/workflows/deploy.yml`

前端 repo 复用后端项目的 resource group、Container Apps Environment、ACR、Storage Account 和 runtime user-assigned identity。它只拥有 `airco-tracking-web` Container App 和该仓库专属的 GitHub OIDC trust。

## 库存数据契约

- 当前 schema version：`1`。
- Producer 是后端仓库的 `updated_inventory()` 输出。
- 生产通过 `/api/inventory` 读取私有 Blob；开发时 `/api` 代理到读取 `test-fixtures/inventory.sample.json` 的本地 Node server。
- 必需顶层字段包括 `version`、`updated_at`、`refresh_interval_seconds`、aggregate counts 和 `sites`。
- 每个 site 包含 `status`、`stale`、attempt/success timestamps、`available_product_count` 和 `products`。
- Server 在返回前验证 shape。不要静默接受未知 schema version。
- Schema 变化必须协调更新：
  1. 后端 snapshot producer 和测试。
  2. `server/inventory.ts` 和测试。
  3. `src/types.ts` 和 UI 行为。
  4. `test-fixtures/inventory.sample.json`。
  5. 两个仓库的 README 和 handoff 文档。

## 标准本地流程

从仓库根目录使用 Node.js 22 和 pnpm 11.7：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

开发预览（需要两个终端）：

```bash
# Terminal 1: start the API server with sample data
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start

# Terminal 2: start Vite dev server (proxies /api to :4174)
pnpm dev
# http://127.0.0.1:4173
```

生产模式集成检查：

```bash
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

修改布局或 CSS 时，检查 1440×900 和至少一个窄屏断点。确认卡片数、有库存卡片数、总数、横向溢出和浏览器 console error。仅本地 Vite preview 不足以验证 API/server 改动；还要运行生产模式检查。

## CI/CD 和 Azure 流程

- Pull request 和手动 CI 使用 `.github/workflows/ci.yml`。
- 推送到 `main` 使用 `.github/workflows/deploy.yml`；纯 Markdown/docs 改动被忽略，不触发生产部署。
- 部署会运行测试、type check、构建浏览器/server artifacts、编译 Bicep、OIDC 登录、在 ACR 构建镜像、部署 full-SHA 不可变镜像，并验证 `/health`、strict-CSP i18n HTML contract 和 `/api/inventory`。
- Container App 使用外部 HTTPS ingress、30 秒 Blob cache 和 0–2 replicas。
- `scripts/bootstrap-github-oidc.sh` 是一次性或修复操作，不要例行运行。
- 文档-only commit 在无部署 artifact 变化时可使用 `[skip ci]`。
- 授权部署后，在 `HANDOFF.md` 记录 feature commit/image、Actions run、生产响应计数和 provisioning state。

## 变更流程

1. 检查 `git status`、`git log` 和当前 remote state。
2. 如果可能有其他代理推送过，工作前 pull 或 fetch。
3. 做最小连贯变更，并为 server 或 contract 逻辑添加聚焦测试。
4. 运行标准验证命令。
5. UI 变更做浏览器视觉 QA；server 变更做生产模式 API QA。
6. setup、架构、运行时变量或部署行为变化时更新中英双语 `README`。
7. 当前状态、下一步、生产证据或 blocker 变化时更新中英双语 `HANDOFF`。
8. 使用仓库本地 GitHub noreply author commit。只有在授权时才 push/deploy。

## 交接质量

保持 `HANDOFF.md` 事实化且足够紧凑，方便新代理快速扫描。将持久规则（本文件）与当前事实（handoff）分开。记录精确命令和验证证据，但不要包含个人数据、secret 值、token 或不必要的 Azure 标识符。
