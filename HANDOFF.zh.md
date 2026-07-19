# Airco Tracking Web — 当前交接

<p align="center">
  <a href="./HANDOFF.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/HANDOFF-简体中文-d73a49"></a>
  <a href="./HANDOFF.md"><img alt="English" src="https://img.shields.io/badge/HANDOFF-English-0969da"></a>
</p>

最后更新：2026-07-17（Europe/Amsterdam）

当前状态、验证证据、blocker 或下一步变化时，必须同时更新本文件和 `HANDOFF.md`。不要记录 secrets、邮箱地址、access tokens、支付数据或不必要的个人信息。

## 当前目标

运行位于 `https://airco-tracker.eu/` 的公开 Airco Tracker 门户、登录账户体验、Stripe 一次性 Heatwave Pass 支付流程和按国家筛选的库存 dashboard。匿名用户可以查看门户和 Pass 价格；`/deliver-to/<country>` 下的实时库存只对持有有效 Heatwave Radar Pass（`radar`）的用户开放。

原周/月订阅已在生产替换为 €5 Heatwave Alerts Pass 和 €10 Heatwave Radar Pass；两者均一次性付费、有效 90 天且不自动续费。有效 Alerts Pass 可支付 €5 升级到 Radar，并保留原到期日。自动部署和安全 smoke 已通过；真实 Sandbox 购买、升级、退款、争议和到期场景仍需按下方人工矩阵验证。

协调后的前后端设计为每个用户提供稳定 UUID，并维护一个最小化、32 分片的 `alertrecipients` 投影，供后端 Azure Service Bus 提醒流水线使用。Recipient 增长后，库存 scanner 不会为了每条库存事件扫描 canonical `users` Table。

## 仓库和生产

- Repository：`https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch/local path：`main`、`~/airco-tracking-web`
- Live URLs：`https://airco-tracker.eu/` 和 `https://www.airco-tracker.eu/`
- Container App：`airco-tracking-web`
- Azure resource group：`airco-tracker-rg`
- Backend repository：`https://github.com/ProgrammerAsahi/airco-tracking`
- 已部署 frontend commit/image：`aircotrackertdzvfmmi.azurecr.io/airco-tracking-web:e33b3826e5e1c77451688d3a8f738d134e3101a3`
- 协调部署的 backend commit/image：`e6d1f3a6d5c6ee782c4459b0eefe9ed7da3a86d9`
- Ready revision：`airco-tracking-web--0000065`；provisioning state 为 `Provisioned`；revision health 为 `Healthy`；流量为 100%
- 成功的 deployment workflow runs：frontend `29691574367`、backend `29611560636`
- Deployment workflow：`.github/workflows/deploy.yml`；纯 Markdown/docs push 不部署

两个自定义 Web hostname 和现有 managed-certificate 名称都已写入 `infra/app.bicep`。不要删除这些 `customDomains`；否则 application Bicep 部署会清空绑定。

## 已实现的产品体验

### Browser UI 和 routing

