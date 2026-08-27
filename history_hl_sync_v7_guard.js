(function(){
'use strict';
function install(){
  var ctl=window.__CTL_HISTORY_STABLE__,d=document;
  if(!ctl||ctl.version<7||typeof ctl.setMode!=='function')return false;
  if(window.__CTL_HISTORY_V7_GUARD__)return true;
  try{if(ctl.domGuard)ctl.domGuard.disconnect();}catch(e){}
  var state={ready:true,version:1,suppress:false,queued:false,observer:null,timer:null};
  function relevant(m){
    var q=m&&m.target&&(m.target.nodeType===1?m.target:m.target.parentElement);
    while(q&&q!==d.body){
      if(q.id==='historyTableBody'||q.id==='emptyHistory'||q.id==='historyTable'||q.id==='tradeLogInfo'||q.id==='historyTypeFilters')return true;
      q=q.parentElement;
    }
    return false;
  }
  function repaint(){
    if(state.suppress)return;
    state.suppress=true;
    try{ctl.setMode(ctl.mode||window._historyTypeFilter||'all');}catch(e){}
    setTimeout(function(){state.suppress=false;},0);
  }
  try{
    state.observer=new MutationObserver(function(muts){
      if(state.suppress||state.queued||!muts.some(relevant))return;
      state.queued=true;
      requestAnimationFrame(function(){state.queued=false;repaint();});
    });
    state.observer.observe(d.body,{subtree:true,childList:true,characterData:true});
  }catch(e){}
  // Slow safety repaint covers legacy pollers that mutate style/visibility without
  // changing text nodes. It is intentionally infrequent to avoid any visual pulse.
  state.timer=setInterval(repaint,2500);
  window.__CTL_HISTORY_V7_GUARD__=state;
  repaint();
  return true;
}
window.__ctlInstallHlHistoryV7Guard=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();