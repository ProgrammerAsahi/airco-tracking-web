# Airco Tracking Web — 当前交接

<p align="center">
  <a href="./HANDOFF.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/HANDOFF-简体中文-d73a49"></a>
  <a href="./HANDOFF.md"><img alt="English" src="https://img.shields.io/badge/HANDOFF-English-0969da"></a>
</p>

最后更新：2026-07-16（Europe/Amsterdam）

当前状态、验证证据、blocker 或下一步变化时，必须同时更新本文件和 `HANDOFF.md`。不要记录 secrets、邮箱地址、access tokens、支付数据或不必要的个人信息。

## 当前目标

运行位于 `https://airco-tracker.eu/` 的公开 Airco Tracker 门户、登录账户体验、Stripe 一次性 Heatwave Pass 支付流程和按国家筛选的库存 dashboard。匿名用户可以查看门户和 Pass 价格；`/deliver-to/<country>` 下的实时库存只对持有有效 Heatwave Radar Pass（`radar`）的用户开放。

当前 source branch 正在把原周/月订阅迁移为 €5 Heatwave Alerts Pass 和 €10 Heatwave Radar Pass；两者均一次性付费、有效 90 天且不自动续费。有效 Alerts Pass 可支付 €5 升级到 Radar，并保留原到期日。在新 release 部署并复测前，下方生产信息仍描述上一版已验证的 recurring billing 部署。

协调后的前后端设计为每个用户提供稳定 UUID，并维护一个最小化、32 分片的 `alertrecipients` 投影，供后端 Azure Service Bus 提醒流水线使用。Recipient 增长后，库存 scanner 不会为了每条库存事件扫描 canonical `users` Table。

## 仓库和生产

- Repository：`https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch/local path：`main`、`~/airco-tracking-web`
- Live URLs：`https://airco-tracker.eu/` 和 `https://www.airco-tracker.eu/`
- Container App：`airco-tracking-web`
- Azure resource group：`airco-tracker-rg`
- Backend repository：`https://github.com/ProgrammerAsahi/airco-tracking`
- 已部署 frontend commit/image：`aircotrackertdzvfmmi.azurecr.io/airco-tracking-web:db98ce83f7f46517a75fa9977d4985dc25d5eee1`
- 协调部署的 backend commit/image：`e4194c25cce82f650eb96d72b37f10bdd6d067a7`
- Ready revision：`airco-tracking-web--0000053`；provisioning state 为 `Provisioned`；revision health 为 `Healthy`；流量为 100%
- 成功的 deployment workflow runs：frontend `29367033016`、backend `29167702065`
- Deployment workflow：`.github/workflows/deploy.yml`；纯 Markdown/docs push 不部署

两个自定义 Web hostname 和现有 managed-certificate 名称都已写入 `infra/app.bicep`。不要删除这些 `customDomains`；否则 application Bicep 部署会清空绑定。

## 已实现的产品体验

### Browser UI 和 routing

- `/` 是公开热浪主题门户。五段 sticky-scroll 叙事依次从塞纳河畔热浪进入闷热的巴黎老宅、PortaSplit 降温、基于真实法语库存界面的邮件提醒/实时雷达，再以窗外视角看到已经凉爽的公寓和蓝调塞纳河夜景收束。第四屏包含分阶段邮件和库存数据显隐；第五屏加入克制的鼠标/滚动视差、暖色窗光、河面微光、按语言调整的暗色背景字体、Pass CTA 和优化后的 1672×941 背景。所有场景均包含四语响应式文案和 reduced-motion fallback。已经登录且有有效 Pass 的用户会进入凉爽的 Ready 体验，不会再次看到拉新门户。
- 邮箱验证码登录已经实现。首次注册用户需要设置昵称；Google、Apple、Microsoft 按钮仍是明确的 placeholder，不会启动 OAuth。
- `/profile` 支持修改昵称和已验证邮箱、语言偏好、配送国家、登出、查看 Pass 状态/到期日、从 Alerts 升级到 Radar，以及在没有有效权益时注销账户。
- `/subscribe` 提供两种 Stripe test-mode 产品：Heatwave Alerts Pass（`alerts`，€5）和 Heatwave Radar Pass（`radar`，€10），均有效 90 天。当前 Pass 按钮不可点击；有效 Alerts 用户可支付 €5 立即升级 Radar，原到期日不变。
- `/ready` 会确认提醒已经启用；Radar 用户还会看到前往库存页面的按钮。
- `/deliver-to/nl` 和 `/deliver-to/fr` 按配送范围筛选零售商。匿名、没有有效 Pass 和只有 Alerts 权益的用户都不能读取实时库存。
- 界面语言（`zh`、`nl`、`en`、`fr`）和配送国家相互独立，可从 header 无刷新切换。明确的 header/query 选择会在普通站内导航中保持；在 Profile 保存偏好会同时更新账户持久化默认、提醒收件人投影、库存提醒邮件语言和 Stripe customer locale。

