(function(){
'use strict';
function install(){
  var ctl=window.__CTL_HISTORY_STABLE__,d=document;
  if(!ctl||ctl.version<7)return false;
  var old=window.__CTL_HISTORY_V7_GUARD__;
  if(old&&old.observer)try{old.observer.disconnect();}catch(e){}
  if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  try{if(ctl.domGuard)ctl.domGuard.disconnect();}catch(e){}

  function inject(id,src,onload){
    try{
      if(d.getElementById(id))return false;
      var s=d.createElement('script');s.id=id;s.src=src;s.async=false;if(onload)s.onload=onload;(d.head||d.documentElement).appendChild(s);return true;
    }catch(e){return false;}
  }
  function loadTargets(){
    if(window.__CTL_POSITION_TARGETS_V8__&&window.__CTL_POSITION_TARGETS_V8__.ready)return true;
    inject('ctlHlPositionTargetsV8Script','history_hl_position_targets_v8.js?v=20260827-1');return false;
  }
  function loadDomGuard(){
    if(typeof window.__ctlInstallHlHistoryV8DomGuard==='function'){try{window.__ctlInstallHlHistoryV8DomGuard();}catch(e){}return !!window.__CTL_HISTORY_V8_DOM_GUARD__;}
    inject('ctlHlHistoryV8DomGuardScript','history_hl_v8_dom_guard.js?v=20260827-1',function(){try{if(typeof window.__ctlInstallHlHistoryV8DomGuard==='function')window.__ctlInstallHlHistoryV8DomGuard();}catch(e){}});return false;
  }
  function loadV8(){
    loadTargets();
    if(typeof window.__ctlInstallHlHistoryV8Overlay==='function'){
      try{window.__ctlInstallHlHistoryV8Overlay();}catch(e){}
      if(window.__CTL_HISTORY_V8_OVERLAY__&&window.__CTL_HISTORY_V8_OVERLAY__.ready)loadDomGuard();
      return true;
    }
    inject('ctlHlHistoryV8OverlayScript','history_hl_sync_v8_overlay.js?v=20260827-1',function(){
      try{if(typeof window.__ctlInstallHlHistoryV8Overlay==='function')window.__ctlInstallHlHistoryV8Overlay();}catch(e){}
      setTimeout(loadDomGuard,0);
    });return false;
  }

  var state={ready:true,version:4,source:'v8-overlay+position-target+loop-safe-guard',timer:null};
  window.__CTL_HISTORY_V7_GUARD__=state;
  loadV8();
  state.timer=setInterval(function(){
    loadTargets();loadV8();loadDomGuard();
    if(window.__CTL_HISTORY_V8_OVERLAY__&&window.__CTL_HISTORY_V8_OVERLAY__.ready&&window.__CTL_POSITION_TARGETS_V8__&&window.__CTL_POSITION_TARGETS_V8__.ready&&window.__CTL_HISTORY_V8_DOM_GUARD__&&window.__CTL_HISTORY_V8_DOM_GUARD__.ready){clearInterval(state.timer);state.timer=null;}
  },500);
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
