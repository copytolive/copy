(function(){
'use strict';
function install(){
  var d=document;
  var old=window.__CTL_HISTORY_V7_GUARD__;
  if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  function inject(id,src,onload){
    try{if(d.getElementById(id))return false;var s=d.createElement('script');s.id=id;s.src=src;s.async=false;if(onload)s.onload=onload;s.onerror=function(){try{s.remove();}catch(e){}};(d.head||d.documentElement).appendChild(s);return true;}catch(e){return false;}
  }
  function loadV10(){
    if(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10)return true;
    if(typeof window.__ctlInstallHlHistoryV10==='function'){try{window.__ctlInstallHlHistoryV10();}catch(e){}return !!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10);}
    inject('ctlHlHistoryV10Script','history_hl_runtime_v10.js?v=20260827-2',function(){try{if(typeof window.__ctlInstallHlHistoryV10==='function')window.__ctlInstallHlHistoryV10();}catch(e){}});
    return false;
  }
  function loadV13(){
    if(!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10))return false;
    if(window.__CTL_HL_PENDING_V13__&&window.__CTL_HL_PENDING_V13__.ready)return true;
    if(typeof window.__ctlInstallHlPendingV13==='function'){try{window.__ctlInstallHlPendingV13();}catch(e){}return !!(window.__CTL_HL_PENDING_V13__&&window.__CTL_HL_PENDING_V13__.ready);}
    inject('ctlHlPendingV13Script','history_hl_pending_v13.js?v=20260827-1',function(){try{if(typeof window.__ctlInstallHlPendingV13==='function')window.__ctlInstallHlPendingV13();}catch(e){}});
    return false;
  }
  function loadV14(){
    if(!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10))return false;
    if(window.__CTL_HL_PENDING_BRIDGE_V14__&&window.__CTL_HL_PENDING_BRIDGE_V14__.ready)return true;
    if(typeof window.__ctlInstallHlPendingBridgeV14==='function'){try{window.__ctlInstallHlPendingBridgeV14();}catch(e){}return !!(window.__CTL_HL_PENDING_BRIDGE_V14__&&window.__CTL_HL_PENDING_BRIDGE_V14__.ready);}
    inject('ctlHlPendingBridgeV14Script','history_hl_pending_bridge_v14.js?v=20260827-1',function(){try{if(typeof window.__ctlInstallHlPendingBridgeV14==='function')window.__ctlInstallHlPendingBridgeV14();}catch(e){}});
    return false;
  }
  function loadV15(){
    if(!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10))return false;
    if(window.__CTL_HL_SUMMARY_V15__&&window.__CTL_HL_SUMMARY_V15__.ready)return true;
    if(typeof window.__ctlInstallHlSummaryV15==='function'){try{window.__ctlInstallHlSummaryV15();}catch(e){}return !!(window.__CTL_HL_SUMMARY_V15__&&window.__CTL_HL_SUMMARY_V15__.ready);}
    inject('ctlHlSummaryV15Script','history_hl_summary_v15.js?v=20260827-1',function(){try{if(typeof window.__ctlInstallHlSummaryV15==='function')window.__ctlInstallHlSummaryV15();}catch(e){}});
    return false;
  }
  var state={ready:true,version:15,source:'persistent-v10+pending-v13+bridge-v14+summary-v15',timer:null};
  window.__CTL_HISTORY_V7_GUARD__=state;
  loadV10();loadV13();loadV14();loadV15();
  state.timer=setInterval(function(){var a=loadV10(),b=loadV13(),c=loadV14(),d15=loadV15();if(a&&b&&c&&d15){clearInterval(state.timer);state.timer=null;}},500);
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
