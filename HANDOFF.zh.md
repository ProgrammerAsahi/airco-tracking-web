# Airco Tracking Web — 当前交接

<p align="center">
  <a href="./HANDOFF.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/HANDOFF-简体中文-d73a49"></a>
  <a href="./HANDOFF.md"><img alt="English" src="https://img.shields.io/badge/HANDOFF-English-0969da"></a>
</p>

最后更新：2026-07-11（Europe/Amsterdam）

当前状态、验证证据、blocker 或下一步变化时，必须同时更新本文件和 `HANDOFF.md`。不要记录 secrets、邮箱地址、access tokens、支付数据或不必要的个人信息。

## 当前目标

运行位于 `https://airco-tracker.eu/` 的公开 Airco Tracker 门户、登录账户体验、Stripe 订阅流程和按国家筛选的库存 dashboard。匿名用户可以查看门户和订阅价格；`/deliver-to/<country>` 下的实时库存只对仍有 Realtime Radar（`priority`）权益的用户开放。

已部署的前后端协调 release 为每个用户增加稳定 UUID，并维护一个最小化、32 分片的 `alertrecipients` 投影，供后端 Azure Service Bus 提醒流水线使用。Subscriber 增长后，库存 scanner 不再为了每条库存事件扫描 canonical `users` Table。

## 仓库和生产

- Repository：`https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch/local path：`main`、`~/airco-tracking-web`
- Live URLs：`https://airco-tracker.eu/` 和 `https://www.airco-tracker.eu/`
- Container App：`airco-tracking-web`
- Azure resource group：`airco-tracker-rg`
- Backend repository：`https://github.com/ProgrammerAsahi/airco-tracking`
- 已部署 commit/image：共享私有 ACR 中的 `715acf223377d6b450a2a594e32eee0515a85797`
- Ready revision：`airco-tracking-web--0000041`；provisioning state 为 `Succeeded`
- 成功的 deployment workflow run：`29061171454`
- Deployment workflow：`.github/workflows/deploy.yml`；纯 Markdown/docs push 不部署

两个自定义 Web hostname 和现有 managed-certificate 名称都已写入 `infra/app.bicep`。不要删除这些 `customDomains`；否则 application Bicep 部署会清空绑定。

## 已实现的产品体验

### Browser UI 和 routing

- `/` 是公开热浪主题门户。已经登录并订阅的用户会进入凉爽的 Ready 体验，不会再次看到拉新门户。
- 邮箱验证码登录已经实现。首次注册用户需要设置昵称；Google、Apple、Microsoft 按钮仍是明确的 placeholder，不会启动 OAuth。
- `/profile` 支持修改昵称和已验证邮箱、语言偏好、配送国家、登出、管理订阅，以及在没有有效权益时注销账户。
- `/subscribe` 提供四种 Stripe test-mode 方案：周/月 × Inventory Alerts（`basic`）或 Realtime Radar（`priority`）。当前方案按钮不可点击；升级立即生效，符合条件的降级在当前账期结束时执行。
- `/ready` 会确认提醒已经启用；priority 用户还会看到前往库存页面的按钮。
- `/deliver-to/nl` 和 `/deliver-to/fr` 按配送范围筛选零售商。匿名、未订阅和只有 basic 权益的用户都不能读取实时库存。
- 界面语言（`zh`、`nl`、`en`、`fr`）和配送国家相互独立，可从 header 无刷新切换。明确的 header/query 选择会在普通站内导航中保持；在 Profile 保存偏好会同时更新账户持久化默认、提醒收件人投影、库存提醒邮件语言和 Stripe customer locale。

### 同源 API、auth 和 billing

- `server/server.ts` 同时提供 Vite build 和同源 API。`/api/inventory` 通过 Managed Identity 读取私有 Blob，验证 schema version `1`，缓存读取，并对低成本滥用做 rate limit。
- Auth codes、sessions 和 canonical user profiles 存在 Azure Table Storage。验证码会 hash、过期，并受重发冷却和尝试次数限制，再通过 Azure Communication Services Email 投递。验证码 subject、纯文本、HTML、安全提示 footer 和 HTML language metadata 在四种支持语言中均完整覆盖。
- Canonical `users` partition 使用 `id:<uuid>` profile row，以及 `email:<base64url>`、`stripe:<base64url>` index rows。验证码和 profile mutations 由 ETag/CAS 保护；单调递增的 `profileRevision`/`sourceRevision` 会拒绝旧写入。已验证邮箱变更保留 UUID，并以 transaction 替换邮箱索引。
- Stripe 使用托管 Checkout 和 Customer Portal；卡号永远不会接触 Airco Tracker server。只有通过 signature 校验的 webhook 才能写订阅状态。
- 登录用户从 Checkout 返回时，`/api/billing/sync-checkout-status` 可以修复延迟 webhook。方案变更根据真实 Stripe Price 解析，不信任过期 metadata。
- 取消订阅后，权益保留到已付款周期结束；仍有有效订阅权益时不能注销账户。

### 国际化契约

- 应用自有的网页文字、弹窗、错误、无障碍标签、metadata、日期、价格、验证码邮件、Stripe Checkout 和 Billing Portal 均支持中文、荷兰语、英语和法语。
- `test-fixtures/i18n.local.json` 是完整的浏览器 fallback schema。Azure Table 只提供非空 override；混合版本发布时，即使新语言尚未写入 Table，也会安全回退到镜像内置值。
- 后端 `airco_tracker/i18n_local.json` 的 `web` scope 是生产播种源，必须和前端 JSON map 按值完全等价。当前契约包含 38 个浏览器 key，每个 key 都有四个非空语言值。
- 商家名、商品名和商家原始配送说明作为来源证据保留原文，不做可能改变事实含义的机器翻译。

