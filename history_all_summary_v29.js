(function(){
'use strict';
var VERSION=29;
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function fmtMoney(v){if(v==null||!Number.isFinite(Number(v)))return'—';v=Number(v);return(v>=0?'+$':'-$')+Math.abs(v).toFixed(4);}
function fmtPct(v){return v!=null&&Number.isFinite(Number(v))?Number(v).toFixed(2)+'%':'—';}
function fmtRR(v){return v!=null&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v).toFixed(2):'—';}
function oid(v){return v==null?'':String(v);}
function ensureBar(){var filters=document.getElementById('historyTypeFilters');if(!filters)return null;var b=document.getElementById('ctlHistoryPnlSummaryV11');if(!b){b=document.createElement('div');b.id='ctlHistoryPnlSummaryV11';filters.parentNode.insertBefore(b,filters);}b.style.cssText='display:flex;align-items:center;gap:32px;flex-wrap:wrap;margin:0 0 10px 0;padding:13px 16px;border:1px solid var(--border);border-radius:10px;background:rgba(5,14,26,.78);font-family:JetBrains Mono,monospace;font-size:12px;line-height:1.4;';return b;}
function span(l,v,c){return'<span><span style="color:var(--text-muted);font-weight:700">'+l+'</span> <b style="color:'+c+'">'+v+'</b></span>';}
function metrics(st){
  var fills=Array.isArray(st&&st.fills)?st.fills:[],m=window.__CTL_HISTORY_MODE_V20__,pb=m&&m.meta&&m.meta.parentBracket||{},direct=0,parents={};
  fills.forEach(function(f){if(!f||!f.is_entry)return;var k=oid(f._hlOid);if(k&&pb[k])parents[k]=1;else direct++;});
  var closed=fills.filter(function(f){return f&&!f.is_entry&&f.pnl!=null&&Number.isFinite(Number(f.pnl));}),wins=closed.filter(function(f){return n(f.pnl)>1e-12;}),losses=closed.filter(function(f){return n(f.pnl)<-1e-12;}),pnl=closed.reduce(function(s,f){return s+n(f.pnl);},0),gp=wins.reduce(function(s,f){return s+n(f.pnl);},0),gl=Math.abs(losses.reduce(function(s,f){return s+n(f.pnl);},0)),avgW=wins.length?gp/wins.length:0,avgL=losses.length?gl/losses.length:0,dec=wins.length+losses.length;
  return{pnl:closed.length?pnl:null,entries:direct+Object.keys(parents).length,prob:dec?wins.length*100/dec:null,rr:avgL>1e-12?avgW/avgL:null};
}
function paint(st){if(!st||st.mode!=='all')return false;var b=ensureBar();if(!b)return false;var m=metrics(st);b.style.display='flex';b.innerHTML=span('PNL',fmtMoney(m.pnl),m.pnl==null?'var(--text-muted)':(m.pnl>=0?'var(--green)':'var(--red)'))+span('TOTAL ENTRY',String(n(m.entries,0)),'var(--accent)')+span('PROBABILITAS',fmtPct(m.prob),m.prob!=null&&m.prob>=50?'var(--green)':'var(--gold)')+span('RISK/REWARD',fmtRR(m.rr),m.rr!=null&&m.rr>=1?'var(--green)':'var(--gold)');return true;}
function install(){
  var st=window.__CTL_HISTORY_STABLE__;if(!st||st.version<10||typeof st.render!=='function'){setTimeout(install,80);return false;}
  var old=window.__CTL_ALL_SUMMARY_V29__;if(old&&old.ready&&st.render&&st.render.__ctlV29)return true;
  var base=st.render;
  function render(){var r=base.apply(st,arguments);if(st.mode==='all')paint(st);return r;}
  render.__ctlV29=true;render.__ctlV23=base.__ctlV23===true;render.__ctlV23Base=base.__ctlV23Base||null;st.render=render;
  var state={ready:true,version:VERSION,source:'all-summary-only-preserve-pending-direct',baseRender:base};window.__CTL_ALL_SUMMARY_V29__=state;
  if(st.mode==='all'){try{st.render();}catch(e){state.lastError=String(e&&e.message||e);paint(st);}}
  return true;
}
window.__ctlInstallAllSummaryV29=install;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
