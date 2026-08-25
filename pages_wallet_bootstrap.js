(function () {
  'use strict';

  var IS_PAGES = location.hostname === 'narzulalistiqlal.github.io' && location.pathname.indexOf('/copy/') === 0;
  if (!IS_PAGES) return;

  var loaded = false;
  var startedAt = Date.now();
  var current = document.currentScript;
  var version = '';
  try {
    if (current && current.src) version = new URL(current.src, location.href).searchParams.get('v') || '';
  } catch(e) {}

  function valid(v) {
    return /^0x[a-fA-F0-9]{40}$/.test(String(v || '').trim());
  }

  function ready() {
    return valid(window._hlAccountWallet) && !!window._pagesHlAccountSource;
  }

  function loadWalletReader() {
    if (loaded || !ready()) return false;
    loaded = true;
    var s = document.createElement('script');
    s.id = 'pagesWalletHistoryRuntime';
    s.src = '/copy/pages_wallet_history.js' + (version ? ('?v=' + encodeURIComponent(version)) : ('?t=' + Date.now()));
    s.async = false;
    s.onload = function() {
      console.info('[Pages HL Bootstrap] wallet reader loaded', {
        account: window._hlAccountWallet,
        source: window._pagesHlAccountSource,
        version: version || 'runtime'
      });
    };
    s.onerror = function() {
      loaded = false;
      console.error('[Pages HL Bootstrap] wallet reader failed to load');
    };
    document.body.appendChild(s);
    return true;
  }

  function tick() {
    if (loadWalletReader()) return;
    // Resolver can be waiting for the user to choose the correct account. Keep
    // waiting rather than falling back to another email's localStorage wallet.
    if (Date.now() - startedAt < 10 * 60 * 1000) setTimeout(tick, 200);
  }

  window.addEventListener('pages-hl-account-ready', loadWalletReader);
  tick();
})();