### 同源 API、auth 和 billing

- `server/server.ts` 同时提供 Vite build 和同源 API。`/api/inventory` 通过 Managed Identity 读取私有 Blob，验证 schema version `1`，缓存读取，并对低成本滥用做 rate limit。
- Auth codes、sessions 和 canonical user profiles 存在 Azure Table Storage。验证码会 hash、过期，并受重发冷却和尝试次数限制，再通过 Azure Communication Services Email 投递。验证码 subject、纯文本、HTML、安全提示 footer 和 HTML language metadata 在四种支持语言中均完整覆盖。
- Canonical `users` partition 使用 `id:<uuid>` profile row，以及 `email:<base64url>`、`stripe:<base64url>` index rows。验证码和 profile mutations 由 ETag/CAS 保护；单调递增的 `profileRevision`/`sourceRevision` 会拒绝旧写入。已验证邮箱变更保留 UUID，并以 transaction 替换邮箱索引。
- Stripe 使用托管的一次性 Checkout；卡号永远不会接触 Airco Tracker server。系统没有 Customer Portal 或自动续费。Webhook 事件必须先通过 signature 校验才会被处理。
- 登录用户从 Checkout 返回时，`/api/billing/sync-checkout-status` 可以修复延迟 webhook。两个路径都只有在服务端重新读取并核验 Checkout Session、PaymentIntent、Charge、配置 Price、金额、币种、owner 和付款状态后，才会幂等写入同一 receipt；浏览器跳转参数和客户端声明绝不能作为付款凭证。
- 旧 recurring billing 路由 `/api/auth/subscription/preview-payment`、`/api/auth/subscription/cancel` 和 `/api/billing/cancel-subscription` 均已退役。部署验证要求三个路径全部以 404 fail closed。
- 有效 Pass 会在 90 天后自动到期，应用内不能取消或降级；仍有有效 Pass 权益时不能注销账户。

### 国际化契约

- 应用自有的网页文字、弹窗、错误、无障碍标签、metadata、日期、价格、验证码邮件和 Stripe Checkout 均支持中文、荷兰语、英语和法语。
- `test-fixtures/i18n.local.json` 是完整的浏览器 fallback schema。Azure Table 只提供非空 override；混合版本发布时，即使新语言尚未写入 Table，也会安全回退到镜像内置值。
- 后端 `airco_tracker/i18n_local.json` 的 `web` scope 是生产播种源，必须和前端 JSON map 按值完全等价。当前契约包含 41 个浏览器 key，每个 key 都有四个非空语言值。
- 商家名、商品名和商家原始配送说明作为来源证据保留原文，不做可能改变事实含义的机器翻译。

## 提醒收件人投影契约

每个 Azure-backed 用户都有稳定 UUID `userId`。新用户使用随机 UUID；旧 rows 通过 optimistic concurrency 确定性回填。修改邮箱不会改变 `userId`，因此 Pass 和偏好仍属于同一账户。

旧 email-key rows 会确定性迁移到 UUID 模型。Public API responses 会移除 UUID、revision fields 和 Stripe identifiers。生产环境在 ACS 不可用，或无法证明 canonical identity/entitlement 时会 fail closed。

注册、已验证邮箱/语言/国家变更、Pass 购买/升级、退款/争议、到期和账号删除都会同步 `alertrecipients` Table。该投影：

- 固定使用 32 个 partitions：`r-00`…`r-1f`；
- 使用 `userId` 的 SHA-256 最后一个 byte 对 32 取模计算 shard；
- 只保存当前邮件投递字段、语言、配送国家、权益状态和同步 metadata；
- 不保存昵称、Stripe Customer/Checkout/PaymentIntent identifiers、支付方式或卡信息；
- 随账户注销一并删除。

后端每日 reconciler 会从 canonical `users` 修复跨表部分失败和旧数据；它不位于每条事件的 hot path。修改 shard 数量或 projection schema 必须在两个仓库中做协调、有版本的迁移。

## Azure 部署和 sender domain 选择

- 本应用复用后端的 Container Apps Environment、ACR、Storage Account、共享 runtime identity 和 ACS resources。
- 旧的 storage-account 级 Table contributor 已移除。Shared identity 现在只保留所需的逐表权限；缩权后真实生产 OTP 登录、Profile/投影写入、登出、retention 和 scanner execution 全部通过。
- GitHub Actions 使用限制到分支的 OIDC 和不可变 commit-SHA images；没有 Azure client secret 或 `AZURE_CREDENTIALS` secret。
- `scripts/deploy.sh` 通过准确的 `ACS_EMAIL_DOMAIN_NAME` 选择 ACS Email Domain，默认使用 `AzureManagedDomain`；`EMAIL_DOMAIN_ID` 仍可作为明确的应急/管理覆盖。
- 生产现已在两个仓库使用验证完成的 customer-managed `airco-tracker.eu` ACS sender；Azure-managed domain 仍是明确的 fallback。
- 用于播种和验证生产四语 rows 的临时 operator Table data 权限已撤销。Runtime 和 deploy identities 只保留各自受限的应用权限。
- Stripe secrets 只能由 GitHub Actions 或明确配置的本地环境提供。缺少 Stripe 配置时，不要手工部署生产。

