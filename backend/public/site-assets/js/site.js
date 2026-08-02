(function siteBootstrap() {
  const SUPPORTED_LANGS = ["en", "ar", "tr"];
  const LANG_KEY = "tapco_site_lang";

  const UI = {
    en: {
      nav_home: "Home",
      nav_game_info: "Game Info",
      nav_referrals: "Referrals",
      nav_faq: "FAQ",
      nav_about: "About",
      nav_support: "Support",
      nav_contact: "Contact",
      nav_updates: "Updates",
      nav_rewards: "Rewards",
      nav_articles: "Articles",
      nav_privacy: "Privacy",
      nav_terms: "Terms",
      nav_ad_policy: "Ad Policy",
      menu_button: "Menu",
      footer_rights: "All rights reserved.",
      launch_bot_placeholder: "Telegram bot username (without @)",
      launch_ref_placeholder: "Referral code (optional)",
      launch_open_btn: "Open in Telegram",
      launch_copy_btn: "Copy Referral Link",
      launch_status_missing_bot: "Enter your Telegram bot username to enable launch.",
      launch_copy_ok: "Copied",
      launch_copy_fail: "Copy failed",
      launch_status_required: "Bot username is required.",
      contact_subject_label: "Subject",
      contact_telegram_label: "Telegram Username (optional)",
      contact_message_label: "Message",
      contact_subject_ph: "Short summary of your issue",
      contact_telegram_ph: "Example: @username",
      contact_message_ph: "Describe your issue with useful details",
      contact_compose_btn: "Compose Email",
      contact_open_btn: "Open support@tapcogame.io",
      contact_status_default: "All fields are sanitized in browser before email draft generation.",
      contact_status_required: "Subject and message are required.",
      contact_status_opened: "Email draft opened in your mail client.",
      cookie_title: "Cookie Notice",
      cookie_body: "TAPCO Hub uses essential browser storage for language, referral, and site-preference continuity. Optional analytics or advertising tools may use additional cookies when enabled.",
      cookie_accept: "Accept All",
      cookie_essential: "Essential Only",
      cookie_link: "Read Privacy Policy"
    },
    ar: {
      nav_home: "الرئيسية",
      nav_game_info: "معلومات اللعبة",
      nav_referrals: "الإحالات",
      nav_faq: "الأسئلة الشائعة",
      nav_about: "من نحن",
      nav_support: "الدعم",
      nav_contact: "اتصل بنا",
      nav_updates: "التحديثات",
      nav_rewards: "المكافآت",
      nav_articles: "المقالات",
      nav_privacy: "الخصوصية",
      nav_terms: "الشروط",
      nav_ad_policy: "سياسة الإعلانات",
      menu_button: "القائمة",
      footer_rights: "جميع الحقوق محفوظة.",
      launch_bot_placeholder: "اسم بوت تيليغرام (بدون @)",
      launch_ref_placeholder: "كود الإحالة (اختياري)",
      launch_open_btn: "فتح اللعبة في تيليغرام",
      launch_copy_btn: "نسخ رابط الإحالة",
      launch_status_missing_bot: "أدخل اسم بوت تيليغرام لتفعيل الإطلاق.",
      launch_copy_ok: "تم النسخ",
      launch_copy_fail: "تعذر النسخ",
      launch_status_required: "اسم البوت مطلوب.",
      contact_subject_label: "الموضوع",
      contact_telegram_label: "اسم مستخدم تيليغرام (اختياري)",
      contact_message_label: "الرسالة",
      contact_subject_ph: "ملخص قصير للمشكلة",
      contact_telegram_ph: "مثال: @username",
      contact_message_ph: "اشرح المشكلة بتفاصيل مفيدة",
      contact_compose_btn: "إنشاء رسالة بريد",
      contact_open_btn: "فتح support@tapcogame.io",
      contact_status_default: "يتم تنظيف الحقول داخل المتصفح قبل إنشاء مسودة البريد.",
      contact_status_required: "الموضوع والرسالة مطلوبان.",
      contact_status_opened: "تم فتح مسودة البريد في برنامج البريد لديك.",
      cookie_title: "إشعار ملفات الارتباط",
      cookie_body: "يستخدم TAPCO Hub تخزين المتصفح الأساسي للحفاظ على اللغة والإحالة وتفضيلات الموقع. وقد تستخدم أدوات التحليل أو الإعلانات الاختيارية ملفات إضافية عند تفعيلها.",
      cookie_accept: "قبول الكل",
      cookie_essential: "الأساسي فقط",
      cookie_link: "قراءة سياسة الخصوصية"
    },
    tr: {
      nav_home: "Ana Sayfa",
      nav_game_info: "Oyun Bilgisi",
      nav_referrals: "Referanslar",
      nav_faq: "SSS",
      nav_about: "Hakkimizda",
      nav_support: "Destek",
      nav_contact: "Iletisim",
      nav_updates: "Guncellemeler",
      nav_rewards: "Oduller",
      nav_articles: "Makaleler",
      nav_privacy: "Gizlilik",
      nav_terms: "Kosullar",
      nav_ad_policy: "Reklam Politikasi",
      menu_button: "Menu",
      footer_rights: "Tum haklari saklidir.",
      launch_bot_placeholder: "Telegram bot kullanici adi (@ olmadan)",
      launch_ref_placeholder: "Referans kodu (istege bagli)",
      launch_open_btn: "Telegram'da Ac",
      launch_copy_btn: "Referans Baglantisini Kopyala",
      launch_status_missing_bot: "Baslatmak icin Telegram bot kullanici adini girin.",
      launch_copy_ok: "Kopyalandi",
      launch_copy_fail: "Kopyalanamadi",
      launch_status_required: "Bot kullanici adi gerekli.",
      contact_subject_label: "Konu",
      contact_telegram_label: "Telegram Kullanici Adi (istege bagli)",
      contact_message_label: "Mesaj",
      contact_subject_ph: "Sorunun kisa ozeti",
      contact_telegram_ph: "Ornek: @username",
      contact_message_ph: "Sorununuzu faydali ayrintilarla aciklayin",
      contact_compose_btn: "E-posta Taslagi Olustur",
      contact_open_btn: "support@tapcogame.io ac",
      contact_status_default: "E-posta taslagi olusturulmadan once alanlar tarayicida temizlenir.",
      contact_status_required: "Konu ve mesaj zorunludur.",
      contact_status_opened: "E-posta taslagi posta uygulamanizda acildi.",
      cookie_title: "Cerez Bildirimi",
      cookie_body: "TAPCO Hub; dil, referans ve site tercihlerinin devamli kalmasi icin temel tarayici depolamasi kullanir. Etkinlestirilirse analiz veya reklam araclari ek cerezler kullanabilir.",
      cookie_accept: "Tumunu Kabul Et",
      cookie_essential: "Yalnizca Zorunlu",
      cookie_link: "Gizlilik Politikasini Oku"
    }
  };

  const COOKIE_KEY = "tapco_cookie_consent";

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

    const fromBrowser = String(navigator.language || "en").toLowerCase();
    if (fromBrowser.startsWith("ar")) return "ar";
    if (fromBrowser.startsWith("tr")) return "tr";
    return "en";
  }

  function setI18nTexts(lang) {
    const dict = UI[lang] || UI.en;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = String(el.getAttribute("data-i18n") || "").trim();
      if (key && Object.prototype.hasOwnProperty.call(dict, key)) {
        el.textContent = dict[key];
      }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = String(el.getAttribute("data-i18n-placeholder") || "").trim();
      if (key && Object.prototype.hasOwnProperty.call(dict, key)) {
        el.setAttribute("placeholder", dict[key]);
      }
    });
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

    setI18nTexts(safeLang);

    try {
      localStorage.setItem(LANG_KEY, safeLang);
    } catch (_err) {
      // ignore storage failures
    }

    document.dispatchEvent(new CustomEvent("tapco:lang-changed", { detail: { lang: safeLang } }));
  }

  function wireLangButtons() {
    document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
      btn.addEventListener("click", function () {
        const target = String(btn.getAttribute("data-lang-btn") || "en");
        applyLang(target);
      });
    });
  }

  function ensureFaviconLink() {
    const existing = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    if (existing) return;

    const link = document.createElement("link");
    link.setAttribute("rel", "icon");
    link.setAttribute("type", "image/x-icon");
    link.setAttribute("href", "/favicon.ico");
    document.head.appendChild(link);
  }

  function normalizePrimaryNav() {
    const nav = document.querySelector(".nav-links");
    if (!nav) return;

    const items = [
      { href: "index.html", key: "nav_home", fallback: "Home" },
      { href: "game-info.html", key: "nav_game_info", fallback: "Game Info" },
      { href: "rewards-system.html", key: "nav_rewards", fallback: "Rewards" },
      { href: "referral-system.html", key: "nav_referrals", fallback: "Referrals" },
      { href: "articles.html", key: "nav_articles", fallback: "Articles" },
      { href: "faq.html", key: "nav_faq", fallback: "FAQ" },
      { href: "about.html", key: "nav_about", fallback: "About" },
      { href: "support.html", key: "nav_support", fallback: "Support" },
      { href: "contact.html", key: "nav_contact", fallback: "Contact" },
      { href: "updates.html", key: "nav_updates", fallback: "Updates" }
    ];

    const currentPath = String(window.location.pathname || "");
    const currentFile = currentPath.endsWith("/")
      ? "index.html"
      : currentPath.substring(currentPath.lastIndexOf("/") + 1).toLowerCase();

    nav.innerHTML = items.map((item) => {
      const isCurrent = currentFile === item.href;
      return '<a href="' + item.href + '" data-i18n="' + item.key + '"'
        + (isCurrent ? ' aria-current="page"' : '')
        + '>' + item.fallback + '</a>';
    }).join("");
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

    function currentLang() {
      const lang = String(document.documentElement.getAttribute("lang") || "en").toLowerCase();
      return SUPPORTED_LANGS.includes(lang) ? lang : "en";
    }

    function t(key) {
      const lang = currentLang();
      const dict = UI[lang] || UI.en;
      return dict[key] || UI.en[key] || key;
    }

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
        status.textContent = t("launch_status_missing_bot");
        return;
      }
      status.textContent = launchUrl;
    }

    botInput.addEventListener("input", refreshStatus);
    if (refInput) refInput.addEventListener("input", refreshStatus);

    openBtn.addEventListener("click", function () {
      const launchUrl = buildLaunchUrl();
      if (!launchUrl) {
        status.textContent = t("launch_status_required");
        return;
      }
      window.location.href = launchUrl;
    });

    copyBtn.addEventListener("click", async function () {
      const referralUrl = buildReferralUrl();
      try {
        await navigator.clipboard.writeText(referralUrl);
        copyBtn.textContent = t("launch_copy_ok");
      } catch (_err) {
        copyBtn.textContent = t("launch_copy_fail");
      }
      setTimeout(function () {
        copyBtn.textContent = t("launch_copy_btn");
      }, 1300);
    });

    document.addEventListener("tapco:lang-changed", function () {
      refreshStatus();
      openBtn.textContent = t("launch_open_btn");
      copyBtn.textContent = t("launch_copy_btn");
    });

    refreshStatus();
  }

  function wireCookieBanner() {
    let currentBanner = null;

    function currentLang() {
      const lang = String(document.documentElement.getAttribute("lang") || "en").toLowerCase();
      return SUPPORTED_LANGS.includes(lang) ? lang : "en";
    }

    function t(key) {
      const lang = currentLang();
      const dict = UI[lang] || UI.en;
      return dict[key] || UI.en[key] || key;
    }

    function removeBanner() {
      if (currentBanner && currentBanner.parentNode) {
        currentBanner.parentNode.removeChild(currentBanner);
      }
      currentBanner = null;
    }

    function saveConsent(value) {
      try {
        localStorage.setItem(COOKIE_KEY, value);
      } catch (_err) {
        // ignore storage failure
      }
      removeBanner();
    }

    function renderBanner() {
      let existing = "";
      try {
        existing = String(localStorage.getItem(COOKIE_KEY) || "").trim();
      } catch (_err) {
        existing = "";
      }
      if (existing) {
        removeBanner();
        return;
      }

      removeBanner();

      const banner = document.createElement("aside");
      banner.className = "cookie-banner";
      banner.innerHTML = ""
        + '<div class="cookie-banner-inner">'
        + '  <div class="cookie-banner-copy">'
        + '    <strong class="cookie-banner-title"></strong>'
        + '    <p class="cookie-banner-text"></p>'
        + '    <a class="cookie-banner-link" href="privacy-policy.html"></a>'
        + '  </div>'
        + '  <div class="cookie-banner-actions">'
        + '    <button type="button" class="btn btn-secondary cookie-banner-essential"></button>'
        + '    <button type="button" class="btn btn-primary cookie-banner-accept"></button>'
        + '  </div>'
        + '</div>';

      banner.querySelector(".cookie-banner-title").textContent = t("cookie_title");
      banner.querySelector(".cookie-banner-text").textContent = t("cookie_body");
      banner.querySelector(".cookie-banner-link").textContent = t("cookie_link");
      banner.querySelector(".cookie-banner-essential").textContent = t("cookie_essential");
      banner.querySelector(".cookie-banner-accept").textContent = t("cookie_accept");

      banner.querySelector(".cookie-banner-essential").addEventListener("click", function () {
        saveConsent("essential");
      });
      banner.querySelector(".cookie-banner-accept").addEventListener("click", function () {
        saveConsent("accepted");
      });

      document.body.appendChild(banner);
      currentBanner = banner;
    }

    document.addEventListener("tapco:lang-changed", function () {
      renderBanner();
    });

    renderBanner();
  }

  function setYear() {
    document.querySelectorAll("[data-year]").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });
  }

  function init() {
    ensureFaviconLink();
    normalizePrimaryNav();
    const lang = detectDefaultLang();
    applyLang(lang);
    wireLangButtons();
    wireMobileNav();
    wireLaunchTools();
    wireCookieBanner();
    setYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
    return;
  }
  init();
})();
