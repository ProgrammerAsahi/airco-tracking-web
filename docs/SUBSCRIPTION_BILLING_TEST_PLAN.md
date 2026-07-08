# 订阅与 Stripe 支付测试场景

<p align="center">
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.md"><img alt="简体中文" src="https://img.shields.io/badge/docs-简体中文-d73a49"></a>
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.en.md"><img alt="English" src="https://img.shields.io/badge/docs-English-0969da"></a>
</p>

最后更新：2026-07-08

## 维护规则

本文档用于追踪门户、登录、订阅、Stripe 支付和库存访问权限的端到端测试。以后每次新增测试场景、更新状态或记录结果时，都必须同时更新中文和英语两个版本：

- `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md`
- `docs/SUBSCRIPTION_BILLING_TEST_PLAN.en.md`

状态标记：

- ✅ 已完成并验证
- ⬜ 待测试
- 🚧 需要先实现或确认功能后再测试

## 当前测试环境

- 生产站点：[https://airco-tracker.eu](https://airco-tracker.eu)
- Stripe 模式：Sandbox / test mode
- Stripe webhook：`https://airco-tracker.eu/api/billing/webhook`
- 订阅方案：

| 内部方案 | 展示名 | 价格 | Stripe Price ID |
| --- | --- | --- | --- |
| `weekly_basic` | 周订阅 · 库存提醒 | €10 / 周 | `price_1Tqti10XRx7WeBOsbaTiCY5v` |
| `weekly_priority` | 周订阅 · 实时雷达 | €20 / 周 | `price_1TqtlM0XRx7WeBOsaBF2uQSo` |
| `monthly_basic` | 月订阅 · 库存提醒 | €15 / 月 | `price_1Tqtj20XRx7WeBOsdnuL3Hwb` |
| `monthly_priority` | 月订阅 · 实时雷达 | €30 / 月 | `price_1Tqtm80XRx7WeBOsvTwtW4nM` |

## P0：购买、回跳与权益

| 状态 | 场景 | 预期结果 | 备注 |
| --- | --- | --- | --- |
| ⬜ | 未登录用户在 `/subscribe` 点“选择方案” | 先弹出登录卡片；登录成功后继续进入所选方案的支付流程 | 不再显示“登录后即可选择订阅方案 / 回到首页登录”的提示条 |
| ⬜ | 已登录用户在 `/subscribe` 点“选择方案” | 直接进入 Stripe Checkout 或支付卡片，不重复要求登录 | 需要分别测四个方案 |
| ✅ | 使用测试卡购买 `monthly_priority` | Stripe Checkout 成功，返回站点后用户获得 `monthly_priority` 权益 | 2026-07-08 已用测试卡完成；刷新后订阅状态正确出现 |
| ⬜ | 使用测试卡购买 `weekly_priority` | 用户获得实时库存访问权限，权益周期为一周 | 待测 |
| ⬜ | 使用测试卡购买 `weekly_basic` | 用户只获得库存上线邮件提醒，不可进入实时库存页 | 待测 |
| ⬜ | 使用测试卡购买 `monthly_basic` | 用户只获得库存上线邮件提醒，不可进入实时库存页 | 待测 |
| ⬜ | Checkout 过程中点取消或返回 | 返回订阅页；数据库仍显示无有效订阅；不会误开通权益 | 待测 |
| ⬜ | 支付成功后不刷新，直接等待回跳同步 | 页面应自动同步 Stripe checkout session 并展示正确权益 | 修复已部署，需要新支付再验证一次 |
| ✅ | 支付成功后刷新页面 | 订阅状态仍正确显示 | 2026-07-08 已验证 |
| ⬜ | 已有有效订阅时再次选择同级方案 | 不应创建重复有效订阅；应提示已有订阅或进入更改方案流程 | 待测 |

## P0：取消、续期与方案变更

| 状态 | 场景 | 预期结果 | 备注 |
| --- | --- | --- | --- |
| ✅ | 用户取消当前订阅 | Stripe 设置为周期末取消；权益保留到本周期结束 | 2026-07-08 生产验证：用户表显示 `subscriptionCancelAtPeriodEnd=true`，`monthly_priority` 有效至 2026-08-08T13:31:16Z |
| ✅ | 取消后查看 Profile | Profile 显示取消状态和权益有效期；支付方式仍可见 | 2026-07-08 生产验证：Profile 阻止有效期内注销；用户表保留 VISA 尾号 4242 和周期结束时间 |
| ✅ | 取消后继续访问权益页 | 周期结束前仍可使用已购买权益 | 2026-07-08 生产验证：Ready 页仍显示库存入口，`/deliver-to/fr` 实时库存页可访问 |
| ⬜ | 周期结束后访问权益页 | 订阅失效；实时库存入口被关闭；用户可重新订阅 | 待测，可配合 Stripe Test Clock |
| ✅ | 从库存提醒升级到实时雷达 | 升级后应立刻生效 | 2026-07-08 生产验证：`weekly_basic` → `monthly_priority` 更新现有 Stripe subscription，用户表同步为 `monthly_priority active`，未创建重复订阅 |
| ⬜ | 从实时雷达降级到库存提醒 | 当前周期结束后再降级，当前权益保留到期 | 2026-07-08 已实现 Stripe subscription schedule 周期末降级流程；待生产复测 |
| 🚧 | 周付与月付之间切换 | 按产品规则处理立即生效或周期末变更，且不生成重复订阅 | 需要先明确产品策略 |

## P0：库存访问权限与国家/语言

| 状态 | 场景 | 预期结果 | 备注 |
| --- | --- | --- | --- |
| ✅ | 未登录用户访问 `/deliver-to/nl` 或 `/deliver-to/fr` | 不展示库存数据；引导登录/订阅 | 2026-07-08 生产验证：登出后直接访问库存页会跳转到订阅页 |
| ✅ | 无订阅用户访问 `/deliver-to/nl` 或 `/deliver-to/fr` | 不展示库存数据；引导订阅 | 2026-07-08 生产验证：重新注册但未订阅后，直接访问库存页会跳转到订阅页 |
| ✅ | `basic` 用户访问实时库存页 | 不展示库存数据；提示当前方案仅包含邮件提醒 | 2026-07-08 生产验证：订阅 basic 后直接访问库存页会被拦截，无法查看实时库存 |
| ✅ | `priority` 用户访问实时库存页 | 根据用户国家字段进入 `/deliver-to/nl` 或 `/deliver-to/fr` 并展示可配送站点 | 2026-07-08 生产验证：切换到 priority 后可访问实时库存页并看到可配送站点 |
| ⬜ | Ready 页面切换语言 | 中、英、荷三种语言即时切换，且不改变配送国家 | 待测 |
| ⬜ | `/deliver-to/*` 页面切换语言 | 中、英、荷三种语言即时切换，且不改变配送国家 | 用户已发现过问题，修复后需要回归 |
| ⬜ | Profile 切换国家 | 二次确认后更新用户国家；后续库存入口跳转到对应国家 | 待测 |

## P0：Stripe webhook 与同步安全

| 状态 | 场景 | 预期结果 | 备注 |
| --- | --- | --- | --- |
| ✅ | 无 Stripe 签名调用 webhook | 返回 400，不处理任何状态变更 | 2026-07-08 生产已验证 |
| ⬜ | `checkout.session.completed` webhook | 正确绑定当前用户、Stripe customer 和 subscription | 需要新 checkout 再验证 |
| ⬜ | `customer.subscription.updated` webhook | 正确更新方案、状态、取消标记、有效期和支付方式摘要 | 待测 |
| ⬜ | `customer.subscription.deleted` webhook | 正确关闭权益并保留必要的历史信息 | 待测 |
| ⬜ | webhook 延迟或丢失时用户回跳同步 | `/api/billing/sync-checkout-status` 能从 Stripe 拉取状态并补齐数据库 | 修复已部署，需要新 checkout 再验证 |
| 🚧 | 重复 webhook 事件 | 重复事件不会重复写入危险状态或创建重复订阅 | 需要确认是否需要事件去重表 |
| ⬜ | 登录用户尝试同步不属于自己的 checkout session | 后端拒绝，不泄露其他用户订阅 | 待测 |
| ✅ | 未登录用户调用 checkout 同步 API | 返回 401 | 2026-07-08 生产已验证 |

## P1：用户资料、邮箱与账户生命周期

| 状态 | 场景 | 预期结果 | 备注 |
| --- | --- | --- | --- |
| ⬜ | 新用户邮箱验证码注册 | 验证码正确才创建/登录用户；首次登录弹出昵称卡片 | 待测 |
| ⬜ | 发送验证码按钮倒计时 | 点击后 60 秒内不可重复发送；倒计时结束后可重新发送 | 注册和更改邮箱都要测 |
| ⬜ | 修改昵称 | 弹出“我们该如何称呼您呢？”卡片；保存后 avatar 首字母更新 | 待测 |
| ⬜ | 修改邮箱 | 新邮箱验证码通过后，用户 ID 保持稳定，邮箱字段更新 | 待测 |
| ⬜ | 有有效订阅时注销账户 | 后端拒绝注销，提示需取消并等权益到期 | 待测 |
| ⬜ | 无订阅或订阅到期后注销账户 | 用户资料和会话被清理；无法再访问付费权益 | 待测 |
| ⬜ | 登出后重新登录 | 订阅、国家、语言、昵称和支付方式摘要仍正确 | 待测 |

## P1：支付异常与边界情况

| 状态 | 场景 | 预期结果 | 备注 |
| --- | --- | --- | --- |
| ⬜ | Stripe 测试卡支付失败 | 用户仍无订阅；页面显示可理解的失败/重试状态 | 待测 |
| ⬜ | 需要 3D Secure 的测试卡 | 认证成功后开通；认证失败后不开通 | 待测 |
| ⬜ | Checkout 会话过期 | 用户返回后看到可重新选择方案的状态 | 待测 |
| ⬜ | Stripe API 临时失败 | 前端显示重试或错误提示；数据库不写入半开通状态 | 待测 |
| ⬜ | 用户在多个标签页同时发起支付 | 最终只保留一个有效订阅状态，不互相覆盖 | 待测 |

## P2：生产发布回归

| 状态 | 场景 | 预期结果 | 备注 |
| --- | --- | --- | --- |
| ✅ | `/health` | 返回 200 | 2026-07-08 生产已验证 |
| ✅ | `/ready?lang=zh` | 返回 200 | 2026-07-08 生产已验证 |
| ✅ | 最新前端 bundle 被生产站点加载 | 浏览器加载新构建产物 | 2026-07-08 已观察到新 bundle |
| ⬜ | `/subscribe?lang=zh/en/nl` | 三种语言页面可加载，按钮行为一致 | 待测 |
| ⬜ | `/profile?lang=zh/en/nl` | 三种语言页面可加载，资料和订阅卡片一致 | 待测 |
| ⬜ | `/deliver-to/nl?lang=zh/en/nl` | 三种语言库存页可加载，语言切换可用 | 待测 |
| ⬜ | `/deliver-to/fr?lang=zh/en/nl` | 三种语言库存页可加载，语言切换可用 | 待测 |

## 建议测试顺序

1. 先测试当前 `monthly_priority` 的取消订阅流程。
2. 再用新用户跑一次完整购买，验证“支付成功后不刷新也能自动同步”。
3. 分别购买 `weekly_basic`、`monthly_basic` 和 `weekly_priority`，确认权益差异。
4. 用 Stripe Test Clock 验证周期结束、取消后到期和续期。
5. 在方案变更功能实现/确认后，再测升级、降级和周付/月付切换。