## 当前验证状态

详细的 Pass/支付矩阵维护在 `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md` 和 `.en.md`。上一版 recurring subscription release 已测试首次 Checkout、成功/失败测试卡、3D Secure 成功/失败、到期取消、升级/降级、库存 gating、Profile 修改、语言/国家/邮箱变更、持久化和账号注销规则。这些只属于历史证据；一次性 90 天 Pass flow 必须在部署后按照已重置的新矩阵重新测试。

四语 release 已部署，并通过 71/71 前端 tests、app/server typecheck、production build、production-mode deployment verification 和 `git diff --check`。法语 Landing、Subscribe、登录/昵称、Profile 和 Unsubscribe 状态已在生产的 1440×900 与 390×844 完成视觉检查，console 无 error 或 warning。Header 临时语言会在导航中保持，同时不会覆盖 Profile 已保存偏好；在 Profile 保存偏好会同时更新网页默认语言和提醒邮件语言。

门户第四屏还在 1440×900、1024×768、390×844 和 844×390 下完成了中文、荷兰语、英语、法语本地视觉检查。生产复核确认邮件提醒/实时库存分阶段过渡、法语和中文文案、优化后的 1672×941 背景、五张库存数据卡、Pass CTA、匿名库存保护和浏览器 console 均符合预期。

门户第五屏在 1440×900 下完成了全部四种语言的本地视觉检查，并在 390×844 与 844×390 下重点复核了中英文。生产环境的 1440×900 和 390×844 复核确认最终标题/CTA、1672×941 优化场景资源、无横向溢出、浏览器 console 干净、资源 immutable 缓存和匿名库存保护均符合预期。

此前的订阅绕过安全修复通过 71/71 tests、app/server typecheck、production build、shell validation、`git diff --check`，以及本地和自定义域名生产 smoke tests。当前部署中两个退役 auth subscription 路径均返回 404。一次不输出个人资料的存量审计发现两个 test-mode legacy recurring 权益拥有匹配的 Stripe 归属和未来已付周期结束时间。Pass migration 发布前，必须把这些 Stripe subscriptions 设为周期末取消并 archive 四个 recurring Prices；新 release 还必须验证 `/api/billing/cancel-subscription` 返回 404。

当前生产 release 已部署并验证：

- Frontend workflow `29367033016` 部署安全修复 commit `db98ce8`；backend workflow `29167702065` 继续运行 commit `e4194c2`。两者完整 test、build 和 deployment checks 均通过。
- 生产运行 ready web revision `airco-tracking-web--0000053`，provisioning state 为 `Provisioned`，revision health 为 `Healthy`，流量为 100%。
- `https://airco-tracker.eu/health` 和 `www` health 均返回 200；匿名 `/api/inventory` 返回 401。
- 当前生产环境对退役的 `/api/auth/subscription/preview-payment` 和 `/api/auth/subscription/cancel` 发送 POST 均返回 404；新 release 还会验证 `/api/billing/cancel-subscription` 返回 404。
- 生产 i18n Table 在 `web` 和 `email` 两个 scopes 中共有 56 个 translation entries。自动契约确认每个 key 都有四个非空的 `zh`/`nl`/`en`/`fr` 值，且前后端 web maps 一致。
- 真实法语 OTP 通过自定义 ACS sender 到达已授权 Outlook inbox；法语提醒流水线 canary 通过 Service Bus 到达已授权 Gmail inbox，最终状态为 `delivered`。
- 语言偏好测试覆盖 Profile 持久化和 `alertrecipients` 同步；测试结束后账户已恢复为 `zh`。Canary 完成后 Service Bus active、scheduled 和 dead-letter 均为零，临时 operator Table 权限也已撤销。

## 已知限制和下一步

1. Google、Apple、Microsoft 登录按钮只是 UI placeholder；当前只有邮箱验证码登录可用。
2. Billing 仍处于 Stripe test mode，且先支持信用卡。iDEAL/Wero 或其它支付方式需要单独的产品和合规评估。
3. 90 天 Pass migration 尚未完成生产验证。购买、升级、退款/争议、精确到期、延迟/重复 webhook 和 legacy subscription 退役场景仍列在 billing 测试文档中。
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