## 邮件订阅者投影契约

每个 Azure-backed 用户都有稳定 UUID `userId`。新用户使用随机 UUID；旧 rows 通过 optimistic concurrency 确定性回填。修改邮箱不会改变 `userId`，因此订阅和偏好仍属于同一账户。

旧 email-key rows 会确定性迁移到 UUID 模型。Public API responses 会移除 UUID、revision fields 和 Stripe identifiers。生产环境在 ACS 不可用，或无法证明 canonical identity/entitlement 时会 fail closed。

注册、已验证邮箱/语言/国家变更、Stripe 订阅事件、取消订阅和账号删除都会同步 `alertrecipients` Table。该投影：

- 固定使用 32 个 partitions：`r-00`…`r-1f`；
- 使用 `userId` 的 SHA-256 最后一个 byte 对 32 取模计算 shard；
- 只保存当前邮件投递字段、语言、配送国家、权益状态和同步 metadata；
- 不保存昵称、Stripe customer/subscription ID、支付方式或卡信息；
- 随账户注销一并删除。

后端每日 reconciler 会从 canonical `users` 修复跨表部分失败和旧数据；它不位于每条事件的 hot path。修改 shard 数量或 projection schema 必须在两个仓库中做协调、有版本的迁移。

## Azure 部署和 sender domain 选择

- 本应用复用后端的 Container Apps Environment、ACR、Storage Account、共享 runtime identity 和 ACS resources。
- 旧的 storage-account 级 Table contributor 已移除。Shared identity 现在只保留所需的逐表权限；缩权后真实生产 OTP 登录、Profile/投影写入、登出、retention 和 scanner execution 全部通过。
- GitHub Actions 使用限制到分支的 OIDC 和不可变 commit-SHA images；没有 Azure client secret 或 `AZURE_CREDENTIALS` secret。
- `scripts/deploy.sh` 通过准确的 `ACS_EMAIL_DOMAIN_NAME` 选择 ACS Email Domain，默认使用 `AzureManagedDomain`；`EMAIL_DOMAIN_ID` 仍可作为明确的应急/管理覆盖。
- 以后验证 customer-managed ACS sender 后，先在后端 foundation 中连接它，再在两个仓库设置相同的 `ACS_EMAIL_DOMAIN_NAME` GitHub variable，然后部署。在此之前，Azure-managed domain 始终是安全 fallback。
- Stripe secrets 只能由 GitHub Actions 或明确配置的本地环境提供。缺少 Stripe 配置时，不要手工部署生产。

## 当前验证状态

详细的订阅/支付矩阵维护在 `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md` 和 `.en.md`。生产已经测试：首次 Checkout、成功/失败测试卡、3D Secure 成功/失败、到期取消、升级、预约降级、切换扣费周期、库存权益 gating、Profile 修改、语言/国家切换、邮箱修改、登出后重新登录，以及账户注销规则。

四语 release candidate 已通过 71/71 前端 tests、app/server typecheck、production build、production-mode deployment verification 和 `git diff --check`。法语 Landing、Subscribe、Profile、登录/昵称和退订状态已在 1440×900 与 390×844 完成视觉检查；header 临时语言会在导航中保持，同时不会覆盖 Profile 已保存偏好。剩余 release 检查是生产部署和真实法语 OTP/库存提醒投递。

本次 Service Bus 协调 release 已部署并验证：

- CI run `29061171454` 通过 59/59 tests、typecheck、production build、shell/Bicep checks 和 deployment verification。
- 生产在 ready revision `airco-tracking-web--0000041` 运行 immutable image `715acf223377d6b450a2a594e32eee0515a85797`。
- `https://airco-tracker.eu/health` 和 `www` health 均返回 200；匿名 `/api/inventory` 返回 401。
- 移除 account-wide Table 权限后，真实生产 OTP session 覆盖 code 创建/消费、session 创建/删除、canonical user 读取、语言写入并恢复，以及 `alertrecipients` 同步；所有请求返回 200，原偏好已恢复。
- Backend 定向投递到达两个已授权 inbox；之后真实 scanner run 也完整通过恢复后的 Service Bus 流水线，最终 active/scheduled/dead-letter 全为零。

## 已知限制和下一步

1. Google、Apple、Microsoft 登录按钮只是 UI placeholder；当前只有邮箱验证码登录可用。
2. Billing 仍处于 Stripe test mode，且先支持信用卡。iDEAL/Wero 或其它支付方式需要单独的产品和合规评估。
3. Billing 测试文档中仍有部分延迟/重复 webhook 和订阅到期边界场景尚未执行。
4. 生产已经使用验证完成的 customer-managed `airco-tracker.eu` ACS sender；更高 quota 申请仍处于 Open。在 Azure 批准前继续保持一 worker/13 秒限制并逐步 warm up 域名。
5. 目前没有 committed Playwright 视觉/无障碍回归套件，也没有针对连续 frontend/API 故障的独立生产告警。

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

之后先验证当前 GitHub Actions variables、Azure resource names、Stripe test-mode 配置、生产响应和后端 projection contract。UI work 需要检查 1440×900 和一个窄屏断点；server/schema work 必须和 `~/airco-tracking` 协调。
