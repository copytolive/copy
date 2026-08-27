(function(){
'use strict';
var TICK=1000, BACKUP='ctl_hl_pending_backup_v12';
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function coin(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function side(x){var s=String(x&&(x.side||x.type||x.direction)||'').toUpperCase();return s.indexOf('SELL')>=0||s.indexOf('SHORT')>=0?'SELL':'BUY';}
function tm(v){if(typeof v==='number'&&Number.isFinite(v))return v;var x=Date.parse(v||'');return Number.isFinite(x)?x:0;}
function clone(v){try{return JSON.parse(JSON.stringify(v));}catch(e){return Array.isArray(v)?v.slice():v;}}
function fmtMoney(v){v=n(v,0);return (v>=0?'+$':'-$')+Math.abs(v).toFixed(4);}
function fmtPct(v){return Number.isFinite(v)?v.toFixed(2)+'%':'—';}
function fmtRR(v){return Number.isFinite(v)?v.toFixed(2):'—';}
function safe(raw){try{return JSON.parse(raw||'null');}catch(e){return null;}}
function loadBackup(){try{var x=safe(localStorage.getItem(BACKUP));if(x&&Array.isArray(x.rows)&&x.rows.length)return x;}catch(e){}return null;}
function saveBackup(rows){if(!Array.isArray(rows)||!rows.length)return;try{localStorage.setItem(BACKUP,JSON.stringify({at:Date.now(),rows:clone(rows.slice(0,2200))}));}catch(e){}}
function scanLegacy(){var best=null;function scan(store){try{for(var i=0;i<store.length;i++){var k=store.key(i);if(!k)continue;if(k.indexOf('ctl_hl_open_v7:')!==0&&k!=='ctl_hl_last_good_open_v10')continue;var x=safe(store.getItem(k));if(x&&Array.isArray(x.rows)&&x.rows.length&&(!best||x.rows.length>best.rows.length))best=x;}}catch(e){}}scan(sessionStorage);scan(localStorage);return best;}
function restorePending(st){
  if(!st||st.version<10)return false;
  if(Array.isArray(st.exchange)&&st.exchange.length){saveBackup(st.exchange);return false;}
  if(Array.isArray(st.pending)&&st.pending.length){var hl=st.pending.filter(function(x){return x&&x._pendingSource!=='ENGINE_TARGET';});if(hl.length){saveBackup(hl);return false;}}
  if(!st.lastError)return false;
  var b=loadBackup()||scanLegacy();if(!b||!Array.isArray(b.rows)||!b.rows.length)return false;
  st.exchange=clone(b.rows);st.lastOpenGood=b.at||Date.now();st.openSource='restored-last-good';
  saveBackup(st.exchange);
  return true;
}
function closedMetrics(fills){
  var vals=(fills||[]).filter(function(x){return x&&!x.is_entry&&x.pnl!=null&&Math.abs(n(x.pnl,0))>1e-12;}).map(function(x){return n(x.pnl,0);});
  var wins=vals.filter(function(v){return v>0;}),loss=vals.filter(function(v){return v<0;}),sum=vals.reduce(function(a,b){return a+b;},0),avgW=wins.length?wins.reduce(function(a,b){return a+b;},0)/wins.length:0,avgL=loss.length?Math.abs(loss.reduce(function(a,b){return a+b;},0)/loss.length):0;
  return{pnl:sum,prob:vals.length?wins.length*100/vals.length:null,rr:avgL>0?avgW/avgL:null,total:vals.length};
}
function livePosMap(){var m={};(Array.isArray(window._hlPosLive)?window._hlPosLive:[]).forEach(function(p){var k=coin(p&&(p.displayCoin||p.coin||p.symbolKey));if(k!=='-')m[k]=p;});return m;}
function dirEntry(x){var d=String(x&&(x._hlDir||x.direction)||'').toUpperCase();if(d.indexOf('LONG')>=0)return'LONG';if(d.indexOf('SHORT')>=0)return'SHORT';return side(x)==='SELL'?'SHORT':'LONG';}
function pendingPnl(o,fills,pos){var px=n(o&&(o.trigger_price||o.price||o.limit_price),0),q=Math.abs(n(o&&(o.volume||o.lot),0));if(!(px>0&&q>0))return null;var sym=coin(o.symbol),p=pos[sym],ep=p&&n(p.entry,0)>0?n(p.entry):0,dir=p?(n(p.szi,0)>=0?'LONG':'SHORT'):'';if(!ep){var best=null;(fills||[]).forEach(function(f){if(!f||!f.is_entry||coin(f.symbol)!==sym)return;if(o._hlAccount&&f._hlAccount!==o._hlAccount)return;if(!best||tm(f.timestamp)>tm(best.timestamp))best=f;});if(best){ep=n(best.price,0);dir=dirEntry(best);}}if(!(ep>0&&dir))return null;return(dir==='LONG'?(px-ep):(ep-px))*q;}
function pendingMetrics(st){var fills=Array.isArray(st.fills)?st.fills:[],pending=Array.isArray(st.pending)?st.pending:[],pos=livePosMap(),groups={},tp=0,sl=0;pending.forEach(function(o){if(!o)return;var v=pendingPnl(o,fills,pos);if(v==null)return;var key=[o._hlAccount||'',coin(o.symbol),Math.abs(n(o.volume||o.lot,0)).toFixed(8)].join('|'),g=groups[key]||(groups[key]={tp:[],sl:[]}),k=String(o._pendingKind||'').toUpperCase();if(k==='TP')g.tp.push(v);else if(k==='SL')g.sl.push(Math.abs(v));});Object.keys(groups).forEach(function(k){var g=groups[k];if(g.tp.length)tp+=Math.max.apply(null,g.tp);if(g.sl.length)sl+=Math.max.apply(null,g.sl);});var c=closedMetrics(fills);return{pnlText:'TP '+fmtMoney(tp)+' / SL '+fmtMoney(-sl),entries:Object.keys(groups).length,prob:c.prob,rr:sl>0?tp/sl:null};}
function ensureBar(){var filters=document.getElementById('historyTypeFilters');if(!filters)return null;var bar=document.getElementById('ctlHistoryPnlSummaryV11');if(!bar){bar=document.createElement('div');bar.id='ctlHistoryPnlSummaryV11';filters.parentNode.insertBefore(bar,filters);}bar.style.cssText='display:none;align-items:center;gap:22px;flex-wrap:wrap;margin:0 0 10px 0;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:rgba(5,14,26,.78);font-family:JetBrains Mono,monospace;font-size:11px;line-height:1.4;';return bar;}
function span(label,value,color){return '<span><span style="color:var(--text-muted);font-weight:700">'+label+'</span> <b style="color:'+color+'">'+value+'</b></span>';}
function paint(){var st=window.__CTL_HISTORY_STABLE__,bar=ensureBar();if(!st||st.version<10||!bar)return false;var restored=restorePending(st);if(restored&&typeof st.render==='function'&&!st.rendering){try{st.render();}catch(e){}}var mode=st.mode||window._historyTypeFilter||'all';if(mode!=='pending'&&mode!=='direct'){bar.style.display='none';return true;}var c=closedMetrics(Array.isArray(st.fills)?st.fills:[]),html='';if(mode==='direct'){var totalEntry=(st.fills||[]).filter(function(x){return x&&x.is_entry;}).length;html+=span('PNL',fmtMoney(c.pnl),c.pnl>=0?'var(--green)':'var(--red)');html+=span('TOTAL ENTRY',String(totalEntry),'var(--accent)');html+=span('PROBABILITAS',fmtPct(c.prob),c.prob!=null&&c.prob>=50?'var(--green)':'var(--gold)');html+=span('RISK/REWARD',fmtRR(c.rr),c.rr!=null&&c.rr>=1?'var(--green)':'var(--gold)');}else{var p=pendingMetrics(st);html+=span('PNL',p.pnlText,'var(--accent)');html+=span('TOTAL ENTRY',String(p.entries),'var(--accent)');html+=span('PROBABILITAS',fmtPct(p.prob),p.prob!=null&&p.prob>=50?'var(--green)':'var(--gold)');html+=span('RISK/REWARD',fmtRR(p.rr),p.rr!=null&&p.rr>=1?'var(--green)':'var(--gold)');}bar.innerHTML=html;bar.style.display='flex';return true;}
function install(){var old=window.__CTL_HL_SUMMARY_V11__;if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}if(old&&old.balanceTimer)try{clearInterval(old.balanceTimer);}catch(e){}var prev=window.__CTL_HL_SUMMARY_V12__;if(prev&&prev.timer)try{clearInterval(prev.timer);}catch(e){}var state={ready:true,version:12,timer:setInterval(paint,TICK),paint:paint};window.__CTL_HL_SUMMARY_V12__=state;paint();return true;}
window.__ctlInstallHlSummaryV12=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