- `/` 是公开热浪主题门户。叙事现在运行在单一定格影院舞台（`LandingCinema`,650svh）中：五张照片全部是同一个钉在视口的舞台内的图层，滚动只驱动相机运动与图层叠化，画面本身不再滑动。hero 向河畔楼上开着的窗户推进，房间从同一扇窗户浮现并在末段向右平移推向桌面；tracker 场景以桌面（笔记本+手机）接镜并在暗色纱幕中向窗户回推；finale 从外景亮灯的窗户缓缓拉出到蓝调全景。文案拍点以进度驱动的叠加层呈现在同一舞台上：闷热老宅、"抢到了"库存提醒拍（通知 chip)、凉爽房间的情感高潮（含 Pass CTA)、雷达功劳拍和 finale CTA。室内温度徽章从 34°C 倒数到 24°C，五颗拍点进度指示标记叙事位置，tracker 的提醒卡片与库存数据栏共用同一时间线。reduced-motion 用户得到无运镜的静态分幕切换。旧的四个分段场景组件（`LandingHeroVisual`、`LandingStoryVisual`、`LandingTrackerVisual`、`LandingFinaleVisual`）已删除。已经登录且有有效 Pass 的用户会进入凉爽的 Ready 体验，不会再次看到拉新门户。
- 邮箱验证码登录已经实现。首次注册用户需要设置昵称；Google、Apple、Microsoft 按钮仍是明确的 placeholder，不会启动 OAuth。
- `/profile` 支持修改昵称和已验证邮箱、语言偏好、配送国家、登出、查看 Pass 状态/到期日、从 Alerts 升级到 Radar，以及在没有有效权益时注销账户。
- `/subscribe` 提供两种 Stripe test-mode 产品：Heatwave Alerts Pass（`alerts`，€5）和 Heatwave Radar Pass（`radar`，€10），均有效 90 天。当前 Pass 按钮不可点击；有效 Alerts 用户可支付 €5 立即升级 Radar，原到期日不变。
- `/ready` 会确认提醒已经启用；Radar 用户还会看到前往库存页面的按钮。
- `/privacy.html`、`/terms.html` 和 `/imprint.html` 是四语静态 legal 页面，采用与 affiliate 披露页相同的模式。系统相关的 GDPR 实体内容已写好：数据类别（含仅用于内存速率限制的 IP、十分钟过期的验证码）、处理目的与法律依据、处理者及 Stripe 美国传输（欧盟标准合同条款）、保存期限（outbox 30 天、投递行 90 天、退信抑制仅存指纹）、用户权利（无自动化决策）、"不销售空调"澄清、Alerts→Radar 升级路径、自愿 14 天全额退款政策（带经营者确认标记）、联盟链接披露和完整责任条款。仍保留给经营者的可见 `[TODO]` 占位：法定名称、注册地址、隐私/联系邮箱、KvK 号、VAT 号、内容负责人、VAT 处理、退款政策确认、适用法律和争议管辖。登录同意区和 landing footer 会链接到这些页面。
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
- 后端 `airco_tracker/i18n_local.json` 的 `web` scope 是生产播种源，必须和前端 JSON map 按值完全等价。当前契约包含 45 个浏览器 key，每个 key 都有四个非空语言值；新增的 `legal_privacy_link`、`legal_terms_link`、`legal_imprint_link` 和 `legal_affiliate_link` 四个 key 与后端 `web` map 按值完全同步，并已在发布前播种到生产 Table。
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
- 旧的 storage-account 级 Table contributor 已移除，shared identity 的 blob data-plane 权限也已收窄到 `airco-tracker` container。两个 ACS sender identity 改用 custom role `aircontrack-acs-email-sender`，取代 `Communication and Email Service Owner`；旧宽泛 assignment 已在验证后删除，随后 backend scanner 执行成功。新 sender role 下的真实 OTP 登录邮件尚待确认（见下一步）。
- GitHub Actions 使用限制到分支的 OIDC 和不可变 commit-SHA images；没有 Azure client secret 或 `AZURE_CREDENTIALS` secret。`main` 分支要求 `validate` status check，并禁止 force-push 和删除。部署 workflow 通过带 required reviewer 的 `production` GitHub environment 门禁；environment-scoped federated credential `github-airco-tracking-web-env-production` 已加入共享的 `airco-github-deployer` 身份。
- `scripts/deploy.sh` 通过准确的 `ACS_EMAIL_DOMAIN_NAME` 选择 ACS Email Domain，默认使用 `AzureManagedDomain`；`EMAIL_DOMAIN_ID` 仍可作为明确的应急/管理覆盖。
- 生产现已在两个仓库使用验证完成的 customer-managed `airco-tracker.eu` ACS sender；Azure-managed domain 仍是明确的 fallback。
- 用于播种和验证生产四语 rows 的临时 operator Table data 权限已撤销。Runtime 和 deploy identities 只保留各自受限的应用权限。
- Stripe secrets 只能由 GitHub Actions 或明确配置的本地环境提供。缺少 Stripe 配置时，不要手工部署生产。
- Azure 和 GitHub Actions 现在都只使用 `STRIPE_PRICE_ALERTS_PASS`、`STRIPE_PRICE_RADAR_PASS` 和 `STRIPE_PRICE_RADAR_UPGRADE`。账户持有人完成 sudo/2FA verification 后，`STRIPE_BILLING_PORTAL_CONFIGURATION_ID` 和四个旧 weekly/monthly Price variables 已于 2026-07-17 从 GitHub 删除。
- Stripe Sandbox 使用 `price_1TtoNS0XRx7WeBOsNN5xPzlf` 作为 Alerts、`price_1TtoCl0XRx7WeBOs3ATeEv0Y` 作为 Radar、`price_1TtoG10XRx7WeBOsvsvaarrD` 作为 upgrade；四个旧 recurring Prices 已 archive。

## 当前验证状态

详细的 Pass/支付矩阵维护在 `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md` 和 `.en.md`。上一版 recurring subscription 结果只作为历史证据保留。一次性 90 天 release 已部署，但真实 Sandbox Checkout、upgrade、退款、争议、精确到期和 legacy entitlement migration 场景在完整端到端执行前仍保持未勾选。

协调 release 已通过 113/113 web server tests 和 62/62 backend target tests，两个 deployment workflows 均成功。此前四语 Landing、Subscribe、登录/昵称、Profile 和 Unsubscribe 视觉证据仍有参考价值，但新的 €5/€10/€5 金额和 90 天 Pass 文案仍需重新完成生产视觉 QA。

门户第四屏还在 1440×900、1024×768、390×844 和 844×390 下完成了中文、荷兰语、英语、法语本地视觉检查。生产复核确认邮件提醒/实时库存分阶段过渡、法语和中文文案、优化后的 1672×941 背景、五张库存数据卡、Pass CTA、匿名库存保护和浏览器 console 均符合预期。

