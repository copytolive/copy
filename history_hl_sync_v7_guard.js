(function(){
'use strict';
function install(){
  var d=document,old=window.__CTL_HISTORY_V7_GUARD__;
  if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  ['__CTL_HL_PENDING_V13__','__CTL_HL_PENDING_BRIDGE_V14__','__CTL_HL_LIVE_PENDING_V16__','__CTL_HL_SUMMARY_V16__'].forEach(function(k){var x=window[k];if(x&&x.timer)try{clearInterval(x.timer);}catch(e){}if(x&&x.refreshTimer)try{clearInterval(x.refreshTimer);}catch(e){}});
  function inject(id,src,onload){try{var prev=d.getElementById(id);if(prev)try{prev.remove();}catch(e){}var s=d.createElement('script');s.id=id;s.src=src;s.async=false;if(onload)s.onload=onload;s.onerror=function(){try{s.remove();}catch(e){}};(d.head||d.documentElement).appendChild(s);return true;}catch(e){return false;}}
  function loadV10(){if(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10)return true;if(typeof window.__ctlInstallHlHistoryV10==='function'){try{window.__ctlInstallHlHistoryV10();}catch(e){}return !!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10);}inject('ctlHlHistoryV10Script','history_hl_runtime_v10.js?v=20260827-2',function(){try{window.__ctlInstallHlHistoryV10&&window.__ctlInstallHlHistoryV10();}catch(e){}});return false;}
  function loadPending17(){if(!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10))return false;if(window.__CTL_HL_PENDING_V17__&&window.__CTL_HL_PENDING_V17__.ready)return true;if(typeof window.__ctlInstallHlPendingV17==='function'){try{window.__ctlInstallHlPendingV17();}catch(e){}return !!(window.__CTL_HL_PENDING_V17__&&window.__CTL_HL_PENDING_V17__.ready);}inject('ctlHlPendingV17Script','history_hl_pending_v17.js?v=20260827-1',function(){try{window.__ctlInstallHlPendingV17&&window.__ctlInstallHlPendingV17();}catch(e){}});return false;}
  function loadSummary17(){if(!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10))return false;if(window.__CTL_HL_SUMMARY_V17__&&window.__CTL_HL_SUMMARY_V17__.ready)return true;if(typeof window.__ctlInstallHlSummaryV17==='function'){try{window.__ctlInstallHlSummaryV17();}catch(e){}return !!(window.__CTL_HL_SUMMARY_V17__&&window.__CTL_HL_SUMMARY_V17__.ready);}inject('ctlHlSummaryV17Script','history_hl_summary_v17.js?v=20260827-1',function(){try{window.__ctlInstallHlSummaryV17&&window.__ctlInstallHlSummaryV17();}catch(e){}});return false;}
  var state={ready:true,version:17,source:'persistent-v10+historical-trigger-pending-v17+summary-v17',timer:null};window.__CTL_HISTORY_V7_GUARD__=state;
  loadV10();loadPending17();loadSummary17();
  state.timer=setInterval(function(){var a=loadV10(),b=loadPending17(),c=loadSummary17();if(a&&b&&c){clearInterval(state.timer);state.timer=null;}},500);
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();