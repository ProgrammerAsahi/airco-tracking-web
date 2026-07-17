# Heatwave Pass 支付与权益测试计划

<p align="center">
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.md"><img alt="简体中文" src="https://img.shields.io/badge/TEST_PLAN-简体中文-d73a49"></a>
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.en.md"><img alt="English" src="https://img.shields.io/badge/TEST_PLAN-English-0969da"></a>
</p>

最后更新：2026-07-17

本文件跟踪门户、登录、一次性 Stripe 支付、90 天权益和实时库存访问控制的端到端测试。任何场景、状态或测试记录变化时，都必须同步更新中英文版本。

> 2026-07-09 以前完成的周/月订阅测试只作为历史证据保留在 Git 历史中，不能证明当前一次性 Heatwave Pass 实现正确。以下矩阵已按新产品重新置为待测。

状态：✅ 通过 · ❌ 失败 · 🚧 部分完成/待修复 · ⬜ 待测 · ⏸️ 延后

## 测试配置

- 站点：`https://airco-tracker.eu`
- Stripe：Sandbox / test mode
- Webhook：Stripe destination `airco-tracker-pass-webhook` → `https://airco-tracker.eu/api/billing/webhook`
- Webhook 只订阅八个 events：`checkout.session.completed`、`checkout.session.async_payment_succeeded`、`charge.refunded`、`refund.created`、`refund.updated`、`refund.failed`、`charge.dispute.created`、`charge.dispute.closed`
- 支付方式：第一阶段只启用信用卡；卡号由 Stripe Checkout 托管，Airco Tracker 不读取或保存完整卡号。
- 当前仍是 Sandbox/test mode。切换真实收款前必须完成 VAT/税务、消费者撤回权、退款政策、条款/隐私文案和结账披露的合规确认。

| 产品 | 权益 | 价格 | 有效期 | Stripe test Price ID |
| --- | --- | ---: | ---: | --- |
| Heatwave Alerts Pass (`alerts`) | 库存上线邮件 | €5 一次性 | 90 天 | `price_1TtoNS0XRx7WeBOsNN5xPzlf` |
| Heatwave Radar Pass (`radar`) | 邮件 + 实时库存 | €10 一次性 | 90 天 | `price_1TtoCl0XRx7WeBOs3ATeEv0Y` |
| Alerts → Radar upgrade | 增加实时库存；沿用原到期日 | €5 一次性 | 原 Alerts 到期日 | `price_1TtoG10XRx7WeBOsvsvaarrD` |

Canonical 权益以 `tier`、`status`、`purchasedAt`、`expiresAt` 和最小化的支付 receipt ledger 表达。Stripe Customer、Checkout Session 和 PaymentIntent 标识只能保存在私有服务端数据中，不能出现在 public profile 或 `alertrecipients` 投影中。

## P0：首次购买与返回站内

| 状态 | 场景 | 预期结果 | 记录 |
| --- | --- | --- | --- |
| ⬜ | 未登录用户选择任一 Pass | 先完成登录/新用户昵称，再继续原先选择的支付流程 | 待测 |
| ⬜ | 购买 Alerts Pass | Stripe 收取 €5；立即获得 90 天邮件权益；不能访问实时库存 | 待测 |
| ⬜ | 购买 Radar Pass | Stripe 收取 €10；立即获得 90 天邮件和实时库存权益 | 待测 |
| ⬜ | 在 Checkout 取消或返回 | 不产生权益或 receipt；回到站内可安全重试 | 待测 |
| ⬜ | 支付成功并自动回跳 | 无需手动刷新，`sync-checkout-status` 或 webhook 即可显示正确权益 | 待测 |
| ⬜ | 支付后刷新、登出再登录 | 同一用户的 tier、到期日、国家和语言保持一致 | 待测 |
| ⬜ | 有效 Alerts 用户再次选择 Alerts | 按钮不可用；服务端拒绝重复购买 | 待测 |
| ⬜ | 有效 Radar 用户选择任一 Pass | 当前 Radar 显示为已拥有；Alerts 显示已包含；服务端拒绝重复购买/降级 | 待测 |
| ⬜ | 检查 Stripe 对象 | 仅产生一次性 Checkout/PaymentIntent；不创建 Subscription、续费 Invoice 或自动扣款 | 待测 |

## P0：升级、到期和重新购买

