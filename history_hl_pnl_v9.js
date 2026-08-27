(function(){
'use strict';
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function c(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function t(v){var x=Date.parse(v||'');return Number.isFinite(x)?x:0;}
function dirOfFill(x){var d=String(x&& (x._hlDir||x.direction)||'').toUpperCase();if(d.indexOf('LONG')>=0)return'LONG';if(d.indexOf('SHORT')>=0)return'SHORT';var s=String(x&& (x.side||x.type)||'').toUpperCase();return s.indexOf('SELL')>=0?'SHORT':'LONG';}
function closeDir(x){var d=String(x&& (x._hlDir||x.direction)||'').toUpperCase();if(d.indexOf('CLOSE LONG')>=0||d.indexOf('LONG')>=0)return'LONG';if(d.indexOf('CLOSE SHORT')>=0||d.indexOf('SHORT')>=0)return'SHORT';var s=String(x&& (x.side||x.type)||'').toUpperCase();return s.indexOf('SELL')>=0?'LONG':'SHORT';}
function fillKey(x){return [x&&x._hlAccount||'',c(x&&x.symbol),x&&x.trade_id||'',x&&x.timestamp||'',n(x&&x.price),n(x&&x.volume)].join('|');}
function lotBucket(state,x,dir){var k=[x&&x._hlAccount||'',c(x&&x.symbol),dir].join('|');return state[k]||(state[k]=[]);}
function buildEntryResults(fills){
  var ordered=(fills||[]).slice().sort(function(a,b){return t(a&&a.timestamp)-t(b&&b.timestamp);}),state={},result={};
  ordered.forEach(function(x){
    if(!x)return;var qty=Math.abs(n(x.volume!=null?x.volume:x.lot,0));if(!(qty>0))return;
    if(x.is_entry){
      var d=dirOfFill(x),lot={key:fillKey(x),qty:qty,remaining:qty,realized:0,allocated:false,dir:d,entry:n(x.price!=null?x.price:x.entry_price,0),symbol:c(x.symbol),account:x._hlAccount||''};
      lotBucket(state,x,d).push(lot);result[lot.key]=lot;return;
    }
    if(x.pnl==null)return;
    var pnl=n(x.pnl,0),dclose=closeDir(x),bucket=lotBucket(state,x,dclose),left=qty,matched=[];
    for(var i=0;i<bucket.length&&left>1e-12;i++){
      var lot=bucket[i];if(!(lot.remaining>1e-12))continue;var use=Math.min(lot.remaining,left);matched.push([lot,use]);left-=use;
    }
    var matchedQty=matched.reduce(function(s,m){return s+m[1];},0);if(!(matchedQty>0))return;
    matched.forEach(function(m){var lot=m[0],use=m[1],share=pnl*(use/matchedQty);lot.realized+=share;lot.remaining=Math.max(0,lot.remaining-use);lot.allocated=true;});
  });
  return result;
}
function livePosMap(){var m={};(Array.isArray(window._hlPosLive)?window._hlPosLive:[]).forEach(function(p){if(!p)return;var k=c(p.displayCoin||p.coin||p.symbolKey);if(k!=='-')m[k]=p;});return m;}
function directPnl(x,entryMap,posMap){
  var lot=entryMap[fillKey(x)];if(!lot)return null;var value=lot.realized,label=lot.allocated?'REAL':'',open=lot.remaining>1e-12,pos=posMap[lot.symbol];
  if(open&&pos&&n(pos.current,0)>0&&n(lot.entry,0)>0){var q=Math.min(lot.remaining,Math.abs(n(pos.szi,0))||lot.remaining),mark=n(pos.current,0),u=(lot.dir==='LONG'?(mark-lot.entry):(lot.entry-mark))*q;value+=u;label='LIVE';}
  if(!lot.allocated&&label!=='LIVE')return null;return{value:value,label:label||'REAL',title:(label==='LIVE'?'Realized + floating PnL allocated to this entry fill.':'Realized PnL allocated FIFO from matching Hyperliquid close fills.')};
}
function entryForPending(o,fills){
  var account=String(o&&o._hlAccount||''),sym=c(o&&o.symbol),ot=t(o&& (o.timestamp||o.created_at)),best=null,bestScore=Infinity;
  (fills||[]).forEach(function(f){if(!f||!f.is_entry||c(f.symbol)!==sym)return;if(account&&String(f._hlAccount||'')!==account)return;var ft=t(f.timestamp),score=ot&&ft?Math.abs(ot-ft):0;if(ot&&ft&&ft>ot+120000)return;if(score<bestScore){best=f;bestScore=score;}});
  return best;
}
function pendingPnl(o,fills,posMap){
  var px=n(o&& (o.trigger_price!=null?o.trigger_price:(o.price!=null?o.price:o.limit_price)),0),qty=Math.abs(n(o&& (o.volume!=null?o.volume:o.lot),0));if(!(px>0&&qty>0))return null;
  var sym=c(o.symbol),entry=entryForPending(o,fills),ep=entry?n(entry.price!=null?entry.price:entry.entry_price,0):0,dir=entry?dirOfFill(entry):'';
  if(!(ep>0)){
    var pos=posMap[sym];if(pos&&n(pos.entry,0)>0){ep=n(pos.entry);dir=n(pos.szi,0)>=0?'LONG':'SHORT';}
  }
  if(!(ep>0&&dir))return null;
  var value=(dir==='LONG'?(px-ep):(ep-px))*qty;
  return{value:value,label:'EST',title:'Estimasi PnL jika order pending ini terpicu pada harga target. Belum realized.'};
}
function fmt(r){var sign=r.value>=0?'+$':'-$';return (r.label?r.label+' ':'')+sign+Math.abs(r.value).toFixed(4);}
function paint(){
  var st=window.__CTL_HISTORY_V8_OVERLAY__,tbody=document.getElementById('historyTableBody');if(!st||!st.ready||!tbody)return false;
  var mode=st.mode||window._historyTypeFilter||'all';if(mode!=='direct'&&mode!=='pending')return true;
  var rows=mode==='direct'?(st.fills||[]).filter(function(x){return x&&x.is_entry;}):(st.pending||[]),max=Math.min(rows.length,st.shown||20),entryMap=buildEntryResults(st.fills||[]),posMap=livePosMap(),trs=tbody.querySelectorAll('tr');
  for(var i=0;i<trs.length&&i<max;i++){
    var x=rows[i],cells=trs[i].children;if(!x||!cells||cells.length<8)continue;var r=mode==='direct'?directPnl(x,entryMap,posMap):pendingPnl(x,st.fills||[],posMap),cell=cells[7];
    if(!r){cell.textContent='—';cell.style.color='var(--text-muted)';cell.title=mode==='direct'?'Belum ada realized/floating PnL yang dapat dipasangkan secara aman ke entry ini.':'Belum ada entry reference yang cukup untuk menghitung estimasi PnL.';continue;}
    cell.textContent=fmt(r);cell.style.color=r.value>1e-12?'var(--green)':(r.value<-1e-12?'var(--red)':'var(--text-muted)');cell.title=r.title;
  }
  window.__CTL_HL_PNL_V9__.lastPaint=Date.now();return true;
}
function install(){
  var old=window.__CTL_HL_PNL_V9__;if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  var state={ready:true,version:9,apply:paint,timer:null,lastPaint:0};window.__CTL_HL_PNL_V9__=state;
  state.timer=setInterval(function(){var g=window.__CTL_HISTORY_V8_DOM_GUARD__;if(g&&g.suppress)return;var st=window.__CTL_HISTORY_V8_OVERLAY__;if(!st||!st.ready)return;var tb=document.getElementById('historyTableBody');if(!tb)return;var first=tb.querySelector('tr td:nth-child(8)');if((st.mode==='direct'||st.mode==='pending')&&first&&first.textContent.trim()==='—'){try{paint();}catch(e){}}},1200);
  try{paint();}catch(e){}return true;
}
window.__ctlInstallHlPnlV9=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
