# Airco Tracking Web — 当前交接

<p align="center">
  <a href="./HANDOFF.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/HANDOFF-简体中文-d73a49"></a>
  <a href="./HANDOFF.md"><img alt="English" src="https://img.shields.io/badge/HANDOFF-English-0969da"></a>
</p>

最后更新：2026-07-08（Europe/Amsterdam）

文档规则：当前状态、验证证据、blocker 或下一步变化时，必须同时更新中文和英语 handoff。

## 当前目标

提供一个公开、低成本的 Airco Tracker 门户和只读库存 dashboard。生产 dashboard 通过同源 API 和 Managed Identity 读取私有 `inventory.json`，展示可配送到用户目标国家的现货和预售库存。公开首页 (`/`) 是热浪主题门户；库存页在 `/deliver-to/<country>`；语言和配送国家相互独立。

当前产品方向已经扩展到登录、用户资料、订阅和 Stripe Checkout。信用卡订阅路径已在 Stripe sandbox 中跑通，`monthly_priority` 测试购买成功，回跳/刷新后订阅权益能显示。订阅和支付测试矩阵记录在 `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md` 及其英语版本。

## 仓库和生产

- Repository：`https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch：`main`
- Local path：`~/airco-tracking-web`
- Live URL：`https://airco-tracker.eu/`
- Container App：`airco-tracking-web`
- Azure resource group：`airco-tracker-rg`
- Backend repository：`https://github.com/ProgrammerAsahi/airco-tracking`
- Runtime image registry：复用后端 ACR，image name `airco-tracking-web:<full-git-sha>`
- Custom domain：`airco-tracker.eu` 和 `www.airco-tracker.eu` 已写入 `infra/app.bicep`。不要移除 `customDomains`，否则未来 Bicep 部署可能清空手动 hostname binding。
- Deployment workflow：`.github/workflows/deploy.yml`。纯 Markdown/docs 改动已被 `paths-ignore` 忽略，不会触发生产部署。

## 已实现内容

### Browser UI

- React 19 + TypeScript + Vite。
- 公开门户 `/`：热浪叙事、冰川蓝/玻璃拟态视觉、订阅 CTA。
- 登录体验：邮箱验证码 UI、第三方登录 placeholder、昵称卡片、avatar dropdown、profile 页面。
- 用户偏好：昵称、语言、国家字段；国家决定库存入口 `/deliver-to/nl` 或 `/deliver-to/fr`，语言独立切换。
- Ready 页面：付费/订阅后展示“一切已就绪”状态；priority 用户可跳转库存页。
- 订阅页面：weekly/monthly × basic/priority 四种方案；basic 仅邮件提醒，priority 包含实时库存页访问。
- 库存页：`/deliver-to/<country>` 根据后端 `delivery_coverage` 过滤可配送站点；支持现货/预售拆分和 retailer detail overlay。
- 多语言：中文、荷兰语、英语无需刷新切换；日期、数字、metadata、错误和无障碍标签随语言同步。

### Same-origin API

- `server/server.ts` 同时提供静态 Vite build 和 API。
- `/api/inventory` 通过 Managed Identity 读取私有 Blob，并做 schema validation、缓存和 rate limit。
- Auth/session/user 信息使用 Azure Table Storage；尽量少存储个人信息。
- Stripe integration 使用 hosted Checkout；卡号不会接触 Airco Tracker server。
- `/api/billing/webhook` 校验 Stripe signature；无签名请求返回 400。
- `/api/billing/sync-checkout-status` 可在 webhook 延迟时从 Stripe 拉取 checkout/subscription 状态并同步用户权益。

### Azure 和 CI/CD

- 使用 Azure Container Apps Consumption，scale 0–2。
- 复用后端项目的 Container Apps Environment、ACR、Storage Account、resource group 和 runtime UAMI。
- GitHub Actions 使用 OIDC；没有 `AZURE_CREDENTIALS` secret 或 client secret。
- Push 到 `main` 部署生产；docs-only push 不部署。

## 当前已知状态

- Stripe test mode 已配置四个 Price ID：
  - `weekly_basic`: €10/week
  - `weekly_priority`: €20/week
  - `monthly_basic`: €15/month
  - `monthly_priority`: €30/month
- Stripe webhook endpoint：`https://airco-tracker.eu/api/billing/webhook`
- 需要订阅事件：
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- 最近确认：
  - `/health` 生产返回 200。
  - `/ready?lang=zh` 生产返回 200。
  - 无签名 webhook 生产返回 400。
  - 未登录 checkout sync API 生产返回 401。
  - 用户用测试卡购买 `monthly_priority` 后刷新可看到订阅权益。

## 候选下一步

这些是候选项，不代表自动授权：

1. 按 `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md` 继续测试取消订阅、不同方案权益、支付失败、Test Clock 到期和方案变更。
2. 实现或确认更改订阅方案：basic → priority 应立即生效；priority → basic 应在当前周期结束后生效。
3. 为 iDEAL、PayPal 或其它支付方式扩展 Stripe Checkout。
4. 继续修复 `/deliver-to/*` 语言切换和 profile/ready 相关细节时，保持三语 UI 和中英双语文档同步。

## 标准本地验证

```bash
cd ~/airco-tracking-web
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
bash -n scripts/*.sh
git diff --check
```

生产模式检查：

```bash
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

## 恢复 checklist

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

然后：

1. 阅读 `CLAUDE.md`、`AGENTS.md` 和本 handoff。
2. 处理时效性信息前，重新验证 GitHub Actions variables、Azure 状态和生产响应。
3. UI work 需要浏览器验证 1440×900 和一个窄屏断点。
4. Server work 需要生产模式 API QA。
5. Schema work 必须和后端仓库协调。
6. 有意义的工作、部署或 blocker 变化后，同步更新中英双语 handoff。

不要在本文件记录个人数据、secret 值、token、本机身份或不必要的 Azure 标识符。
