(function () {
  "use strict";
  var copies = {
    en: {
      eyebrow: "Consumer withdrawal", title: "Withdraw and request a refund", lead: "Within 14 days of purchase, use this secure two-step form for a full refund. It also works when you are signed out.", policy: "Immediate service does not remove the 14-day full-refund promise in our voluntary policy.", consumerName: "Consumer name", email: "Account email (only needed when signed out)", order: "Order reference from your confirmation email", code: "Verification code (only needed when signed out)", electronicConfirmation: "I explicitly request an electronic confirmation of this withdrawal at my account email.", send: "Send code", review: "Review withdrawal", confirmTitle: "Confirm withdrawal", confirm: "Confirm and request full refund", modelTitle: "EU model withdrawal form", model: "You can alternatively send an unambiguous statement or the model form in our Terms by email. The online form is optional and does not replace your right to use the model form.", terms: "Terms and model form", home: "Back home", sent: "Code sent. Check your inbox.", reviewText: "Consumer {name}. Order {order}, {amount}. Purchased {date}. Withdrawal deadline {deadline}. Electronic confirmation will be sent to {email}.", done: "Request {reference} received. Access is revoked and Stripe refund status is {status}. A confirmation email has been sent.", error: "The request could not be completed. Check the name, electronic-confirmation choice, code/order and eligibility, then try again."
    },
    nl: {
      eyebrow: "Herroepingsrecht", title: "Herroepen en terugbetaling vragen", lead: "Gebruik dit beveiligde tweestapsformulier binnen 14 dagen voor volledige terugbetaling, ook als je bent uitgelogd.", policy: "Directe uitvoering verwijdert onze vrijwillige belofte van 14 dagen volledige terugbetaling niet.", consumerName: "Naam van de consument", email: "E-mail van account (alleen uitgelogd)", order: "Bestelreferentie uit bevestigingsmail", code: "Verificatiecode (alleen uitgelogd)", electronicConfirmation: "Ik verzoek uitdrukkelijk om een elektronische bevestiging van deze herroeping op het e-mailadres van mijn account.", send: "Code sturen", review: "Herroeping controleren", confirmTitle: "Herroeping bevestigen", confirm: "Bevestigen en volledige terugbetaling vragen", modelTitle: "Europees modelformulier", model: "Je kunt ook een ondubbelzinnige verklaring of het modelformulier uit de voorwaarden mailen. Het online formulier is optioneel.", terms: "Voorwaarden en modelformulier", home: "Terug naar home", sent: "Code verstuurd. Controleer je inbox.", reviewText: "Consument {name}. Order {order}, {amount}. Gekocht {date}. Deadline {deadline}. De elektronische bevestiging gaat naar {email}.", done: "Verzoek {reference} ontvangen. Toegang is ingetrokken; Stripe-status: {status}. Bevestiging is gemaild.", error: "Verzoek mislukt. Controleer naam, keuze voor elektronische bevestiging, code, order en termijn."
    },
    fr: {
      eyebrow: "Droit de rétractation", title: "Se rétracter et demander un remboursement", lead: "Dans les 14 jours, utilisez ce formulaire sécurisé en deux étapes pour un remboursement intégral, même déconnecté.", policy: "Le début immédiat ne supprime pas notre promesse volontaire de remboursement intégral pendant 14 jours.", consumerName: "Nom du consommateur", email: "E-mail du compte (si déconnecté)", order: "Référence de la confirmation", code: "Code de vérification (si déconnecté)", electronicConfirmation: "Je demande expressément à recevoir une confirmation électronique de cette rétractation à l’adresse e-mail de mon compte.", send: "Envoyer le code", review: "Vérifier la rétractation", confirmTitle: "Confirmer la rétractation", confirm: "Confirmer et demander le remboursement intégral", modelTitle: "Formulaire type européen", model: "Vous pouvez aussi envoyer une déclaration claire ou le formulaire type des Conditions par e-mail. Le formulaire en ligne est facultatif.", terms: "Conditions et formulaire type", home: "Retour à l’accueil", sent: "Code envoyé. Consultez votre boîte.", reviewText: "Consommateur {name}. Commande {order}, {amount}. Achetée le {date}. Échéance {deadline}. La confirmation électronique sera envoyée à {email}.", done: "Demande {reference} reçue. Accès retiré ; statut Stripe : {status}. Confirmation envoyée.", error: "Impossible de traiter la demande. Vérifiez le nom, le choix de confirmation électronique, le code, la commande et le délai."
    },
    zh: {
      eyebrow: "消费者撤回", title: "撤回购买并申请退款", lead: "购买后 14 天内可通过这个安全的两步表格申请全额退款，退出登录后也能使用。", policy: "立即开始服务不会取消我们自愿提供的 14 天全额退款承诺。", consumerName: "消费者姓名", email: "账户邮箱（仅退出登录时需要）", order: "购买确认邮件中的订单编号", code: "验证码（仅退出登录时需要）", electronicConfirmation: "我明确要求将本次撤回的电子确认发送至我的账户邮箱。", send: "发送验证码", review: "检查撤回申请", confirmTitle: "确认撤回", confirm: "确认并申请全额退款", modelTitle: "欧盟示范撤回表格", model: "你也可以通过邮件发送明确声明或条款中的示范表格。在线表格是可选渠道，不取代使用示范表格的权利。", terms: "条款和示范表格", home: "返回首页", sent: "验证码已发送，请检查邮箱。", reviewText: "消费者 {name}；订单 {order}，{amount}；购买于 {date}；撤回期限 {deadline}。电子确认将发送至 {email}。", done: "已收到申请 {reference}。权益已撤销，Stripe 退款状态：{status}。确认邮件已发送。", error: "暂时无法完成。请检查姓名、电子确认选择、验证码、订单和期限后重试。"
    }
  };
  var dateLocales = { en: "en-GB", nl: "nl-NL", fr: "fr-FR", zh: "zh-CN" };
  var refundStatuses = {
    en: { succeeded: "completed", pending: "pending", failed: "failed", canceled: "cancelled", requires_action: "action required", unknown: "unavailable" },
    nl: { succeeded: "voltooid", pending: "in behandeling", failed: "mislukt", canceled: "geannuleerd", requires_action: "actie vereist", unknown: "niet beschikbaar" },
    fr: { succeeded: "effectué", pending: "en attente", failed: "échec", canceled: "annulé", requires_action: "action requise", unknown: "indisponible" },
    zh: { succeeded: "已完成", pending: "处理中", failed: "失败", canceled: "已取消", requires_action: "需要操作", unknown: "暂不可用" }
  };
  var params = new URLSearchParams(location.search);
  var lang = copies[params.get("lang")] ? params.get("lang") : "en";
  var copy = copies[lang];
  var token = "";
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  window.AIRCO_LEGAL_SEO.apply({ pathname: location.pathname, lang: lang, title: copy.title + " · Airco Tracker", description: copy.lead, indexable: false });
  document.querySelectorAll("[data-copy]").forEach(function (node) { node.textContent = copy[node.dataset.copy]; });
  document.querySelectorAll("[data-lang]").forEach(function (anchor) { anchor.href = "/withdrawal.html?lang=" + anchor.dataset.lang; if (anchor.dataset.lang === lang) anchor.setAttribute("aria-current", "page"); });
  var brand = document.querySelector(".legal-brand");
  if (brand) brand.href = "/?lang=" + lang;
  document.getElementById("withdrawal-terms").href = "/terms.html?lang=" + lang;
  document.getElementById("withdrawal-home").href = "/?lang=" + lang;
  var consumerName = document.getElementById("withdrawal-name");
  var electronicConfirmation = document.getElementById("withdrawal-electronic-confirmation");
  var email = document.getElementById("withdrawal-email");
  var order = document.getElementById("withdrawal-order");
  var code = document.getElementById("withdrawal-code");
  var message = document.getElementById("withdrawal-message");
  var summary = document.getElementById("withdrawal-summary");
  var summaryText = document.getElementById("withdrawal-summary-text");
  function post(url, body) { return fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (response) { return response.json().catch(function () { return {}; }).then(function (data) { if (!response.ok) throw new Error(data.error || "request"); return data; }); }); }
  function formatDate(value) {
    return new Intl.DateTimeFormat(dateLocales[lang], { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
  }
  function localizedRefundStatus(status) { return refundStatuses[lang][status] || refundStatuses[lang].unknown; }
  function show(text, error) { message.textContent = text; message.className = "withdrawal-message" + (error ? " withdrawal-message--error" : ""); message.setAttribute("role", error ? "alert" : "status"); if (!error) message.setAttribute("aria-live", "polite"); }
  document.getElementById("withdrawal-code-button").addEventListener("click", function () { show(""); post("/api/billing/withdrawal/request-code", { email: email.value, lang: lang }).then(function (result) { show(copy.sent + (result.devCode ? " " + result.devCode : "")); }).catch(function () { show(copy.error, true); }); });
  document.getElementById("withdrawal-form").addEventListener("submit", function (event) {
    event.preventDefault();
    show("");
    summary.hidden = true;
    post("/api/billing/withdrawal/preview", { email: email.value, code: code.value, orderReference: order.value, consumerName: consumerName.value, electronicConfirmationAccepted: electronicConfirmation.checked }).then(function (result) {
      token = result.token;
      summaryText.textContent = copy.reviewText.replace("{name}", consumerName.value.trim()).replace("{order}", result.orderReference).replace("{amount}", new Intl.NumberFormat(dateLocales[lang], { style: "currency", currency: "EUR" }).format(result.amountEurCents / 100)).replace("{date}", formatDate(result.purchasedAt)).replace("{deadline}", formatDate(result.withdrawalDeadline)).replace("{email}", result.confirmationEmail);
      summary.hidden = false;
    }).catch(function () { show(copy.error, true); });
  });
  document.getElementById("withdrawal-confirm-button").addEventListener("click", function () { if (!token) return; this.disabled = true; post("/api/billing/withdrawal/confirm", { token: token }).then(function (result) { summary.hidden = true; show(copy.done.replace("{reference}", result.withdrawalReference).replace("{status}", localizedRefundStatus(result.refundStatus))); }).catch(function () { show(copy.error, true); }).finally(function () { document.getElementById("withdrawal-confirm-button").disabled = false; }); });
}());
