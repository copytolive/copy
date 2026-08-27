(function(){
'use strict';
var TICK=900;
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function fmtMoney(v){if(v==null||!Number.isFinite(Number(v)))return'—';v=Number(v);return(v>=0?'+$':'-$')+Math.abs(v).toFixed(4);}
function fmtPct(v){return Number.isFinite(v)?v.toFixed(2)+'%':'—';}
function fmtRR(v){return Number.isFinite(v)&&v>=0?v.toFixed(2):'—';}
function cleanNum(v){v=String(v==null?'':v).replace(/,/g,'').replace(/[^0-9.\-]/g,'');var x=parseFloat(v);return Number.isFinite(x)?x:0;}
function closedMetrics(fills){
  var vals=(fills||[]).filter(function(x){return x&&!x.is_entry&&x.pnl!=null&&Math.abs(n(x.pnl,0))>1e-12;}).map(function(x){return n(x.pnl,0);});
  var wins=vals.filter(function(v){return v>0;}),loss=vals.filter(function(v){return v<0;});
  var sum=vals.reduce(function(a,b){return a+b;},0);
  var avgW=wins.length?wins.reduce(function(a,b){return a+b;},0)/wins.length:0;
  var avgL=loss.length?Math.abs(loss.reduce(function(a,b){return a+b;},0)/loss.length):0;
  return{pnl:sum,prob:vals.length?wins.length*100/vals.length:null,rr:avgL>0?avgW/avgL:null,total:vals.length};
}
function activePendingMetrics(){
  var body=document.getElementById('positionsTableBody');
  if(!body)return{pnl:null,entries:0,rr:null};
  var pnl=0,entries=0,reward=0,risk=0;
  body.querySelectorAll('tr').forEach(function(tr){
    var c=tr.cells;if(!c||c.length<9)return;
    var side=String(c[2]&&c[2].textContent||'').toUpperCase();
    var qty=Math.abs(cleanNum(c[3]&&c[3].textContent));
    var entry=cleanNum(c[4]&&c[4].textContent);
    var sl=cleanNum(c[5]&&c[5].textContent);
    var tp=cleanNum(c[6]&&c[6].textContent);
    var upnl=cleanNum(c[8]&&c[8].textContent);
    if(!(qty>0&&entry>0))return;
    if(!(sl>0||tp>0))return;
    entries++;
    pnl+=upnl;
    var isShort=side.indexOf('SHORT')>=0;
    var rwd=0,rsk=0;
    if(isShort){
      if(tp>0&&tp<entry)rwd=(entry-tp)*qty;
      if(sl>0&&sl>entry)rsk=(sl-entry)*qty;
    }else{
      if(tp>0&&tp>entry)rwd=(tp-entry)*qty;
      if(sl>0&&sl<entry)rsk=(entry-sl)*qty;
    }
    if(rwd>0)reward+=rwd;
    if(rsk>0)risk+=rsk;
  });
  return{pnl:entries?pnl:null,entries:entries,rr:risk>1e-12?reward/risk:null};
}
function ensureBar(){
  var filters=document.getElementById('historyTypeFilters');if(!filters)return null;
  var bar=document.getElementById('ctlHistoryPnlSummaryV11');
  if(!bar){bar=document.createElement('div');bar.id='ctlHistoryPnlSummaryV11';filters.parentNode.insertBefore(bar,filters);}
  bar.style.cssText='display:none;align-items:center;gap:28px;flex-wrap:wrap;margin:0 0 10px 0;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:rgba(5,14,26,.78);font-family:JetBrains Mono,monospace;font-size:11px;line-height:1.4;';
  return bar;
}
function span(label,value,color){return'<span><span style="color:var(--text-muted);font-weight:700">'+label+'</span> <b style="color:'+color+'">'+value+'</b></span>';}
function paint(){
  var st=window.__CTL_HISTORY_STABLE__,bar=ensureBar();if(!st||st.version<10||!bar)return false;
  var mode=st.mode||window._historyTypeFilter||'all';
  var info=document.getElementById('tradeLogInfo');
  if(mode!=='pending'&&mode!=='direct'){bar.style.display='none';if(info)info.style.display='';return true;}
  if(info)info.style.display='none';
  var c=closedMetrics(Array.isArray(st.fills)?st.fills:[]),html='';
  if(mode==='direct'){
    var totalEntry=(st.fills||[]).filter(function(x){return x&&x.is_entry;}).length;
    html+=span('PNL',fmtMoney(c.pnl),c.pnl>=0?'var(--green)':'var(--red)');
    html+=span('TOTAL ENTRY',String(totalEntry),'var(--accent)');
    html+=span('PROBABILITAS',fmtPct(c.prob),c.prob!=null&&c.prob>=50?'var(--green)':'var(--gold)');
    html+=span('RISK/REWARD',fmtRR(c.rr),c.rr!=null&&c.rr>=1?'var(--green)':'var(--gold)');
  }else{
    var p=activePendingMetrics();
    html+=span('PNL',fmtMoney(p.pnl),p.pnl==null?'var(--text-muted)':(p.pnl>=0?'var(--green)':'var(--red)'));
    html+=span('TOTAL ENTRY',String(p.entries),'var(--accent)');
    html+=span('PROBABILITAS',fmtPct(c.prob),c.prob!=null&&c.prob>=50?'var(--green)':'var(--gold)');
    html+=span('RISK/REWARD',fmtRR(p.rr),p.rr!=null&&p.rr>=1?'var(--green)':'var(--gold)');
  }
  bar.innerHTML=html;bar.style.display='flex';return true;
}
function install(){
  var v11=window.__CTL_HL_SUMMARY_V11__;if(v11&&v11.timer)try{clearInterval(v11.timer);}catch(e){}if(v11&&v11.balanceTimer)try{clearInterval(v11.balanceTimer);}catch(e){}
  var v12=window.__CTL_HL_SUMMARY_V12__;if(v12&&v12.timer)try{clearInterval(v12.timer);}catch(e){}
  var old=window.__CTL_HL_SUMMARY_V15__;if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  var state={ready:true,version:15,timer:setInterval(paint,TICK),paint:paint};window.__CTL_HL_SUMMARY_V15__=state;paint();return true;
}
window.__ctlInstallHlSummaryV15=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
