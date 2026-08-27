(function(){
'use strict';
function install(){
  var d=document,old=window.__CTL_HISTORY_V7_GUARD__;
  if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  ['__CTL_HL_PENDING_V13__','__CTL_HL_PENDING_BRIDGE_V14__'].forEach(function(k){var x=window[k];if(x&&x.timer)try{clearInterval(x.timer);}catch(e){}if(x&&x.refreshTimer)try{clearInterval(x.refreshTimer);}catch(e){}});
  function inject(id,src,onload){try{var prev=d.getElementById(id);if(prev)try{prev.remove();}catch(e){}var s=d.createElement('script');s.id=id;s.src=src;s.async=false;if(onload)s.onload=onload;s.onerror=function(){try{s.remove();}catch(e){}};(d.head||d.documentElement).appendChild(s);return true;}catch(e){return false;}}
  function loadV10(){if(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10)return true;if(typeof window.__ctlInstallHlHistoryV10==='function'){try{window.__ctlInstallHlHistoryV10();}catch(e){}return !!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10);}inject('ctlHlHistoryV10Script','history_hl_runtime_v10.js?v=20260827-2',function(){try{window.__ctlInstallHlHistoryV10&&window.__ctlInstallHlHistoryV10();}catch(e){}});return false;}
  function loadLive16(){if(!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10))return false;if(window.__CTL_HL_LIVE_PENDING_V16__&&window.__CTL_HL_LIVE_PENDING_V16__.ready)return true;if(typeof window.__ctlInstallHlLivePendingV16==='function'){try{window.__ctlInstallHlLivePendingV16();}catch(e){}return !!(window.__CTL_HL_LIVE_PENDING_V16__&&window.__CTL_HL_LIVE_PENDING_V16__.ready);}inject('ctlHlLivePendingV16Script','history_hl_live_pending_v16.js?v=20260827-1',function(){try{window.__ctlInstallHlLivePendingV16&&window.__ctlInstallHlLivePendingV16();}catch(e){}});return false;}
  function loadSummary16(){if(!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10))return false;if(window.__CTL_HL_SUMMARY_V16__&&window.__CTL_HL_SUMMARY_V16__.ready)return true;if(typeof window.__ctlInstallHlSummaryV16==='function'){try{window.__ctlInstallHlSummaryV16();}catch(e){}return !!(window.__CTL_HL_SUMMARY_V16__&&window.__CTL_HL_SUMMARY_V16__.ready);}inject('ctlHlSummaryV16Script','history_hl_summary_v16.js?v=20260827-1',function(){try{window.__ctlInstallHlSummaryV16&&window.__ctlInstallHlSummaryV16();}catch(e){}});return false;}
  var state={ready:true,version:16,source:'persistent-v10+direct-live-pending-v16+summary-v16',timer:null};window.__CTL_HISTORY_V7_GUARD__=state;
  loadV10();loadLive16();loadSummary16();
  state.timer=setInterval(function(){var a=loadV10(),b=loadLive16(),c=loadSummary16();if(a&&b&&c){clearInterval(state.timer);state.timer=null;}},500);
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();