| 状态 | 场景 | 预期结果 | 记录 |
| --- | --- | --- | --- |
| ⬜ | 有效 Alerts → Radar | Stripe 收取 €5；Radar 立即生效；`expiresAt` 保持为原 Alerts 到期日 | 待测 |
| ⬜ | 升级支付失败/取消 | 继续保留原 Alerts 权益；不产生 Radar receipt | 待测 |
| ⬜ | 有效 Radar 尝试降级或重复购买 | UI 不提供可执行按钮；API 返回冲突且不创建 Checkout | 待测 |
| ⬜ | 到期前一小时购买 Radar | 按产品规则购买新的 90 天 Radar，而不是几乎无剩余时间的 upgrade | 待测 |
| ⬜ | 到期边界 | `expiresAt` 前最后一刻仍有权益；到点后邮件投影和实时库存权限立即关闭 | 待测 |
| ⬜ | 到期后重新购买 | 可购买任一 Pass；从新支付时间获得新的 90 天有效期 | 待测 |
| ⬜ | 有效 Pass 时注销账户 | 服务端拒绝注销，并明确显示到期日 | 待测 |
| ⬜ | 无 Pass 或 Pass 到期后注销 | 账户、session 和提醒投影被删除；Stripe 支付记录不被伪造删除 | 待测 |

## P0：访问控制与偏好

| 状态 | 场景 | 预期结果 | 记录 |
| --- | --- | --- | --- |
| ⬜ | 匿名访问 `/deliver-to/nl` 或 `/deliver-to/fr` | 看不到库存数据；引导登录/购买 | 待测 |
| ⬜ | 已登录但无有效 Pass | 看不到库存数据；引导购买 | 待测 |
| ⬜ | 有效 Alerts Pass | Ready 页显示邮件已启用，但不可读取实时库存 | 待测 |
| ⬜ | 有效 Radar Pass | 按账户国家进入对应库存页并只显示可配送站点 | 待测 |
| ⬜ | Radar 用户切换国家 | 权益不变，库存路由和站点列表随国家变化 | 待测 |
| ⬜ | Header 临时切换语言 | 当前页面即时切换；不覆盖 Profile 持久化偏好 | 待测 |
| ⬜ | Profile 保存语言 | Profile、Ready、库存、验证码邮件、提醒邮件与 Stripe locale 一致 | 待测 |

## P0：Webhook、退款和争议

| 状态 | 场景 | 预期结果 | 记录 |
| --- | --- | --- | --- |
| ✅ | 无效/缺失 Stripe signature | Webhook 返回 400，不写任何用户或权益数据 | 2026-07-17 生产 smoke：未签名请求返回 400 |
| ✅ | Webhook destination 事件白名单 | 只监听支付完成、退款 lifecycle 和争议 lifecycle 所需的八个 events | 2026-07-17 已核对 `airco-tracker-pass-webhook` 的准确事件集合 |
| ⬜ | `checkout.session.completed` | 根据服务端 metadata 和实际 Price 绑定正确用户、tier、金额和 PaymentIntent | 待测 |
| ⬜ | `checkout.session.async_payment_succeeded` | 延迟支付只在确认成功后赋权，重复事件保持幂等 | 待测 |
| ⬜ | 重放同一事件/重复回跳同步 | receipt 只写一次，不延长 90 天，也不重复赋权 | 待测 |
| ⬜ | 登录用户同步他人的 Session | 返回拒绝，不泄漏或修改另一用户权益 | 待测 |
| ⬜ | 全额退款 Alerts 或 Radar | 对应 receipt 标记退款并立即撤销其贡献的权益 | 待测 |
| ⬜ | 退款 Radar upgrade | Radar 被撤销；未退款且未到期的基础 Alerts 自动恢复 | 待测 |
| ⬜ | 退款 upgrade 的基础 Alerts | 基础和依赖 upgrade 均不再赋权，不能留下孤立 Radar | 待测 |
| ⬜ | 部分退款 | 按明确的客服/退款政策处理；实现与文案一致，不能静默产生不确定权益 | 政策待最终确认 |
| ⬜ | `charge.dispute.created` | 立即撤销相关 receipt 的权益并记录争议状态 | 待测 |
| ⬜ | `charge.dispute.closed` 胜诉 | 仅恢复仍有效、归属正确的 receipt；不重复延长到期日 | 待测 |
| ⬜ | 失败/成功/退款事件乱序到达 | 最终状态由 receipt ledger 收敛，不被旧事件覆盖 | 待测 |
| ⏸️ | 多标签页并发支付 | 最终仅保留合法 receipt，重复购买被退款或拒绝 | 边界测试暂缓 |

