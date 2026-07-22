(function () {
  "use strict";
  var supported = ["en", "nl", "fr", "zh"];
  var params = new URLSearchParams(window.location.search);
  var requested = params.get("lang") || "en";
  var lang = supported.indexOf(requested) >= 0 ? requested : "en";
  var page = document.body.dataset.legalPage;
  var content = window.AIRCO_LEGAL_CONTENT || {};
  var localized = content[lang] || content.en;
  var fallback = content.en;

  function setText(selector, value) {
    var node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function replace(template, config) {
    var values = {
      operatorName: config.operatorName || localized.common.operatorNotConfigured,
      operatorAddress: config.operatorAddress || localized.common.addressNotConfigured,
      publicationDirector: config.publicationDirector || localized.common.publicationDirectorNotConfigured,
      hostName: config.hostName || localized.common.hostNotConfigured,
      hostAddress: config.hostAddress || localized.common.hostAddressNotConfigured,
      hostPhone: config.hostPhone || localized.common.hostPhoneNotConfigured,
      contactEmail: config.contactEmail || localized.common.contactNotConfigured,
      contactPhone: config.contactPhone || localized.common.phoneNotConfigured,
      privacyEmail: config.privacyEmail || localized.common.privacyContactNotConfigured,
      withdrawalEmail: config.withdrawalEmail || localized.common.withdrawalContactNotConfigured,
      franceMediator: franceMediator(config, localized.common),
      registration: registration(config, localized.common),
      vat: vat(config, localized.common),
      legalRecordRetentionPeriod: retentionPeriod(config, localized.common),
    };
    return String(template).replace(/\{\{(\w+)\}\}/g, function (_match, key) { return values[key] || ""; });
  }

  function registration(config, common) {
    if (config.businessRegistrationStatus === "registered") {
      return config.businessRegistrationNumber || common.registrationRegistered + " (" + common.registrationNumberNotPublished + ")";
    }
    if (config.businessRegistrationStatus === "exempt_confirmed") return common.registrationExempt;
    if (config.businessRegistrationStatus === "not_registered") return common.registrationBlocked;
    return common.statusNotConfigured;
  }

  function vat(config, common) {
    if (config.vatStatus === "registered") return config.vatId || common.vatRegistered + " (" + common.vatIdNotPublished + ")";
    if (config.vatStatus === "not_registered") return common.vatNotRegistered;
    return common.statusNotConfigured;
  }

  function franceMediator(config, common) {
    if (!config.franceMediatorName || !config.franceMediatorAddress || !config.franceMediatorUrl) {
      return common.mediatorNotConfigured;
    }
    return [config.franceMediatorName, config.franceMediatorAddress, config.franceMediatorUrl].join(", ");
  }

  function retentionPeriod(config, common) {
    if (config.legalRecordRetentionBasisConfirmed && (config.legalRecordRetentionYears === 7 || config.legalRecordRetentionYears === 10)) {
      return String(config.legalRecordRetentionYears) + " " + common.years;
    }
    return common.retentionNotConfigured;
  }

  function render(config) {
    var pageContent = (localized.pages && localized.pages[page]) || fallback.pages[page];
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
    var pageTitle = pageContent.title + " · Airco Tracker";
    var pageDescription = replace(pageContent.lead, config);
    window.AIRCO_LEGAL_SEO.apply({
      pathname: window.location.pathname,
      lang: lang,
      title: pageTitle,
      description: pageDescription,
      indexable: true,
    });
    setText("[data-brand]", localized.common.brand);
    setText("[data-back]", localized.common.back);
    setText("[data-withdraw]", localized.common.withdraw);
    setText("[data-eyebrow]", pageContent.eyebrow);
    setText("[data-title]", pageContent.title);
    setText("[data-lead]", pageDescription);
    setText("[data-version]", localized.common.effective + ": " + (page === "privacy" ? config.privacyVersion : config.termsVersion));
    var warning = document.querySelector("[data-warning]");
    if (warning) {
      warning.hidden = config.readyForLivePayments;
      warning.textContent = localized.common.incomplete;
    }
    var sections = document.querySelector("[data-sections]");
    if (sections) {
      sections.replaceChildren();
      pageContent.sections.forEach(function (entry) {
        var section = document.createElement("section");
        section.className = "legal-section";
        var heading = document.createElement("h2");
        heading.textContent = entry[0];
        var body = document.createElement("p");
        body.textContent = replace(entry[1], config);
        section.append(heading, body);
        sections.append(section);
      });
    }
    document.querySelectorAll("[data-lang]").forEach(function (link) {
      var nextLang = link.getAttribute("data-lang");
      link.href = window.location.pathname + "?lang=" + encodeURIComponent(nextLang);
      if (nextLang === lang) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    var brand = document.querySelector(".legal-brand");
    if (brand) brand.href = "/?lang=" + encodeURIComponent(lang);
    var back = document.querySelector("[data-back]");
    if (back) back.href = "/?lang=" + encodeURIComponent(lang);
    var withdraw = document.querySelector("[data-withdraw]");
    if (withdraw) withdraw.href = "/withdrawal.html?lang=" + encodeURIComponent(lang);
  }

  fetch("/api/legal/config", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(function (response) { return response.ok ? response.json() : Promise.reject(new Error("config")); })
    .then(render)
    .catch(function () {
      render({ readyForLivePayments: false, termsVersion: "2026-07-22", privacyVersion: "2026-07-22" });
    });
}());
