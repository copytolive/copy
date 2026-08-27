(function(){
'use strict';
function install(){
  var d=document,st=window.__CTL_HISTORY_V8_OVERLAY__;
  if(!st||!st.ready||typeof st.setMode!=='function')return false;
  var old=window.__CTL_HISTORY_V8_DOM_GUARD__;
  if(old&&old.observer)try{old.observer.disconnect();}catch(e){}
  if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  try{if(st.observer)st.observer.disconnect();}catch(e){}
  var state={ready:true,version:2,suppress:false,queued:false,observer:null,timer:null};
  function relevant(m){var z=m&&m.target&&(m.target.nodeType===1?m.target:m.target.parentElement);while(z&&z!==d.body){if(z.id==='historyTableBody'||z.id==='emptyHistory'||z.id==='historyTable'||z.id==='tradeLogInfo'||z.id==='statTotalTrades'||z.id==='dGrossProfit'||z.id==='dGrossLoss'||z.id==='dWinRate'||z.id==='dLossRate'||z.id==='dTotalTrades2')return true;z=z.parentElement;}return false;}
  function paintPnl(){try{var p=window.__CTL_HL_PNL_V9__;if(p&&p.ready&&typeof p.apply==='function')p.apply();}catch(e){}}
  function repaint(){if(state.suppress)return;state.suppress=true;try{st.setMode(st.mode||window._historyTypeFilter||'all');paintPnl();}catch(e){}requestAnimationFrame(function(){paintPnl();requestAnimationFrame(function(){paintPnl();state.suppress=false;});});}
  state.observer=new MutationObserver(function(ms){if(state.suppress||state.queued||!ms.some(relevant))return;state.queued=true;requestAnimationFrame(function(){state.queued=false;repaint();});});
  state.observer.observe(d.body,{subtree:true,childList:true,characterData:true});
  state.timer=setInterval(function(){if(!state.suppress)repaint();},2500);
  window.__CTL_HISTORY_V8_DOM_GUARD__=state;
  repaint();return true;
}
window.__ctlInstallHlHistoryV8DomGuard=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
