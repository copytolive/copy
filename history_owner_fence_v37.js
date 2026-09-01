(function(){
'use strict';

var VERSION=37;

function install(){
  var st=window.__CTL_HISTORY_STABLE__;
  var m=window.__CTL_HISTORY_MODE_V20__;
  var v36=window.__CTL_REAL_FILTERS_V36__;
  if(!st||!m||!v36||!v36.ready||!v36.ownerLock){setTimeout(install,100);return false;}

  var old=window.__CTL_HISTORY_OWNER_FENCE_V37__;
  if(old&&old.ready)return true;

  var state={
    ready:true,
    version:VERSION,
    source:'v36-owner-fence-drain-v10',
    installedAt:Date.now(),
    legacyWasPolling:!!st.polling,
    drained:false,
    drainAt:0,
    repaintCount:0,
    observer:null,
    timer:null,
    lastError:''
  };
  window.__CTL_HISTORY_OWNER_FENCE_V37__=state;

  try{if(st.timer)clearInterval(st.timer);}catch(e){}
  st.timer=null;
  try{if(st.observer)st.observer.disconnect();}catch(e){}
  st.observer=null;
  try{if(m.metaTimer)clearInterval(m.metaTimer);}catch(e){}
  m.metaTimer=null;
  try{if(m.dataTimer)clearInterval(m.dataTimer);}catch(e){}
  m.dataTimer=null;

  ['__CTL_HL_PENDING_V19__','__CTL_HL_PENDING_V18__','__CTL_HL_SUMMARY_V19__','__CTL_HL_SUMMARY_V18__','__CTL_HL_MARKET_ONLY_V18__'].forEach(function(k){
    var x=window[k];
    try{if(x&&x.timer)clearInterval(x.timer);}catch(e){}
    if(x)x.timer=null;
  });

  // This is the key fence. V10's closed-over render() checks st.rendering first.
  // Keeping it true makes any already in-flight V10 poll unable to repaint UI.
  st.rendering=true;
  st.poll=function(){return false;};

  function repaint(reason){
    try{
      state.repaintCount++;
      if(v36&&typeof v36.setMode==='function')v36.setMode(st.mode||'all');
      else if(typeof st.render==='function')st.render();
      var e=document.getElementById('tradeLogInfo');
      if(e)e.dataset.v37Reason=String(reason||'fence');
    }catch(e){state.lastError=String(e&&e.message||e);}
  }

  var queued=false;
  function ensureOwnedStatus(){
    if(queued)return;
    var info=document.getElementById('tradeLogInfo');
    if(info&&String(info.textContent||'').indexOf('REAL HYPERLIQUID')===0)return;
    queued=true;
    Promise.resolve().then(function(){queued=false;repaint('dom-owner-repair');});
  }

  try{
    state.observer=new MutationObserver(function(){ensureOwnedStatus();});
    state.observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  }catch(e){state.lastError=String(e&&e.message||e);}

  var started=Date.now();
  function drain(){
    // An already-running V10 poll eventually reaches finally{st.polling=false}.
    // Only after that point do we pin polling=true so it cannot start again.
    if(!st.polling||Date.now()-started>15000){
      st.polling=true;
      state.drained=true;
      state.drainAt=Date.now();
      try{
        if(v36&&typeof v36.refresh==='function'){
          Promise.resolve(v36.refresh('v37-post-v10-drain')).finally(function(){repaint('post-drain');});
        }else repaint('post-drain-no-refresh');
      }catch(e){state.lastError=String(e&&e.message||e);repaint('post-drain-error');}
      return;
    }
    state.timer=setTimeout(drain,100);
  }

  drain();
  repaint('install');
  return true;
}

window.__ctlInstallHistoryOwnerFenceV37=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});
else setTimeout(install,0);
})();
