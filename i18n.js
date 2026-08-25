/**
 * CopyToLive lightweight i18n (S16)
 * Static-page translation loader — no build step, works on raw HTML pages.
 *
 * Usage in HTML:
 *   <script src="/i18n.js" defer></script>
 *   <h1 data-i18n="hero.title">Default English text</h1>
 *   <p data-i18n="hero.sub" data-i18n-attr="title">Tooltip text</p>
 *
 * Languages loaded from /i18n/<lang>.json. Lang detection order:
 *   1. URL ?lang=xx
 *   2. localStorage 'copytolive.lang'
 *   3. navigator.language prefix
 *   4. fallback 'en'
 */
(function () {
  'use strict';
  var SUPPORTED = ['en', 'id', 'zh', 'ru', 'ar', 'pt'];
  var FALLBACK = 'en';
  var LS_KEY = 'copytolive.lang';

  function detectLang() {
    try {
      var url = new URL(location.href);
      var q = url.searchParams.get('lang');
      if (q && SUPPORTED.indexOf(q) >= 0) return q;
    } catch (e) { /* noop */ }
    try {
      var saved = localStorage.getItem(LS_KEY);
      if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
    } catch (e) { /* noop */ }
    var nav = (navigator.language || 'en').toLowerCase().slice(0, 2);
    return SUPPORTED.indexOf(nav) >= 0 ? nav : FALLBACK;
  }

  function get(obj, path) {
    return path.split('.').reduce(function (o, k) { return (o && o[k] !== undefined) ? o[k] : undefined; }, obj);
  }

  function applyTranslations(dict) {
    document.documentElement.lang = window.__copytolive_lang || FALLBACK;
    document.documentElement.dir = (window.__copytolive_lang === 'ar') ? 'rtl' : 'ltr';
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var key = n.getAttribute('data-i18n');
      var val = get(dict, key);
      if (val === undefined) continue;
      var attr = n.getAttribute('data-i18n-attr');
      if (attr) n.setAttribute(attr, val);
      else n.textContent = val;
    }
  }

  function loadLang(lang) {
    return fetch('/i18n/' + lang + '.json', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) < 0) lang = FALLBACK;
    window.__copytolive_lang = lang;
    try { localStorage.setItem(LS_KEY, lang); } catch (e) { /* noop */ }
    return loadLang(lang).then(function (dict) {
      if (dict) applyTranslations(dict);
      else if (lang !== FALLBACK) return setLang(FALLBACK);
    });
  }

  // Public API
  window.CopyToLiveI18n = {
    supported: SUPPORTED.slice(),
    setLang: setLang,
    getLang: function () { return window.__copytolive_lang || detectLang(); },
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setLang(detectLang()); });
  } else {
    setLang(detectLang());
  }
})();
