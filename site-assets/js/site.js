(function siteBootstrap() {
  const SUPPORTED_LANGS = ["en", "ar", "tr"];
  const LANG_KEY = "tapco_site_lang";

  function sanitizeValue(value, pattern, maxLen) {
    const raw = String(value || "");
    const cleaned = raw.match(pattern) ? raw : raw.replace(/[^a-zA-Z0-9_-]/g, "");
    return cleaned.slice(0, maxLen);
  }

  function getLangFromLocation() {
    try {
      const params = new URLSearchParams(window.location.search);
      const candidate = String(params.get("lang") || "").toLowerCase().trim();
      if (SUPPORTED_LANGS.includes(candidate)) return candidate;
    } catch (_err) {
      return "";
    }
    return "";
  }

  function getStoredLang() {
    try {
      const stored = String(localStorage.getItem(LANG_KEY) || "").toLowerCase().trim();
      if (SUPPORTED_LANGS.includes(stored)) return stored;
    } catch (_err) {
      return "";
    }
    return "";
  }

  function detectDefaultLang() {
    const fromUrl = getLangFromLocation();
    if (fromUrl) return fromUrl;

    const fromStore = getStoredLang();
    if (fromStore) return fromStore;

    const fromBrowser = String((navigator.language || "en")).toLowerCase();
    if (fromBrowser.startsWith("ar")) return "ar";
    if (fromBrowser.startsWith("tr")) return "tr";
    return "en";
  }

  function applyLang(lang) {
    const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : "en";
    document.documentElement.setAttribute("lang", safeLang);
    document.documentElement.setAttribute("dir", safeLang === "ar" ? "rtl" : "ltr");

    document.querySelectorAll(".lang-block").forEach((el) => {
      const isTarget = String(el.getAttribute("data-lang") || "") === safeLang;
      el.setAttribute("data-active", isTarget ? "true" : "false");
    });

    document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
      const isPressed = String(btn.getAttribute("data-lang-btn")) === safeLang;
      btn.setAttribute("aria-pressed", isPressed ? "true" : "false");
    });

    document.body.classList.remove("lang-ar", "lang-en", "lang-tr");
    document.body.classList.add("lang-" + safeLang);

    try {
      localStorage.setItem(LANG_KEY, safeLang);
    } catch (_err) {
      // ignore storage failures
    }
  }

  function wireLangButtons() {
    document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
      btn.addEventListener("click", function () {
        const target = String(btn.getAttribute("data-lang-btn") || "en");
        applyLang(target);
      });
    });
  }

  function wireMobileNav() {
    const navToggle = document.querySelector("[data-nav-toggle]");
    const navWrap = document.querySelector("[data-nav-wrap]");
    if (!navToggle || !navWrap) return;

    navToggle.addEventListener("click", function () {
      const isOpen = navWrap.getAttribute("data-open") === "true";
      navWrap.setAttribute("data-open", isOpen ? "false" : "true");
      navToggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });

    navWrap.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", function () {
        navWrap.setAttribute("data-open", "false");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function wireLaunchTools() {
    const botInput = document.getElementById("botInput");
    const refInput = document.getElementById("refInput");
    const openBtn = document.getElementById("openTelegramBtn");
    const copyBtn = document.getElementById("copyReferralBtn");
    const status = document.getElementById("launchStatus");
    if (!botInput || !openBtn || !copyBtn || !status) return;

    const BOT_KEY = "tapco_site_bot_username";
    const REF_KEY = "tapco_site_ref_code";

    const params = new URLSearchParams(window.location.search);
    const initialBot = sanitizeValue(params.get("bot") || localStorage.getItem(BOT_KEY) || "", /^[a-zA-Z0-9_]*$/, 64);
    const initialRef = sanitizeValue(params.get("ref") || localStorage.getItem(REF_KEY) || "", /^[a-zA-Z0-9_-]*$/, 64);

    botInput.value = initialBot;
    if (refInput) refInput.value = initialRef;

    function getValues() {
      const bot = sanitizeValue(botInput.value, /^[a-zA-Z0-9_]*$/, 64).replace(/^@+/, "");
      const ref = sanitizeValue(refInput ? refInput.value : "", /^[a-zA-Z0-9_-]*$/, 64);
      botInput.value = bot;
      if (refInput) refInput.value = ref;

      try {
        if (bot) localStorage.setItem(BOT_KEY, bot);
        if (ref) localStorage.setItem(REF_KEY, ref);
      } catch (_err) {
        // ignore storage failures
      }

      return { bot, ref };
    }

    function buildLaunchUrl() {
      const values = getValues();
      if (!values.bot) return "";
      const startParam = values.ref ? "ref_" + values.ref : "web";
      return "https://t.me/" + values.bot + "?startapp=" + encodeURIComponent(startParam);
    }

    function buildReferralUrl() {
      const values = getValues();
      const url = new URL(window.location.origin + window.location.pathname);
      if (values.bot) url.searchParams.set("bot", values.bot);
      if (values.ref) url.searchParams.set("ref", values.ref);
      return url.toString();
    }

    function refreshStatus() {
      const launchUrl = buildLaunchUrl();
      if (!launchUrl) {
        status.textContent = "Enter your Telegram bot username to enable launch.";
        return;
      }
      status.textContent = launchUrl;
    }

    botInput.addEventListener("input", refreshStatus);
    if (refInput) refInput.addEventListener("input", refreshStatus);

    openBtn.addEventListener("click", function () {
      const launchUrl = buildLaunchUrl();
      if (!launchUrl) {
        status.textContent = "Bot username is required.";
        return;
      }
      window.location.href = launchUrl;
    });

    copyBtn.addEventListener("click", async function () {
      const referralUrl = buildReferralUrl();
      try {
        await navigator.clipboard.writeText(referralUrl);
        copyBtn.textContent = "Copied";
      } catch (_err) {
        copyBtn.textContent = "Copy failed";
      }
      setTimeout(function () {
        copyBtn.textContent = "Copy Referral Link";
      }, 1300);
    });

    refreshStatus();
  }

  function setYear() {
    document.querySelectorAll("[data-year]").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });
  }

  function init() {
    applyLang(detectDefaultLang());
    wireLangButtons();
    wireMobileNav();
    wireLaunchTools();
    setYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
    return;
  }
  init();
})();
