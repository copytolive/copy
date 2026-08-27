(function(){
'use strict';
function install(){
  var d=document;
  var old=window.__CTL_HISTORY_V7_GUARD__;
  if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  function inject(id,src,onload){
    try{if(d.getElementById(id))return false;var s=d.createElement('script');s.id=id;s.src=src;s.async=false;if(onload)s.onload=onload;(d.head||d.documentElement).appendChild(s);return true;}catch(e){return false;}
  }
  function loadV10(){
    if(typeof window.__ctlInstallHlHistoryV10==='function'){try{window.__ctlInstallHlHistoryV10();}catch(e){}return !!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10);}
    inject('ctlHlHistoryV10Script','history_hl_runtime_v10.js?v=20260827-2',function(){try{if(typeof window.__ctlInstallHlHistoryV10==='function')window.__ctlInstallHlHistoryV10();}catch(e){}});return false;
  }
  function loadV11(){
    if(!(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10))return false;
    if(typeof window.__ctlInstallHlSummaryV11==='function'){try{window.__ctlInstallHlSummaryV11();}catch(e){}return !!(window.__CTL_HL_SUMMARY_V11__&&window.__CTL_HL_SUMMARY_V11__.ready);}
    inject('ctlHlSummaryV11Script','history_hl_summary_v11.js?v=20260827-1',function(){try{if(typeof window.__ctlInstallHlSummaryV11==='function')window.__ctlInstallHlSummaryV11();}catch(e){}});return false;
  }
  var state={ready:true,version:11,source:'persistent-v10+summary-balance-v11',timer:null};window.__CTL_HISTORY_V7_GUARD__=state;
  loadV10();loadV11();
  state.timer=setInterval(function(){var a=loadV10(),b=loadV11();if(a&&b){clearInterval(state.timer);state.timer=null;}},500);
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