门户第五屏在 1440×900 下完成了全部四种语言的本地视觉检查，并在 390×844 与 844×390 下重点复核了中英文。生产环境的 1440×900 和 390×844 复核确认最终标题/CTA、1672×941 优化场景资源、无横向溢出、浏览器 console 干净、资源 immutable 缓存和匿名库存保护均符合预期。

Stripe Sandbox destination `airco-tracker-pass-webhook` 继续指向 `https://airco-tracker.eu/api/billing/webhook`，并且只监听准确的八个 events：`checkout.session.completed`、`checkout.session.async_payment_succeeded`、`charge.refunded`、`refund.created`、`refund.updated`、`refund.failed`、`charge.dispute.created` 和 `charge.dispute.closed`。未签名 webhook 会以 400 fail closed。

四个旧 recurring Prices 已 archive。三笔 legacy Sandbox subscriptions 已设为周期末取消：两笔在 2026-08-09 结束，一笔在 2026-08-08 结束；它们的 legacy entitlement migration 行为仍待人工验证。

当前生产 release 已部署并验证：

- Frontend workflow `29691574367` 经 `production` environment 门禁批准后部署 commit `e33b3826e5e1c77451688d3a8f738d134e3101a3`；backend workflow `29611560636` 部署 commit `e6d1f3a6d5c6ee782c4459b0eefe9ed7da3a86d9`。
- 生产运行 ready web revision `airco-tracking-web--0000065`，provisioning state 为 `Provisioned`，revision health 为 `Healthy`，流量为 100%。
- `/`、`/privacy.html`、`/terms.html`、`/imprint.html`、`/health`、`www` host 和 `/deliver-to/nl` 均返回 200；匿名 `/api/inventory` 仍返回 401；strict CSP 保持不变；四个 `legal_*` i18n key 已在内嵌 payload 中下发。
- 定格影院落地页已上线：生产 bundle 确认包含统一舞台、进窗/出窗变焦、桌面渐显、温度徽章、tracker 屏通知 chip、拍点进度点和四语叙事/功劳文案。Legal 页面现已提供填好的 GDPR 内容（国际传输、退款政策、责任条款）并保留经营者 `[TODO]` 占位。发布前本地验证：113/113 tests、typecheck、build 和生产模式冒烟均通过。
- 生产 i18n Table 已在发布前重新播种为 `web` 和 `email` 两个 scope 共 64 条；自动契约确认每个 key 都有四个非空的 `zh`/`nl`/`en`/`fr` 值，且前后端 web maps 一致。

## 已知限制和下一步

1. Google、Apple、Microsoft 登录按钮只是 UI placeholder；当前只有邮箱验证码登录可用。
2. Billing 仍处于 Stripe test mode，且先支持信用卡。iDEAL/Wero 或其它支付方式需要单独的产品和合规评估。
3. 部署/安全 baseline 已完成生产验证，但真实 Sandbox 购买、升级、退款/争议、精确到期、延迟/重复 webhook 和 legacy entitlement migration 场景仍列在 billing 测试文档中。
4. 生产已经使用验证完成的 customer-managed `airco-tracker.eu` ACS sender；更高 quota 申请仍处于 Open。在 Azure 批准前继续保持一 worker/13 秒限制并逐步 warm up 域名。新 custom role `aircontrack-acs-email-sender` 下的首封真实 OTP 登录邮件仍需一次确认。
5. Legal 页面：GDPR 内容已写好，但 `[TODO]` 经营者字段（法定名称、地址、隐私/联系邮箱、KvK、VAT 号、内容负责人、VAT 处理、退款政策确认、适用法律、争议管辖）必须在真实收款前填好并通过法律审查。合规备忘（避免重新推导）：在仅有严格必要会话 Cookie 和 localStorage 语言偏好的现状下不需要 cookie 同意横幅（若以后接入分析、Impact 追踪或任何营销像素需重新评估）；跨境 B2C 数字服务年销售额低于 €10,000 可按本国 VAT 申报、无需注册 OSS，Stripe Tax 可自动处理含税价；撤销权条款采用数字内容例外写法，退款条款为自愿 14 天全额退款（待经营者确认）；荷兰个人可通过 Het Juridisch Loket 获得免费法律咨询。VAT/OSS 与撤回权决策仍是退出 Stripe test mode 的前置条件。
6. 目前没有 committed Playwright 视觉/无障碍回归套件，也没有针对连续 frontend/API 故障的独立生产告警。
7. 建议对 landing footer 和登录同意区的 legal 链接做一次浏览器视觉 QA。定格影院落地页（进窗/出窗变焦、桌面渐显、温度徽章、tracker 屏通知 chip、拍点进度点）需要在桌面和窄屏、四种语言下各做一次视觉 QA。
8. `src/brands.ts` 中有所有者未提交的进行中的 AliExpress 品牌条目——不要代为还原或提交；`src/styles.css` 中对应的 `brand-theme--aliexpress` 类已提交。
9. 两个仓库都有一批待处理的 Dependabot PR（actions 与 npm 升级）；现在合并前会先经过强制的 `validate` 状态检查。

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
