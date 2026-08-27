(function(){
'use strict';
function install(){
  var ctl=window.__CTL_HISTORY_STABLE__,d=document;
  if(!ctl||ctl.version<7)return false;
  var old=window.__CTL_HISTORY_V7_GUARD__;
  if(old&&old.observer)try{old.observer.disconnect();}catch(e){}
  if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  try{if(ctl.domGuard)ctl.domGuard.disconnect();}catch(e){}

  function inject(id,src,onload,onerror){
    try{if(d.getElementById(id))return false;var s=d.createElement('script');s.id=id;s.src=src;s.async=false;if(onload)s.onload=onload;if(onerror)s.onerror=onerror;(d.head||d.documentElement).appendChild(s);return true;}catch(e){return false;}
  }
  function loadTargets(){if(window.__CTL_POSITION_TARGETS_V8__&&window.__CTL_POSITION_TARGETS_V8__.ready)return true;inject('ctlHlPositionTargetsV8Script','history_hl_position_targets_v8.js?v=20260827-1');return false;}
  function loadPnl(){if(window.__CTL_HL_PNL_V9__&&window.__CTL_HL_PNL_V9__.ready)return true;if(typeof window.__ctlInstallHlPnlV9==='function'){try{return !!window.__ctlInstallHlPnlV9();}catch(e){return false;}}inject('ctlHlPnlV9Script','history_hl_pnl_v9.js?v=20260827-1',function(){try{if(typeof window.__ctlInstallHlPnlV9==='function')window.__ctlInstallHlPnlV9();}catch(e){}});return false;}
  function ensureDomGuardDef(){if(typeof window.__ctlInstallHlHistoryV8DomGuard==='function')return true;inject('ctlHlHistoryV8DomGuardScript','history_hl_v8_dom_guard.js?v=20260827-2');return false;}
  function installDomGuard(){if(typeof window.__ctlInstallHlHistoryV8DomGuard!=='function')return false;try{return !!window.__ctlInstallHlHistoryV8DomGuard();}catch(e){return false;}}
  var savedMO=null,moPatched=false;
  function patchOverlayObserver(){
    if(moPatched||typeof window.MutationObserver!=='function')return;
    savedMO=window.MutationObserver;
    var Orig=savedMO;
    function SafeMO(cb){
      var text='';try{text=Function.prototype.toString.call(cb);}catch(e){}
      if(text.indexOf('st.rendering')>=0&&text.indexOf('PERF_IDS')>=0){return{observe:function(){},disconnect:function(){},takeRecords:function(){return[];}};}
      return new Orig(cb);
    }
    try{SafeMO.prototype=Orig.prototype;window.MutationObserver=SafeMO;moPatched=true;}catch(e){savedMO=null;}
  }
  function restoreObserver(){if(!moPatched)return;try{window.MutationObserver=savedMO;}catch(e){}moPatched=false;savedMO=null;}
  function loadV8(){
    loadTargets();loadPnl();
    if(!ensureDomGuardDef())return false;
    if(typeof window.__ctlInstallHlHistoryV8Overlay==='function'){
      restoreObserver();
      try{window.__ctlInstallHlHistoryV8Overlay();}catch(e){}
      loadPnl();
      if(window.__CTL_HISTORY_V8_OVERLAY__&&window.__CTL_HISTORY_V8_OVERLAY__.ready)installDomGuard();
      return true;
    }
    patchOverlayObserver();
    inject('ctlHlHistoryV8OverlayScript','history_hl_sync_v8_overlay.js?v=20260827-1',function(){
      restoreObserver();
      try{if(typeof window.__ctlInstallHlHistoryV8Overlay==='function')window.__ctlInstallHlHistoryV8Overlay();}catch(e){}
      loadPnl();installDomGuard();
    },function(){restoreObserver();});
    return false;
  }

  var state={ready:true,version:7,source:'observer-blocked-v8+position-targets+pnl-v9',timer:null};
  window.__CTL_HISTORY_V7_GUARD__=state;
  loadTargets();loadPnl();ensureDomGuardDef();
  state.timer=setInterval(function(){
    loadTargets();loadPnl();ensureDomGuardDef();loadV8();
    if(window.__CTL_HISTORY_V8_OVERLAY__&&window.__CTL_HISTORY_V8_OVERLAY__.ready&&window.__CTL_POSITION_TARGETS_V8__&&window.__CTL_POSITION_TARGETS_V8__.ready&&window.__CTL_HL_PNL_V9__&&window.__CTL_HL_PNL_V9__.ready&&window.__CTL_HISTORY_V8_DOM_GUARD__&&window.__CTL_HISTORY_V8_DOM_GUARD__.ready){restoreObserver();clearInterval(state.timer);state.timer=null;}
  },100);
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