## P1：支付失败与 3D Secure

| 状态 | 场景 | 预期结果 | 记录 |
| --- | --- | --- | --- |
| ⬜ | 通用失败卡 `4000 0000 0000 0002` | 支付失败，无权益、无 receipt，可安全重试 | 待测 |
| ⬜ | 资金不足卡 `4000 0000 0000 9995` | 显示可理解的 Stripe 失败状态，无权益 | 待测 |
| ⬜ | 3D Secure 卡 `4000 0025 0000 3155` 成功 | 认证完成后回站并正确赋权 | 待测 |
| ⬜ | 3D Secure 失败/取消 | 不赋权；已有 Alerts upgrade 场景下仍保留 Alerts | 待测 |
| ⏸️ | Stripe API 临时失败 | 前端显示重试状态；数据库没有半完成权益 | 边界测试暂缓 |

## P1：旧订阅迁移与配置清理

| 状态 | 场景 | 预期结果 | 记录 |
| --- | --- | --- | --- |
| ✅ | 现有 test-mode 周/月订阅 | 设置为周期末取消，确认不会再次自动扣费 | 三笔均已设置：两笔 2026-08-09、一笔 2026-08-08 到期 |
| ✅ | 旧四个 recurring Prices | 在 Stripe 中 archive，不能从新 UI/API 创建订阅 | 2026-07-17 已 archive |
| ✅ | GitHub/Azure 配置 | Runtime 只使用三项一次性 Price variables；旧 weekly/monthly/Portal 配置最终删除 | 2026-07-17：Azure 和 GitHub 均只保留三项新 Price variables；五项旧变量已在 sudo/2FA verification 后删除 |
| ⬜ | 旧用户权益迁移 | 只保留原已付周期内的 legacy 权益；旧 subscription webhook 不覆盖新 Pass receipt | 待测 |
| ✅ | 退役 API | `/api/auth/subscription/preview-payment`、`/api/auth/subscription/cancel`、`/api/billing/cancel-subscription` 均返回 404 | 2026-07-17 apex 生产 smoke 通过 |

## P2：发布前/生产 smoke

| 状态 | 场景 | 预期结果 | 记录 |
| --- | --- | --- | --- |
| ✅ | `/health` 和 `www` health | 返回 200，并保留 strict CSP | 2026-07-17 apex + www 生产 smoke 通过 |
| ✅ | 匿名 `/api/inventory` | 返回 401 `not_authenticated` | 2026-07-17 生产 smoke 通过 |
| ⬜ | 两种产品与 upgrade 的金额/文案 | 中文、荷兰语、英语、法语均显示 €5/€10/€5 和 90 天，不出现周/月/续费/取消订阅 | 待视觉复核 |
| ✅ | GitHub Actions + Azure 环境 | 三个 Price ID 与 Stripe test mode 一致；没有 secret 出现在日志或前端 bundle；清理旧 variables | 2026-07-17：Azure 和 GitHub 均只保留三个新 Price IDs，部署成功且旧五项已删除 |
| ✅ | 自动化测试 baseline | Web server 与 backend targeted suites 全部通过 | 2026-07-17：113/113 server tests、62/62 backend target tests |
| ⬜ | 生产 test-mode Alerts 购买 | 支付、回跳、Profile、Ready 和邮件投影均正确 | 待测 |
| ⬜ | 生产 test-mode Radar 购买 | 支付、回跳、Profile、Ready 和库存权限均正确 | 待测 |
| ⬜ | 生产 test-mode upgrade | €5、立即 Radar、原到期日不变 | 待测 |
| ✅ | 部署后自动验证 | `scripts/verify-deployment.mjs` 通过，包括 strict CSP、匿名 401 和三个旧接口 404 | Frontend workflow `29582313469`、backend `29567315723` 成功；revision `airco-tracking-web--0000057` Healthy/100% |

## 推荐执行顺序

1. 使用全新测试账户依次购买 Alerts、upgrade 到 Radar，再测试退款/争议回退。
2. 清空或到期该测试账户后，单独购买 Radar，验证 90 天权益和实时库存。
3. 执行 3D Secure、失败卡、到期边界、乱序 webhook 与并发场景。
4. 单独验证三笔 legacy subscription 到期时的 entitlement migration，确认不会被旧事件覆盖。
5. 完成 VAT/税务、撤回权、退款、条款/隐私和 checkout disclosure 后，才能评估切换 Stripe live mode。
