/* i18n.js — Multi-Language Module for AVA V4
 * Manages language selection, DOM text replacement, and TTS language integration.
 * All visible text uses data-i18n="key" attributes.
 * Placeholder text uses data-i18n-placeholder="key".
 * Exposes: window.AVA_I18N
 */

window.AVA_I18N = (() => {
  const STORAGE_KEY = 'ava_lang';
  const SUPPORTED = [
    { code: 'en', label: 'English',    flag: '🇺🇸', geminiLang: 'English' },
    { code: 'es', label: 'Español',    flag: '🇪🇸', geminiLang: 'Spanish' },
    { code: 'fr', label: 'Français',   flag: '🇫🇷', geminiLang: 'French' },
    { code: 'zh', label: '中文',        flag: '🇨🇳', geminiLang: 'Chinese (Simplified)' },
    { code: 'ar', label: 'العربية',    flag: '🇸🇦', geminiLang: 'Arabic' },
    { code: 'pt', label: 'Português',  flag: '🇧🇷', geminiLang: 'Portuguese' },
  ];

  let currentLang = 'en';
  const localeCache = {};   // { 'en': {...}, 'es': {...} }

  /* ─── INIT ─── */
  async function init() {
    // Restore saved language
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.find(l => l.code === saved)) {
      currentLang = saved;
    }
    // Pre-load current language locale
    await _loadLocale(currentLang);
    // Always load English as fallback
    if (currentLang !== 'en') await _loadLocale('en');
    // Apply to DOM
    _applyToDOM();
    // Update html lang attribute
    document.documentElement.lang = currentLang;
    console.log(`[AVA i18n] Initialized — lang: ${currentLang}`);
  }

  /* ─── LOAD LOCALE JSON ─── */
  async function _loadLocale(code) {
    if (localeCache[code]) return localeCache[code];
    try {
      const resp = await fetch(`locales/${code}.json?v=${Date.now()}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      localeCache[code] = data;
      return data;
    } catch (err) {
      console.warn(`[AVA i18n] Failed to load locale: ${code}`, err);
      localeCache[code] = {};
      return {};
    }
  }

  /* ─── TRANSLATE KEY ─── */
  function t(key, fallback) {
    const locale = localeCache[currentLang] || {};
    const en = localeCache['en'] || {};
    return locale[key] || en[key] || fallback || key;
  }

  /* ─── APPLY ALL data-i18n ATTRIBUTES IN DOM ─── */
  function _applyToDOM() {
    // Text content: data-i18n="key"
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translated = t(key);
      if (translated !== key) {
        el.innerHTML = translated;
      }
    });

    // Placeholders: data-i18n-placeholder="key"
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translated = t(key);
      if (translated !== key) {
        el.placeholder = translated;
      }
    });

    // Title attributes: data-i18n-title="key"
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const translated = t(key);
      if (translated !== key) {
        el.title = translated;
      }
    });
  }

  /* ─── SET LANGUAGE ─── */
  async function setLang(code) {
    if (!SUPPORTED.find(l => l.code === code)) {
      console.warn(`[AVA i18n] Unsupported language: ${code}`);
      return;
    }
    currentLang = code;
    localStorage.setItem(STORAGE_KEY, code);
    document.documentElement.lang = code;

    // Load locale if not cached
    await _loadLocale(code);
    if (!localeCache['en']) await _loadLocale('en');

    // Apply to DOM
    _applyToDOM();

    // Update language selector if it exists
    const selector = document.getElementById('settingLanguage');
    if (selector) selector.value = code;

    // Notify TTS of language change
    if (window.AVA_TTS && AVA_TTS.setLanguage) {
      AVA_TTS.setLanguage(code);
    }

    console.log(`[AVA i18n] Language changed to: ${code}`);
    
    // Show toast
    const langInfo = SUPPORTED.find(l => l.code === code);
    if (typeof showToast === 'function') {
      showToast(`${t('toast.langChanged')} ${langInfo.flag} ${langInfo.label}`, 'success');
    }
  }

  /* ─── PUBLIC API ─── */
  return {
    init,
    setLang,
    t,
    getLang:           () => currentLang,
    getSupportedLangs: () => [...SUPPORTED],
    getGeminiLang:     () => SUPPORTED.find(l => l.code === currentLang)?.geminiLang || 'English',
    refresh:           () => _applyToDOM(),
  };
})();
