(function () {
  'use strict';

  var ROOT_PATH = '/copy/';
  var ROOT_URL = 'https://copytolive.github.io/copy/';
  var IS_PAGES = location.hostname === 'copytolive.github.io' && location.pathname.indexOf(ROOT_PATH) === 0;
  if (!IS_PAGES || window.top !== window.self) return;

  function pinRootUrl() {
    try {
      if (location.pathname === ROOT_PATH && (location.search || location.hash)) {
        history.replaceState(history.state, '', ROOT_PATH);
      }
    } catch (e) {}
  }

  function installCanonical() {
    try {
      var link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = ROOT_URL;
    } catch (e) {}
  }

  function findMaintenanceTitle() {
    var nodes = document.querySelectorAll('div');
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === 'Charting sedang dalam pemeliharaan') return nodes[i];
    }
    return null;
  }

  function mountLiveCharting() {
    var title = findMaintenanceTitle();
    if (!title) return false;

    var card = title.parentElement;
    var host = card && card.parentElement;
    if (!host) return false;
    if (host.getAttribute('data-ctl-charting-live') === '1') return true;

    host.setAttribute('data-ctl-charting-live', '1');
    host.className = 'flex-1 min-h-0';
    host.style.cssText = 'position:relative;display:block;overflow:hidden;padding:0;min-height:0;background:#131722;text-align:initial;';
    host.innerHTML = '';

    var frame = document.createElement('iframe');
    frame.src = 'renko/?embed=1&symbol=SOL';
    frame.title = 'CopyToLive Charting';
    frame.loading = 'eager';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');
    frame.style.cssText = 'width:100%;height:100%;min-height:520px;border:0;display:block;background:#131722;';
    host.appendChild(frame);

    window.__COPYTOLIVE_ROOT_CHARTING__ = {
      mounted: true,
      rootOnly: true,
      source: 'renko-v12',
      mountedAt: Date.now()
    };
    return true;
  }

  installCanonical();
  pinRootUrl();

  var scheduled = false;
  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      mountLiveCharting();
      pinRootUrl();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  } else {
    scheduleMount();
  }

  var observer = new MutationObserver(scheduleMount);
  function observe() {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleMount();
  }
  if (document.body) observe();
  else document.addEventListener('DOMContentLoaded', observe, { once: true });

  window.addEventListener('popstate', pinRootUrl);
})();
