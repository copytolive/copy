(function(){
'use strict';
var VERSION=35,STYLE_ID='ctlHistoryZeroFlickerV35Style';
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function oid(v){return v==null?'':String(v);}
function tm(v){if(typeof v==='number'&&Number.isFinite(v))return v;var x=Date.parse(v||'');return Number.isFinite(x)?x:0;}
function rowKey(x){if(!x)return'-';return[oid(x._hlOid||x.oid||x.order_id||x.trade_id),String(x.symbol||x.coin||''),String(x._pendingKind||x.direction||''),String(x._status||''),n(x.price||x.trigger_price||x.entry_price,0),n(x.volume||x.lot,0),x.pnl==null?'':n(x.pnl,0),tm(x.timestamp)].join(':');}
function signature(st){
  var m=window.__CTL_HISTORY_MODE_V20__||{},mode=String(st&&st.mode||'all'),shown=n(m.shown,20),rows=[];
  if(mode==='pending') rows=Array.isArray(m.triggerRows)?m.triggerRows:[];
  else if(mode==='direct'){
    var pb=m.meta&&m.meta.parentBracket||{};
    rows=(Array.isArray(st&&st.fills)?st.fills:[]).filter(function(f){if(!f||!f.is_entry)return false;var k=oid(f._hlOid);return !(k&&pb[k]);});
  } else rows=Array.isArray(st&&st.fills)?st.fills:[];
  var lim=Math.min(rows.length,Math.max(20,shown));
  var parts=[mode,shown,rows.length];
  for(var i=0;i<lim;i++)parts.push(rowKey(rows[i]));
  if(mode!=='all'){
    var meta=m.meta||{},parents=Object.keys(meta.parentBracket||{}).sort();
    parts.push('P='+parents.join(','));
  }
  return parts.join('|');
}
function style(){
  var d=document,s=d.getElementById(STYLE_ID);if(s)return s;
  s=d.createElement('style');s.id=STYLE_ID;
  s.textContent=[
    '#backtestHistoryPanel{display:block!important;visibility:visible!important;opacity:1!important;animation:none!important;transition:none!important;backface-visibility:hidden!important;transform:translateZ(0)!important;isolation:isolate!important;}',
    '.workspace-performance{display:block!important;visibility:visible!important;opacity:1!important;animation:none!important;transition:none!important;}',
    '#backtestHistoryPanel>div:first-child,#backtestHistoryPanel>div:first-child>div:first-child{visibility:visible!important;opacity:1!important;animation:none!important;transition:none!important;}',
    '#historyTypeFilters,#ctlHistoryPnlSummaryV11,#historyTable,#historyTableBody,#emptyHistory{animation:none!important;transition:none!important;}',
    '#historyTableBody{visibility:visible!important;}'
  ].join('');
  (d.head||d.documentElement).appendChild(s);return s;
}
function stabilizeTitle(state){
  var p=document.getElementById('backtestHistoryPanel');if(!p)return false;
  p.dataset.zeroFlicker='35';
  try{p.style.setProperty('display','block','important');p.style.setProperty('visibility','visible','important');p.style.setProperty('opacity','1','important');p.style.setProperty('animation','none','important');p.style.setProperty('transition','none','important');}catch(e){}
  var wp=p.closest&&p.closest('.workspace-performance');if(wp)try{wp.style.setProperty('display','block','important');wp.style.setProperty('visibility','visible','important');wp.style.setProperty('opacity','1','important');}catch(e){}
  var head=p.firstElementChild,title=head&&head.firstElementChild;
  if(title){var want='📋 Detailed Trade Log · ALL PAIRS';if(String(title.textContent||'').trim()!==want){title.textContent=want;state.titleRepairs++;}title.dataset.zeroFlicker='35';try{title.style.setProperty('visibility','visible','important');title.style.setProperty('opacity','1','important');title.style.setProperty('animation','none','important');title.style.setProperty('transition','none','important');}catch(e){}}
  return true;
}
function stopPeriodicWriters(state){
  var v33=window.__CTL_REAL_METRICS_V33__;if(v33&&v33.timer){try{clearInterval(v33.timer);}catch(e){}v33.timer=null;v33.periodicPaintDisabledBy='v35-zero-flicker';state.timersStopped++;}
  var v31=window.__CTL_REAL_METRICS_V31__;if(v31&&v31.timer){try{clearInterval(v31.timer);}catch(e){}v31.timer=null;v31.disabledBy='v35-zero-flicker';state.timersStopped++;}
}
function install(){
  var st=window.__CTL_HISTORY_STABLE__;if(!st||typeof st.render!=='function'){setTimeout(install,80);return false;}
  var old=window.__CTL_ZERO_FLICKER_V35__;if(old&&old.ready&&st.render&&st.render.__ctlV35){style();stabilizeTitle(old);stopPeriodicWriters(old);return true;}
  style();
  var base=st.render;
  var state={ready:true,version:VERSION,source:'single-render-fingerprint+periodic-summary-off+panel-compositor-lock+first-frame-lock',baseRender:base,lastSig:'',renders:0,skipped:0,titleRepairs:0,timersStopped:0,badFrames:0,samples:0,observer:null,sampling:true,lastError:''};
  window.__CTL_ZERO_FLICKER_V35__=state;
  function render(){
    var sig=signature(st);
    if(sig===state.lastSig){state.skipped++;return true;}
    state.lastSig=sig;state.renders++;
    var r;
    try{r=base.apply(st,arguments);}catch(e){state.lastError=String(e&&e.message||e);throw e;}
    stabilizeTitle(state);return r;
  }
  render.__ctlV35=true;
  render.__ctlV33=base.__ctlV33===true;
  render.__ctlV31=base.__ctlV31===true;
  render.__ctlV30=true;render.__ctlV29=true;render.__ctlV23=true;
  render.__ctlV23Base=base.__ctlV23Base||null;
  st.render=render;
  stopPeriodicWriters(state);stabilizeTitle(state);
  state.lastSig='';try{st.render();}catch(e){state.lastError=String(e&&e.message||e);}
  if(window.MutationObserver&&document.body){
    state.observer=new MutationObserver(function(ms){var touched=false;for(var i=0;i<ms.length;i++){var t=ms[i].target;if(t&&((t.id==='backtestHistoryPanel')||(t.closest&&t.closest('#backtestHistoryPanel')))){touched=true;break;}}if(touched)Promise.resolve().then(function(){style();stabilizeTitle(state);stopPeriodicWriters(state);});});
    state.observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
  }
  var start=performance.now();
  function sample(){
    if(!state.sampling)return;var p=document.getElementById('backtestHistoryPanel'),title=p&&p.firstElementChild&&p.firstElementChild.firstElementChild;
    if(p&&title){var ps=getComputedStyle(p),ts=getComputedStyle(title),r=title.getBoundingClientRect();state.samples++;if(ps.display==='none'||ps.visibility==='hidden'||Number(ps.opacity)<0.99||ts.visibility==='hidden'||Number(ts.opacity)<0.99||r.width<1||r.height<1)state.badFrames++;}
    if(performance.now()-start<12000)requestAnimationFrame(sample);else state.sampling=false;
  }
  requestAnimationFrame(sample);
  window.addEventListener('ctl-hl-ledger-v32',function(){stopPeriodicWriters(state);stabilizeTitle(state);});
  return true;
}
window.__ctlInstallHistoryZeroFlickerV35=install;
try{install();}catch(e){}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){try{install();}catch(e){}},{once:true});
})();
