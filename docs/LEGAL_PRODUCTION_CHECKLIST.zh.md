# Airco Tracker 法律生产上线清单

<p align="center">
  <a href="./LEGAL_PRODUCTION_CHECKLIST.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/LEGAL-简体中文-d73a49"></a>
  <a href="./LEGAL_PRODUCTION_CHECKLIST.md"><img alt="English" src="https://img.shields.io/badge/LEGAL-English-0969da"></a>
</p>

最后更新：2026-07-22。修改时必须同步更新中英文版本。

这是工程发布清单，不是法律或税务意见。即使软件检查全部通过，也不能据此直接开启 Stripe 正式收款；上线前应由熟悉荷兰/EU 消费者法的律师以及税务顾问或会计师，基于实际经营者情况确认事实和文案。

## 强制上线闸门

以下每一项都必须有真实证据、且生产配置经过复核，正式结账才能开启。不得填写占位符、猜测的注册状态、未经经营者同意公开的私人住址，也不得填写尚未接受本经营者的调解机构。

- [ ] 确认签约经营者完整法定/商号名称，以及适合公开和送达的地址（`LEGAL_OPERATOR_NAME`、`LEGAL_OPERATOR_ADDRESS`）。
- [ ] 确认出版负责人的真实姓名，并取得明确的公开授权（`LEGAL_PUBLICATION_DIRECTOR`）。不得自行假定签约经营者与出版负责人依法必然相同。
- [ ] 从托管服务商最新法律文件或书面确认中取得其准确法定名称、邮寄地址和电话（`LEGAL_HOST_NAME`、`LEGAL_HOST_ADDRESS`、`LEGAL_HOST_PHONE`）。不得根据 Azure 资源名或区域自行推断。
- [ ] 确认公开客服邮箱、隐私邮箱、撤回/退款邮箱和电话或同等直接联系渠道（`LEGAL_CONTACT_EMAIL`、`LEGAL_PRIVACY_EMAIL`、`LEGAL_WITHDRAWAL_EMAIL`、`LEGAL_CONTACT_PHONE`）。
- [ ] 由荷兰律师确认该业务是否必须注册；填写真实 KVK 号码，或填写获得明确法律确认的豁免（`LEGAL_BUSINESS_REGISTRATION_STATUS`、`LEGAL_KVK_NUMBER`、`LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION`）。单纯 `not_registered` 按设计不能开启正式付款。
- [ ] 获取关于荷兰 VAT、适用时的 KOR、欧盟跨境数字服务/远程销售合计 10,000 欧元门槛及 OSS 的书面税务意见；填写真实 VAT 状态和适用的 VAT ID（`LEGAL_VAT_STATUS`、`LEGAL_VAT_ID`），并确认网页、收据和 Stripe Tax 配置与意见一致。
- [ ] 签约或取得 CECMC 体系内法国消费者调解机构对本经营者的接受，再公开其准确名称、邮寄地址和网站（`LEGAL_FR_MEDIATOR_NAME`、`LEGAL_FR_MEDIATOR_ADDRESS`、`LEGAL_FR_MEDIATOR_URL`）。仅在名录中找到一个机构不等于已经签约。
- [ ] 由律师/会计确认最小化去标识订单证据账本究竟保存 7 年还是 10 年，以及期限从哪个法律事件起算（`LEGAL_RECORD_RETENTION_YEARS`、`LEGAL_RECORD_RETENTION_BASIS_CONFIRMED`）。
- [ ] 复核服务条款、隐私政策、经营者声明、联盟披露、结账确认、购买确认、撤回表单和退款确认的中/英/荷/法四个版本；差异解决后才能设置 `LEGAL_PRODUCTION_READY=true`。

只要必填信息或确认缺失，应用对 live 或无法识别格式的 Stripe 密钥都会按设计拒绝结账。

## 隐私与处理者证据

- [ ] 保存 Microsoft Azure/ACS、Stripe 的有效 DPA 和跨境传输资料，记录生产区域及适用的标准合同条款或充分性依据。
- [ ] 维护类似 GDPR 第 30 条的处理活动记录，覆盖账户/登录、支付、提醒投递、服务商投递报告、安全日志、联盟跳转、保存、删除和数据主体请求。
- [ ] 为防滥用、可靠性遥测、退信抑制和法律请求证据完成并保存合法利益评估。
- [ ] 与律师判断是否需要 DPIA；即使结论为“不需要”，也要记录理由和复核日期。
- [ ] 核对生产日志保存期、Event Grid dead-letter 生命周期、Service Bus TTL/DLQ、Stripe 保存期与公开隐私政策完全一致。
- [ ] 测试访问、更正、可携带、反对、删除、退订、换邮箱和身份核验流程；为隐私请求和事件响应明确负责人及期限。
- [ ] 增加分析、广告、CMP、社交嵌入或新的联盟归因前，重新执行 Cookie/本地存储审计。当前政策假定 Airco Tracker 仅使用严格必要的会话和本地偏好。

## 消费者与支付运营

- [ ] 核对 UI、Stripe、收据和法律文本中的产品名、一次性价格、90 天期限、不自动续费、VAT 处理、近实时限制（通常约 10 分钟）及排序披露完全一致。
- [ ] 在 Stripe 测试模式覆盖成功、拒付、3-D Secure、放弃、重复、争议、退款、撤回、邮件故障和 webhook 重放，并保存对应发布版本的不可变测试证据。
- [ ] 核实消费者需单独请求立即履行，并主动确认电子提交；两个复选框都不得预选。
- [ ] 核实所有登录/付费页面都有显著在线撤回/退款入口，且欧盟示范表格在禁用 JavaScript 时仍可读取。
- [ ] 文档化客服/投诉升级、退款时限、Stripe 对账、ACS 退信/抑制、事件回滚的负责人和流程。
- [ ] 商业上线前提供无障碍问题联系/修复流程，并按服务适用范围完成最终 WCAG/EAA 审阅。

## 发布证据

记录下列内容，但不要保存秘密或不必要的个人数据：

- 法律/税务审阅者姓名或机构、审阅范围、决定日期和下次复核日期；
- 调解机构接受/合同编号及已公开的联系信息；
- 获批公开的经营者事实和配置校验摘要；
- 出版负责人公开授权，以及用于核验托管服务商名称、地址和电话的注明日期的资料来源；
- 本次发布接受的 Terms/Privacy 版本；
- Stripe 模式、产品/价格配置核验、webhook 事件清单和测试证据；
- 前后端部署 commit、workflow/deployment 标识、生产 smoke 结果和回滚点。

## 审阅时应重新核对的官方资料

- 荷兰远程/网络销售：<https://business.gov.nl/regulations/long-distance-sales-and-purchases/>
- 荷兰商业通信披露：<https://business.gov.nl/regulations/rules-business-correspondence/>
- 荷兰税务局跨境数字服务/VAT：<https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/btw-diensten-particulieren>
- 荷兰税务局欧盟 VAT/OSS：<https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/goederen_en_diensten_naar_andere_eu_landen/btw_berekenen_bij_diensten/wijziging_in_digitale_diensten_vanaf_2015/eu_btw_melding_doen/>
- 法国 DGCCRF 消费者调解：<https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/la-mediation-de-la-consommation-ce-que-vous-devez-savoir>
- 法国网站法定声明必填信息：<https://www.economie.gouv.fr/entreprises/developper-son-entreprise/innover-et-numeriser-son-entreprise/mentions-sur-votre-site-internet-les-obligations-respecter>
- 欧盟 ODR 平台废止条例（不要恢复失效 ODR 链接）：<https://eur-lex.europa.eu/eli/reg/2024/3228/oj>
