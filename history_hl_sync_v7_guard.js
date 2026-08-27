(function(){
'use strict';
function install(){
  var d=document;
  var old=window.__CTL_HISTORY_V7_GUARD__;
  if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  if(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10){
    try{if(typeof window.__ctlInstallHlHistoryV10==='function')window.__ctlInstallHlHistoryV10();}catch(e){}
    window.__CTL_HISTORY_V7_GUARD__={ready:true,version:10,source:'persistent-v10',timer:null};
    return true;
  }
  function load(){
    if(typeof window.__ctlInstallHlHistoryV10==='function'){
      try{window.__ctlInstallHlHistoryV10();}catch(e){}
      return !!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10);
    }
    var existing=d.getElementById('ctlHlHistoryV10Script');
    if(existing)return false;
    var s=d.createElement('script');
    s.id='ctlHlHistoryV10Script';
    s.src='history_hl_runtime_v10.js?v=20260827-1';
    s.async=false;
    s.onload=function(){try{if(typeof window.__ctlInstallHlHistoryV10==='function')window.__ctlInstallHlHistoryV10();}catch(e){}};
    s.onerror=function(){try{s.remove();}catch(e){}};
    (d.head||d.documentElement).appendChild(s);
    return false;
  }
  var state={ready:true,version:10,source:'persistent-v10-loader',timer:null};
  window.__CTL_HISTORY_V7_GUARD__=state;
  load();
  state.timer=setInterval(function(){
    if(load()&&window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10){clearInterval(state.timer);state.timer=null;}
  },500);
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
