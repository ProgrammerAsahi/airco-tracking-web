# Airco Tracking Web

<p align="center">
  <a href="./README.md"><img alt="简体中文" src="https://img.shields.io/badge/README-简体中文-d73a49"></a>
  <a href="./README.en.md"><img alt="English" src="https://img.shields.io/badge/README-English-0969da"></a>
</p>

一个冰川蓝风格的 TypeScript/React 前端与同源 API，用于展示 [Airco Tracker](https://github.com/ProgrammerAsahi/airco-tracking) 的近实时库存快照（通常约每 10 分钟刷新）。

**线上站点：** [airco-tracker.eu](https://airco-tracker.eu/)

首页 (`/`) 是公开的热浪主题门户页，通过四段滚动叙事依次呈现塞纳河畔热浪、闷热的巴黎老宅、PortaSplit 降温，以及邮件提醒与实时库存雷达。库存页面位于 `/deliver-to/<country>`，会根据目标配送国家展示当前可配送零售商的现货和预售数量，并提供商品详情、价格、BTU、配送文本和商品直达链接。配送国家是 URL 状态（例如 `/deliver-to/nl`、`/deliver-to/fr`）；界面语言通过 `?lang=fr` 和语言切换器单独控制。中文、荷兰语、英语和法语可在不刷新页面的情况下切换。生产环境使用同源 TypeScript API 和 Managed Identity；Storage Key、SAS token 或任何秘密值都不会进入浏览器。

库存契约可以提供可选的 HTTPS `affiliate_url`。商品卡会优先打开该购买链接，并标记为 sponsored；稳定的商家 `url` 仍用于商品身份、React key 和库存状态，不会因联盟链接变化产生虚假上下架。缺少或不安全的联盟 URL 会被服务端拒绝或回退到 canonical URL。通用的四语披露位于 `/affiliate-disclosure.html`。

## 架构

```text
Browser
  └─ HTTPS → Azure Container Apps (scale 0–2)
                 ├─ serves the Vite/React build
                 ├─ GET /api/inventory
                 │      └─ Managed Identity → private inventory.json Blob
                 ├─ POST /api/billing/create-checkout-session
                 │      └─ Stripe Checkout，一次性信用卡支付
                 ├─ Auth / profile / Stripe webhook 持久化
                 │      ├─ users（完整用户资料）
                 │      └─ alertrecipients（32 分片、最小邮件投影）
                 └─ embeds escaped, inert i18n JSON
                        └─ Managed Identity → Azure Table Storage
```

该应用复用 `airco-tracking` 后端项目已有的 Container Apps Environment、ACR、Storage Account，以及按职责分离的 Web/retention 运行时身份；在同一个 resource group 中创建 `airco-tracking-web` Container App 和独立的过期记录清理 Job。

用户以稳定 UUID `userId` 标识，因此修改邮箱不会改变账户身份。每次注册、资料/偏好更新、Stripe 通行证购买、退款/争议、权益到期和账号删除都会同步维护 `alertrecipients` Table。该投影按 `sha256(userId) % 32` 分片，只保存邮件投递所需的邮箱、语言、配送国家和通行证权益；不保存昵称、Stripe ID、支付方式或卡信息。未配置 Azure Storage 的本地开发仍使用内存用户存储，不依赖该投影。

Azure-backed canonical 用户数据使用 `id:<uuid>` profile row，并通过 `email:<base64url>`、`stripe:<base64url>` index rows 定位账户。ETag/CAS 和单调 revision 防止验证码重复消费、并发资料覆盖和旧 webhook/projection 回写；修改已验证邮箱时保留 UUID，并以 transaction 替换邮箱索引。Public API 不返回 UUID、revision 或 Stripe identifiers。

验证码只以 versioned HMAC-SHA256 保存，使用独立的 Key Vault secret `auth-code-hmac-pepper`。每条验证码都会保存版本，因此轮换 pepper 并递增 `AUTH_CODE_HMAC_PEPPER_VERSION` 后，仍未使用的旧版验证码和历史无 pepper SHA-256 验证码都会安全失效。每次发信尝试前（包括 ACS 随后发送失败的情况），系统使用 Azure Table ETag/CAS 分别扣除标准化邮箱、可信客户端 IP 和全站固定小时预算；邮箱/IP counter key 是 pepper HMAC 标识，不是明文个人数据。Container Apps 只信任 `X-Forwarded-For` 最右侧由 ingress 追加的地址；本地运行完全忽略 forwarded header，使用 socket 地址。进程内 HTTP 限流 Map 另有硬上限和淘汰机制。

注销账户会先以 fail-closed 方式把付费订单所需证据写入独立、去标识化的最小法律留存记录；写入失败就不会继续删除。该记录使用不可逆的确定性键并带明确的 `retentionUntil`，只保留会计或法律请求所需的 Stripe/订单标识以及合同、付款、退款、撤回和法律条款接受字段；明确不保留邮箱、昵称、撤回姓名、配送/语言偏好、提醒设置、卡品牌或后四位。期限从每张收据所保留证据中最晚的法定相关时间点（如服务到期、退款/撤回或确认时间）计算，不再从注销日计算。`LEGAL_RECORD_RETENTION_YEARS` 只允许 `7` 或 `10`，正式结账还要求 `LEGAL_RECORD_RETENTION_BASIS_CONFIRMED=true`；只有经确认适用 OSS 等十年记录义务时才选 `10`。重复注销会复用同一记录，只能延长期限，不能缩短。账本持久化后才删除登录 profile 和各索引。

公开隐私期限与实际流水线一致：验证码约 10 分钟、会话 30 天、已发布提醒 outbox 30 天、终态投递元数据 90 天、缺货商品状态 90 天后压缩、最小 tombstone 365 天、异常 ACS Event Grid dead-letter 原始内容 7 天。Web 服务不会另建持久的请求/安全日志数据库；有限的平台日志按 Azure workspace 已配置的期限保存。

浏览器对认证和 billing API 的所有 `POST` 都必须携带与当前站点完全一致的 `Origin`；缺少 `Origin` 的浏览器形态请求、同站不同源和跨站请求都会默认拒绝。受控非浏览器客户端必须没有 Fetch Metadata，并显式发送 `X-Airco-Api-Client: trusted-non-browser-v1`。该自定义 header 仅供可信运维客户端使用，服务不开放 CORS。

生产 Web hostnames `airco-tracker.eu` 和 `www.airco-tracker.eu` 已持久化在 `infra/app.bicep`。登录邮件会明确选择 ACS Email Domain：生产目前通过 `ACS_EMAIL_DOMAIN_NAME` 选择已验证的 customer-managed `airco-tracker.eu` sender，同时保留 `AzureManagedDomain` 作为回滚 fallback；部署不依赖 Azure resources 的枚举顺序。

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

使用 `/deliver-to/<country>?lang=<language>` 查看国家感知页面。例如，`/deliver-to/fr?lang=fr` 会用法语界面显示可配送法国的网站，而 `/deliver-to/nl?lang=zh` 会保持荷兰配送目的地，仅切换为中文界面。右上角语言切换器只改变当前浏览语言；在 Profile 保存语言偏好会把它设为账户默认语言，并决定登录后的默认界面和库存提醒邮件语言。验证码邮件跟随发码页面的当前语言。

本地测试生产 server：

```bash
pnpm test
pnpm build
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

浏览器冒烟测试使用 Playwright Chromium，并用 axe 检查公开门户中的 serious/critical 可访问性问题。首次运行需要安装浏览器：

```bash
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
```

CI 和生产部署会把高危、严重的生产依赖审计结果视为阻断错误，并运行同一组浏览器测试。

登录、首次昵称设置以及 Profile/账户弹窗共用一套无障碍 Dialog：打开时把焦点移入弹窗并限制在其中，关闭后恢复到触发按钮；支持 Escape 和点击遮罩关闭，同时让背景应用变为 inert。公开的服务条款、隐私政策、法律声明和联盟披露会从同一份内容源在服务端按 `en`、`nl`、`fr`、`zh` 渲染；因此即使禁用 JavaScript，严格 CSP 下仍可获得完整正文、本地化元数据、canonical 与 `hreflang`。已经停用的欧盟 ODR 平台不会再被链接。

## Azure 部署

该仓库使用 GitHub OIDC，而不是 client secret。一次性的 bootstrap 会给现有的 `airco-github-deployer` identity 添加仓库专属 federated credential，并只把非秘密标识符写入 GitHub Actions Variables：

```bash
./scripts/bootstrap-github-oidc.sh
```

符合条件的代码 push 到 `main` 会运行测试、编译 TypeScript 和 Bicep，并在现有 ACR 中构建不可变镜像。Container App 使用 multiple-revision 发布：旧健康 revision 在候选验证期间继续承载 100% traffic；脚本通过候选 revision FQDN 验证 `/health`、会实际读取库存依赖的 `/ready`、严格 CSP 下的 i18n HTML contract、受保护库存与 Stripe webhook 配置，全部成功后才切换 100% traffic。部署或切流后验证失败会自动把 traffic 恢复到上一 revision。纯 Markdown/docs 改动被部署 workflow 忽略，不会触发生产部署。

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
| `ACS_EMAIL_DOMAIN_NAME` | 部署时为登录邮件选择的准确 ACS Email Domain；代码默认 `AzureManagedDomain`，生产明确选择 `airco-tracker.eu` |
| `AUTH_ALERT_RECIPIENTS_TABLE` | 分片邮件订阅者投影表，默认 `alertrecipients` |
| `INVENTORY_CACHE_SECONDS` | Blob 读取缓存，默认 30 秒 |
| `INVENTORY_FILE` | 仅本地使用的文件覆盖 |
| `I18N_FILE` | 仅本地使用的翻译 JSON 覆盖 |
| `APP_BASE_URL` | Stripe 返回 URL 使用的公开 origin，例如 `https://airco-tracker.eu` |
| `STRIPE_SECRET_KEY` | Stripe secret key。先使用 test mode (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | `/api/billing/webhook` 的 Stripe webhook signing secret |
| `STRIPE_PRICE_ALERTS_PASS` | €5 Heatwave Alerts Pass 的一次性 Stripe Price ID |
| `STRIPE_PRICE_RADAR_PASS` | €10 Heatwave Radar Pass 的一次性 Stripe Price ID |
| `STRIPE_PRICE_RADAR_UPGRADE` | 有效 Alerts Pass 升级到 Radar Pass 的 €5 一次性 Stripe Price ID |
| `WITHDRAWAL_SIGNING_KEY` | 至少 32 字符的撤回确认令牌签名密钥；生产环境应由 Key Vault 提供 |
| `WITHDRAWAL_RATE_LIMIT_MAX_REQUESTS` | 每个来源每分钟允许的撤回 API 请求数，默认 `10` |
| `AUTH_CODE_HMAC_PEPPER` | 独立且至少 32 字符的验证码 HMAC secret；生产环境注入 Key Vault 中名为 `auth-code-hmac-pepper` 的 secret |
| `AUTH_CODE_HMAC_PEPPER_VERSION` | 随验证码保存的短版本号；默认 `v1`，轮换 pepper 时必须有意递增 |
| `AUTH_EMAIL_CODE_BUDGET_PER_HOUR` | 跨副本持久化的单邮箱发信尝试预算；默认每个固定 UTC 小时 `5` 次 |
| `AUTH_IP_CODE_BUDGET_PER_HOUR` | 跨副本持久化的单客户端 IP 发信尝试预算；默认每个固定 UTC 小时 `20` 次 |
| `AUTH_GLOBAL_CODE_BUDGET_PER_HOUR` | 跨副本全站熔断预算；默认每个固定 UTC 小时 `1000` 次；发送失败会同时计入三层预算 |
| `TRUST_PLATFORM_X_FORWARDED_FOR` | 仅生产使用的信任开关；Bicep 设为 `true`，只读取 ACA 最右侧追加 IP，本地保持未设置并使用 socket |
| `RATE_LIMIT_MAX_BUCKETS` | 进程内 HTTP 限流 Map 的硬上限，默认 `10000` |
| `LEGAL_OPERATOR_NAME` / `LEGAL_OPERATOR_ADDRESS` | 合同经营者的法定名称和完整地址 |
| `LEGAL_PUBLICATION_DIRECTOR` | 依法承担网站出版责任的真实人员；法国法律声明和正式结账的必填项 |
| `LEGAL_HOST_NAME` / `LEGAL_HOST_ADDRESS` / `LEGAL_HOST_PHONE` | 实际托管服务商经核实的法定名称、邮寄地址和电话；三项都会公开，且正式结账前必须齐全 |
| `LEGAL_CONTACT_EMAIL` / `LEGAL_CONTACT_PHONE` | 公开客服电话邮箱和电话；正式结账前两者都必须配置 |
| `LEGAL_PRIVACY_EMAIL` / `LEGAL_WITHDRAWAL_EMAIL` | 隐私和撤回申请联系地址 |
| `LEGAL_FR_MEDIATOR_NAME` / `LEGAL_FR_MEDIATOR_ADDRESS` / `LEGAL_FR_MEDIATOR_URL` | 实际签约认可的法国消费者调解机构；三项都是真实付款前置条件，禁止猜测填写 |
| `LEGAL_BUSINESS_REGISTRATION_STATUS` | `registered`、经法律确认的 `exempt_confirmed`，或阻止正式支付的 `not_registered` |
| `LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION` | 只有在专业意见确认注册豁免后才设为 `true` |
| `LEGAL_KVK_NUMBER` | `registered` 状态下必填的商业登记号 |
| `LEGAL_VAT_STATUS` / `LEGAL_VAT_ID` | `registered` 或 `not_registered`；已登记时必须提供 VAT ID，未登记时确认邮件明确写明未收取 VAT |
| `LEGAL_PRODUCTION_READY` | 完成经营者、税务和条款法律复核后才设为 `true` |
| `LEGAL_RECORD_RETENTION_YEARS` | 经确认的法律账本期限，只允许 `7` 或 `10` 年；从所保留证据中最晚的法定相关时间点计算 |
| `LEGAL_RECORD_RETENTION_BASIS_CONFIRMED` | 正式结账前必须为 `true`；仅在确认 7/10 年法律或会计依据后设置（适用 OSS 记录时选择 10 年） |

首次部署该版本前，必须在现有 Key Vault 中创建一个稳定的 `auth-code-hmac-pepper` secret，内容至少包含 32 个密码学安全随机字节。不得把值写入 GitHub variables、源码、日志或部署输出；Web Managed Identity 只通过 Key Vault secret reference 读取。轮换时在 Key Vault 创建新 secret version，并在同一受控发布中递增 `AUTH_CODE_HMAC_PEPPER_VERSION`，旧版本签发的验证码会 fail closed。

部署还会创建每小时运行的 Azure Container Apps Job，清理已过期的验证码、单邮箱/单 IP/全局预算和会话行；去标识化法律账本只会在其锚定的 `retentionUntil` 到期后删除。该 Job 使用专用 retention identity，仅在 `users`、`authcodes`、`authsessions` 三表拥有删除所需权限，不继承 Web 的 ACS 或 Key Vault 权限。清理按页读取且单次设有上限，积压会在后续小时持续收敛；遇到非法法律期限会 fail closed，不会删除证据。

### Stripe billing setup

Billing 使用托管的 Stripe Checkout，先只支持信用卡。卡号数据永远不会接触 Airco Tracker server。请在 Stripe test mode 中创建三个一次性 Price，并映射到上面的变量：

- Heatwave Alerts Pass：€5，一次付费，库存提醒邮件有效 90 天。
- Heatwave Radar Pass：€10，一次付费，库存提醒邮件和近实时库存访问（通常约每 10 分钟刷新）有效 90 天。
- Alerts → Radar upgrade：€5，一次付费，立即增加近实时库存权限，并沿用原 Alerts Pass 到期日。

通行证不会自动续费。有效 Radar Pass 不能降级；到期后用户可以重新购买任一通行证。有效 Alerts Pass 只能购买 €5 upgrade，不能重复购买同级通行证。

订阅页从 `/api/legal/config` 读取公开 VAT 状态，只会显示“总价已含 VAT”或“依法不收取 VAT”；状态未知或接口不可用时，正式付款按钮会关闭。所有公开与登录后页面都显著提供撤回/退款入口；撤回表格要求消费者姓名，以及一个默认未勾选的“向账户邮箱发送电子确认”明确选择。库存页说明通常约 10 分钟的刷新节奏和准确排序：零售商按匹配数量再按名称，商品按价格且未知价格排最后；联盟关系不影响排序，过期或未验证来源不会计入结果。

配置 Stripe webhook endpoint：

```text
https://airco-tracker.eu/api/billing/webhook
```

至少订阅以下与一次性付款、退款和争议有关的事件：

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `charge.dispute.created`
- `charge.dispute.closed`

切换到 live mode 之前，先使用 Stripe test cards 验证 Checkout。

正式或格式未知的 Stripe 密钥（包括 `sk_live_`、`rk_live_`）会采用 fail-closed 策略：经营者身份、出版负责人、托管服务商信息、注册/VAT 状态、法律确认、联系地址、撤回签名密钥或 `LEGAL_PRODUCTION_READY` 任一不完整时，服务端拒绝创建结账会话。不要用此开关代替荷兰/EU 专业法律和税务意见。

Customer Portal 不参与通行证购买流程。付款成功后，以经过签名验证的 webhook 和登录用户的 Checkout return sync 更新权益；重复事件必须保持幂等。完整回归矩阵见 `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md`。

正式收款前必须逐项完成并留存证据的经营者、税务、法国消费者调解、数据保护与发布检查，见 `docs/LEGAL_PRODUCTION_CHECKLIST.zh.md`。

## 文档语言维护

所有 Markdown 文档都应提供中文和英语版本，并在顶部提供语言切换 badge。以后修改任何文档时，必须同步更新两个语言版本。

不要把 Azure keys、长期 SAS tokens 或 secrets 添加到本仓库。
