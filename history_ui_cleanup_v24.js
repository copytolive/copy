(function(){
'use strict';
var VERSION=24,POLL=350;
function n(v){var x=Number(v);return Number.isFinite(x)?x:0;}
function txt(v){return String(v==null?'':v).toUpperCase();}
function coin(v){v=txt(v).trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','');}
function pendingKind(o){var t=txt((o&&o._pendingKind)||'')+' '+txt((o&&o.direction)||'')+' '+txt((o&&o.orderType)||'')+' '+txt((o&&o.triggerCondition)||'')+' '+txt((o&&o.tpsl)||'');if(t.indexOf('TAKE PROFIT')>=0||/(^|\W)TP(\W|$)/.test(t))return'TP';if(t.indexOf('STOP')>=0||/(^|\W)SL(\W|$)/.test(t))return'SL';return'';}
function hasCanonicalPending(){
  var pools=[window._hlRealPending,window._allPending,window._sortedPending,(window.__CTL_HISTORY_MODE_V20__&&window.__CTL_HISTORY_MODE_V20__.triggerRows)];
  for(var p=0;p<pools.length;p++){var a=Array.isArray(pools[p])?pools[p]:[];for(var i=0;i<a.length;i++){var o=a[i]||{};if(pendingKind(o)&&n(o.trigger_price||o.triggerPx||o.price||o.limitPx)>0&&Math.abs(n(o.volume||o.lot||o.sz||o.origSz||1))>0)return true;}}
  var pos=Array.isArray(window._hlPosLive)?window._hlPosLive:[],live={};pos.forEach(function(x){if(x&&Math.abs(n(x.szi!=null?x.szi:(x.volume||x.lot)))>0)live[coin(x.coin||x.displayCoin||x.symbolKey||x.symbol)]=1;});
  var map=window._hlSlTpByCoin||{};for(var k in map){if(!Object.prototype.hasOwnProperty.call(map,k))continue;var m=map[k]||{},c=coin(k);if(live[c]&&(n(m.sl)>0||n(m.tp)>0||n(m.stop_loss)>0||n(m.take_profit)>0))return true;}
  return false;
}
function important(el,k,v){if(el&&el.style)try{el.style.setProperty(k,v,'important');}catch(e){}}
function findTradeTitle(){var panel=document.getElementById('backtestHistoryPanel');if(!panel)return null;var nodes=panel.querySelectorAll('div,span');for(var i=0;i<nodes.length;i++){if(String(nodes[i].textContent||'').trim().indexOf('📋 Detailed Trade Log · ALL PAIRS')===0)return nodes[i];}return null;}
function stabilizeTradeLog(){var panel=document.getElementById('backtestHistoryPanel');if(panel){important(panel,'display','block');important(panel,'visibility','visible');important(panel,'opacity','1');important(panel,'animation','none');important(panel,'transition','none');important(panel,'transform','none');}var title=findTradeTitle();if(title){title.id='ctlDetailedTradeLogTitleV24';title.textContent='📋 Detailed Trade Log · ALL PAIRS';important(title,'display','block');important(title,'visibility','visible');important(title,'opacity','1');important(title,'animation','none');important(title,'transition','none');important(title,'transform','none');}}
function hideRetired(){
  var rr=document.getElementById('rrMonitorBox');if(rr){important(rr,'display','none');rr.setAttribute('aria-hidden','true');}
  var rt=document.getElementById('renkoSmaHistoryTable')||document.getElementById('renkoSmaHistoryEmpty')||document.getElementById('renkoSmaHistoryRows');if(rt){var box=rt.closest&&rt.closest('.workspace-renko-history,.section');if(box){important(box,'display','none');box.setAttribute('aria-hidden','true');}}
  var all=document.querySelectorAll('.section-title,div,span');for(var i=0;i<all.length;i++){var t=String(all[i].textContent||'').trim();if(t.indexOf('RENKO SMA10')>=0&&t.indexOf('LIVE HISTORY')>=0){var b=all[i].closest&&all[i].closest('.workspace-renko-history,.section');if(b){important(b,'display','none');b.setAttribute('aria-hidden','true');}}}
  if(document.body&&document.createTreeWalker){var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),node,guard=0;while((node=w.nextNode())&&guard++<12000){if(String(node.nodeValue||'').indexOf('HL CACHE ACCOUNT')>=0)node.nodeValue=String(node.nodeValue||'').replace(/HL CACHE ACCOUNT[^\n]*/g,'').trim();}}
}
function install(){
  var old=window.__CTL_UI_CLEANUP_V24__;if(old){try{if(old.timer)clearInterval(old.timer);}catch(e){}try{if(old.observer)old.observer.disconnect();}catch(e){}}
  var state={ready:true,version:VERSION,source:'trade-log-stable+pending-lastgood+retired-widgets-hidden',timer:null,observer:null,lastPendingHtml:'',lastSummaryHtml:'',lastGoodAt:0,repairs:0};window.__CTL_UI_CLEANUP_V24__=state;
  function inPending(){var st=window.__CTL_HISTORY_STABLE__;return !!(st&&st.mode==='pending');}
  function remember(){if(!inPending())return;var tb=document.getElementById('historyTableBody'),bar=document.getElementById('ctlHistoryPnlSummaryV11');if(!tb)return;var rows=tb.querySelectorAll('tr');if(!rows.length)return;var text=txt(tb.textContent);if(text.indexOf('SL')<0&&text.indexOf('TP')<0)return;state.lastPendingHtml=tb.innerHTML;state.lastSummaryHtml=bar?bar.innerHTML:'';state.lastGoodAt=Date.now();}
  function restore(){if(!inPending()||!hasCanonicalPending())return false;var tb=document.getElementById('historyTableBody'),table=document.getElementById('historyTable'),empty=document.getElementById('emptyHistory'),bar=document.getElementById('ctlHistoryPnlSummaryV11');if(!tb)return false;var bad=tb.querySelectorAll('tr').length===0||(empty&&getComputedStyle(empty).display!=='none')||(table&&getComputedStyle(table).display==='none');if(!bad){remember();return false;}var st=window.__CTL_HISTORY_STABLE__;if(state.lastPendingHtml&&Date.now()-state.lastGoodAt<120000){tb.innerHTML=state.lastPendingHtml;if(bar&&state.lastSummaryHtml)bar.innerHTML=state.lastSummaryHtml;if(table)important(table,'display','table');if(empty)important(empty,'display','none');state.repairs++;return true;}if(st&&typeof st.render==='function'){try{st.render();state.repairs++;}catch(e){state.lastError=String(e&&e.message||e);}return true;}return false;}
  var queued=false;function repairSoon(){if(queued)return;queued=true;Promise.resolve().then(function(){queued=false;stabilizeTradeLog();hideRetired();remember();restore();});}
  function tick(){stabilizeTradeLog();hideRetired();remember();restore();}
  tick();state.timer=setInterval(tick,POLL);
  if(window.MutationObserver&&document.body){state.observer=new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var t=ms[i].target;if(!t)continue;if(t.id==='backtestHistoryPanel'||t.id==='historyTableBody'||t.id==='emptyHistory'||t.id==='rrMonitorBox'||t.id==='renkoSmaHistoryTable'||(t.closest&&t.closest('#backtestHistoryPanel,#historyTableBody,#emptyHistory,#rrMonitorBox,.workspace-renko-history'))){repairSoon();return;}if(ms[i].type==='characterData'&&String(t.nodeValue||'').indexOf('HL CACHE ACCOUNT')>=0){repairSoon();return;}}});state.observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','class']});}
  return true;
}
window.__ctlInstallUiCleanupV24=install;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
