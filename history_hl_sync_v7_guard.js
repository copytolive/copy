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
  function loadV12(){
    if(window.__CTL_HL_SUMMARY_V12__&&window.__CTL_HL_SUMMARY_V12__.ready)return true;
    if(typeof window.__ctlInstallHlSummaryV12==='function'){try{window.__ctlInstallHlSummaryV12();}catch(e){}return !!(window.__CTL_HL_SUMMARY_V12__&&window.__CTL_HL_SUMMARY_V12__.ready);}
    inject('ctlHlSummaryV12Script','history_hl_summary_v12.js?v=20260827-1',function(){try{if(typeof window.__ctlInstallHlSummaryV12==='function')window.__ctlInstallHlSummaryV12();}catch(e){}});
    return false;
  }
  var state={ready:true,version:12,source:'persistent-v10+summary-v12',timer:null};
  window.__CTL_HISTORY_V7_GUARD__=state;
  loadV10();loadV12();
  state.timer=setInterval(function(){var a=loadV10(),b=loadV12();if(a&&b){clearInterval(state.timer);state.timer=null;}},500);
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
