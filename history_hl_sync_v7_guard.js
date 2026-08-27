(function(){
'use strict';
function install(){
  var ctl=window.__CTL_HISTORY_STABLE__,d=document;
  if(!ctl||ctl.version<7)return false;
  var old=window.__CTL_HISTORY_V7_GUARD__;
  if(old&&old.observer)try{old.observer.disconnect();}catch(e){}
  if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  try{if(ctl.domGuard)ctl.domGuard.disconnect();}catch(e){}

  function loadTargets(){
    try{
      if(window.__CTL_POSITION_TARGETS_V8__&&window.__CTL_POSITION_TARGETS_V8__.ready)return true;
      if(d.getElementById('ctlHlPositionTargetsV8Script'))return false;
      var p=d.createElement('script');
      p.id='ctlHlPositionTargetsV8Script';
      p.src='history_hl_position_targets_v8.js?v=20260827-1';
      p.async=false;
      (d.head||d.documentElement).appendChild(p);
      return true;
    }catch(e){return false;}
  }
  function loadV8(){
    try{
      loadTargets();
      if(typeof window.__ctlInstallHlHistoryV8Overlay==='function'){
        window.__ctlInstallHlHistoryV8Overlay();
        return true;
      }
      if(d.getElementById('ctlHlHistoryV8OverlayScript'))return false;
      var s=d.createElement('script');
      s.id='ctlHlHistoryV8OverlayScript';
      s.src='history_hl_sync_v8_overlay.js?v=20260827-1';
      s.async=false;
      s.onload=function(){try{if(typeof window.__ctlInstallHlHistoryV8Overlay==='function')window.__ctlInstallHlHistoryV8Overlay();}catch(e){}};
      (d.head||d.documentElement).appendChild(s);
      return true;
    }catch(e){return false;}
  }

  var state={ready:true,version:3,source:'v8-overlay+position-target-loader',timer:null};
  window.__CTL_HISTORY_V7_GUARD__=state;
  loadV8();
  state.timer=setInterval(function(){
    loadTargets();
    if(window.__CTL_HISTORY_V8_OVERLAY__&&window.__CTL_HISTORY_V8_OVERLAY__.ready&&window.__CTL_POSITION_TARGETS_V8__&&window.__CTL_POSITION_TARGETS_V8__.ready){
      clearInterval(state.timer);state.timer=null;return;
    }
    loadV8();
  },500);
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
