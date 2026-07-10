# Airco Tracking Web

<p align="center">
  <a href="./README.md"><img alt="简体中文" src="https://img.shields.io/badge/README-简体中文-d73a49"></a>
  <a href="./README.en.md"><img alt="English" src="https://img.shields.io/badge/README-English-0969da"></a>
</p>

一个冰川蓝风格的 TypeScript/React 前端与同源 API，用于展示 [Airco Tracker](https://github.com/ProgrammerAsahi/airco-tracking) 的实时库存快照。

**线上站点：** [airco-tracker.eu](https://airco-tracker.eu/)

首页 (`/`) 是公开的热浪主题门户页。库存页面位于 `/deliver-to/<country>`，会根据目标配送国家展示当前可配送零售商的现货和预售数量，并提供商品详情、价格、BTU、配送文本和商品直达链接。配送国家是 URL 状态（例如 `/deliver-to/nl`、`/deliver-to/fr`）；界面语言通过 `?lang=en` 和语言切换器单独控制。中文、荷兰语和英语可在不刷新页面的情况下切换。生产环境使用同源 TypeScript API 和 Managed Identity；Storage Key、SAS token 或任何秘密值都不会进入浏览器。

## 架构

```text
Browser
  └─ HTTPS → Azure Container Apps (scale 0–2)
                 ├─ serves the Vite/React build
                 ├─ GET /api/inventory
                 │      └─ Managed Identity → private inventory.json Blob
                 ├─ POST /api/billing/create-checkout-session
                 │      └─ Stripe Checkout, card payments in the first billing pass
                 ├─ Auth / profile / Stripe webhook 持久化
                 │      ├─ users（完整用户资料）
                 │      └─ alertrecipients（32 分片、最小邮件投影）
                 └─ embeds escaped, inert i18n JSON
                        └─ Managed Identity → Azure Table Storage
```

该应用复用 `airco-tracking` 后端项目已有的 Container Apps Environment、ACR、Storage Account 和运行时身份，并只在同一个 resource group 中额外创建一个 `airco-tracking-web` Container App。

用户以稳定 UUID `userId` 标识，因此修改邮箱不会改变账户身份。每次注册、资料/偏好更新、Stripe 订阅 webhook、取消订阅和账号删除都会同步维护 `alertrecipients` Table。该投影按 `sha256(userId) % 32` 分片，只保存邮件投递所需的邮箱、语言、配送国家和订阅状态；不保存昵称、Stripe ID、支付方式或卡信息。未配置 Azure Storage 的本地开发仍使用内存用户存储，不依赖该投影。

生产 Web hostnames `airco-tracker.eu` 和 `www.airco-tracker.eu` 已持久化在 `infra/app.bicep`。登录邮件会选择明确的 ACS Email Domain：`ACS_EMAIL_DOMAIN_NAME` 默认是 `AzureManagedDomain`；以后验证 customer-managed sender 后也能明确切换，不依赖 Azure resources 的枚举顺序。

## 本地开发

需要 Node.js 22 和 pnpm 11.7。

```bash
pnpm install
# Terminal 1, after `pnpm build:server`
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
# Terminal 2
pnpm dev
```

打开 <http://127.0.0.1:4173> 查看公开门户页。开发环境会把 `/api` 代理到本地 Node server。

使用 `/deliver-to/<country>?lang=<language>` 查看国家感知页面。例如，`/deliver-to/fr?lang=en` 会用英文界面显示可配送法国的网站，而 `/deliver-to/nl?lang=zh` 会保持荷兰配送目的地，仅切换为中文界面。

本地测试生产 server：

```bash
pnpm test
pnpm build
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

## Azure 部署

该仓库使用 GitHub OIDC，而不是 client secret。一次性的 bootstrap 会给现有的 `airco-github-deployer` identity 添加仓库专属 federated credential，并只把非秘密标识符写入 GitHub Actions Variables：

```bash
./scripts/bootstrap-github-oidc.sh
```

符合条件的代码 push 到 `main` 会运行测试、编译 TypeScript 和 Bicep、在现有 ACR 中构建不可变镜像、部署 `airco-tracking-web`，并验证 `/health`、严格 CSP 下的 i18n HTML contract 和 `/api/inventory`。纯 Markdown/docs 改动被部署 workflow 忽略，不会触发生产部署。

- `.github/workflows/ci.yml`：验证 pull request。
- `.github/workflows/deploy.yml`：部署 `main` 到 Azure。
- `infra/app.bicep`：Container App，包含外部 HTTPS ingress、scale-to-zero、Managed Identity 和私有 ACR pull。

## 部署和运行时配置

| Variable | Purpose |
| --- | --- |
| `AZURE_STORAGE_ACCOUNT_URL` | 现有私有 Blob account URL |
| `AZURE_STORAGE_CONTAINER` | 默认 `airco-tracker` |
| `AZURE_INVENTORY_BLOB` | 默认 `inventory.json` |
| `AZURE_CLIENT_ID` | 用户分配的运行时 identity |
| `ACS_EMAIL_DOMAIN_NAME` | 部署时为登录邮件选择的准确 ACS Email Domain，默认 `AzureManagedDomain` |
| `AUTH_ALERT_RECIPIENTS_TABLE` | 分片邮件订阅者投影表，默认 `alertrecipients` |
| `INVENTORY_CACHE_SECONDS` | Blob 读取缓存，默认 30 秒 |
| `INVENTORY_FILE` | 仅本地使用的文件覆盖 |
| `I18N_FILE` | 仅本地使用的翻译 JSON 覆盖 |
| `APP_BASE_URL` | Stripe 返回 URL 使用的公开 origin，例如 `https://airco-tracker.eu` |
| `STRIPE_SECRET_KEY` | Stripe secret key。先使用 test mode (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | `/api/billing/webhook` 的 Stripe webhook signing secret |
| `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` | 已启用订阅切换、并允许四个 Price 的 Stripe Customer Portal configuration ID |
| `STRIPE_PRICE_WEEKLY_BASIC` | `weekly_basic` 的 Stripe recurring Price ID |
| `STRIPE_PRICE_WEEKLY_PRIORITY` | `weekly_priority` 的 Stripe recurring Price ID |
| `STRIPE_PRICE_MONTHLY_BASIC` | `monthly_basic` 的 Stripe recurring Price ID |
| `STRIPE_PRICE_MONTHLY_PRIORITY` | `monthly_priority` 的 Stripe recurring Price ID |

### Stripe billing setup

第一版 billing 使用托管的 Stripe Checkout，先只支持信用卡。卡号数据永远不会接触 Airco Tracker server。请在 Stripe test mode 中创建四个 recurring Prices，并映射到上面的变量：

- `weekly_basic`: €10 / week
- `weekly_priority`: €20 / week
- `monthly_basic`: €15 / month
- `monthly_priority`: €30 / month

配置 Stripe webhook endpoint：

```text
https://airco-tracker.eu/api/billing/webhook
```

至少订阅以下事件：

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

切换到 live mode 之前，先使用 Stripe test cards 验证 Checkout。

Customer Portal 配置必须启用订阅方案切换，并把两个产品下的四个 Price 全部加入允许列表。升级应立即结算差额；降级和切换到更短周期应在当前账期结束后生效。把该配置的 `bpc_...` ID 写入 `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`，后端会在需要 3D Secure 时显式使用并校验这份配置。

## 文档语言维护

所有 Markdown 文档都应提供中文和英语版本，并在顶部提供语言切换 badge。以后修改任何文档时，必须同步更新两个语言版本。

不要把 Azure keys、长期 SAS tokens 或 secrets 添加到本仓库。
