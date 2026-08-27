(function(){
'use strict';
var VERSION=30,EPS=1e-12;
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function tm(v){if(typeof v==='number'&&Number.isFinite(v))return v;var x=Date.parse(v||'');return Number.isFinite(x)?x:0;}
function oid(v){return v==null?'':String(v);}
function acct(v){return String(v||'').toLowerCase();}
function coin(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function fmtMoney(v){if(v==null||!Number.isFinite(Number(v)))return'—';v=Number(v);return(v>=0?'+$':'-$')+Math.abs(v).toFixed(4);}
function fmtPct(v){return v!=null&&Number.isFinite(Number(v))?Number(v).toFixed(2)+'%':'—';}
function fmtRR(v){return v!=null&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v).toFixed(2):'—';}
function maps(){
  var m=window.__CTL_HISTORY_MODE_V20__||{},meta=m.meta||{},parents={},childParent={};
  Object.keys(meta.parentBracket||{}).forEach(function(k){if(k)parents[oid(k)]=1;});
  (Array.isArray(meta.triggers)?meta.triggers:[]).forEach(function(t){
    var o=t&&t.order||{},p=oid(t&&t.parentOid),c=oid(o.oid||o.order_id||o.cloid);
    if(p)parents[p]=1;
    if(c&&p)childParent[c]=p;
  });
  return{parents:parents,childParent:childParent};
}
function entryCategory(f,mp){var k=oid(f&&f._hlOid);return k&&mp.parents[k]?'pending':'direct';}
function closeFallbackCategory(f,mp){var k=oid(f&&f._hlOid);return k&&mp.childParent[k]?'pending':'direct';}
function entryKey(f,idx){var a=acct(f&&f._hlAccount),k=oid(f&&f._hlOid);if(k)return a+'|OID|'+k;return a+'|FALLBACK|'+coin(f&&f.symbol)+'|'+tm(f&&f.timestamp)+'|'+n(f&&f.price)+'|'+idx;}
function bucketKey(f){return acct(f&&f._hlAccount)+'|'+coin(f&&f.symbol);}
function build(st){
  var mp=maps(),fills=(Array.isArray(st&&st.fills)?st.fills:[]).slice().sort(function(a,b){return tm(a&&a.timestamp)-tm(b&&b.timestamp);});
  var orders={},buckets={},fallback={pending:0,direct:0};
  function bucket(f){var k=bucketKey(f);return buckets[k]||(buckets[k]=[]);}
  function addEntry(f,qty,idx){
    qty=Math.abs(n(qty,0));if(!(qty>EPS))return null;
    var key=entryKey(f,idx),cat=entryCategory(f,mp),o=orders[key];
    if(!o){o=orders[key]={key:key,category:cat,initial:0,remaining:0,realized:0,first:tm(f&&f.timestamp),last:tm(f&&f.timestamp),symbol:coin(f&&f.symbol),account:acct(f&&f._hlAccount),oid:oid(f&&f._hlOid)};bucket(f).push(o);}
    o.initial+=qty;o.remaining+=qty;o.last=Math.max(o.last,tm(f&&f.timestamp));
    return o;
  }
  function activeTotal(arr){return arr.reduce(function(s,o){return s+(o&&o.remaining>EPS?o.remaining:0);},0);}
  function allocateClose(f,qty,pnl){
    qty=Math.abs(n(qty,0));pnl=n(pnl,0);var arr=bucket(f),total=activeTotal(arr);
    if(!(total>EPS)){fallback[closeFallbackCategory(f,mp)]+=pnl;return;}
    var closeQty=qty>EPS?Math.min(qty,total):total;
    if(!(closeQty>EPS)){fallback[closeFallbackCategory(f,mp)]+=pnl;return;}
    var ratio=Math.min(1,closeQty/total),used=0,live=arr.filter(function(o){return o.remaining>EPS;});
    live.forEach(function(o,i){
      var take=(i===live.length-1)?Math.max(0,closeQty-used):Math.min(o.remaining,o.remaining*ratio);
      take=Math.min(take,o.remaining);used+=take;
      var share=closeQty>EPS?take/closeQty:0;
      o.realized+=pnl*share;o.remaining=Math.max(0,o.remaining-take);o.last=Math.max(o.last,tm(f&&f.timestamp));
    });
    if(qty>total+EPS){var residualRatio=(qty-total)/qty;fallback[closeFallbackCategory(f,mp)]+=pnl*residualRatio;}
  }
  fills.forEach(function(f,idx){
    if(!f)return;var cls=String(f._fillClass||'').toUpperCase(),q=Math.abs(n(f.volume!=null?f.volume:f.lot,0)),p=f.pnl==null?0:n(f.pnl,0);
    if(cls==='ENTRY'||f.is_entry===true){addEntry(f,q,idx);return;}
    if(cls==='FLIP'){
      var arr=bucket(f),before=activeTotal(arr),closeQty=Math.min(q,before);if(closeQty>EPS)allocateClose(f,closeQty,p);
      var openQty=Math.max(0,q-closeQty);if(openQty>EPS)addEntry(f,openQty,idx);return;
    }
    if(cls==='CLOSE'||f.pnl!=null){allocateClose(f,q,p);}
  });
  function metric(cat){
    var os=Object.keys(orders).map(function(k){return orders[k];}).filter(function(o){return cat==='all'||o.category===cat;}),realized=os.reduce(function(s,o){return s+n(o.realized,0);},0)+(cat==='all'?fallback.pending+fallback.direct:fallback[cat]||0),closed=os.filter(function(o){return o.initial>EPS&&o.remaining<=Math.max(EPS,o.initial*1e-9);}),wins=closed.filter(function(o){return o.realized>EPS;}),losses=closed.filter(function(o){return o.realized<-EPS;}),gp=wins.reduce(function(s,o){return s+o.realized;},0),gl=Math.abs(losses.reduce(function(s,o){return s+o.realized;},0)),avgW=wins.length?gp/wins.length:0,avgL=losses.length?gl/losses.length:0,dec=wins.length+losses.length;
    return{pnl:(os.length||Math.abs(realized)>EPS)?realized:null,entries:os.length,prob:dec?wins.length*100/dec:null,rr:avgL>EPS?avgW/avgL:null,closed:closed.length,wins:wins.length,losses:losses.length};
  }
  var pending=metric('pending'),direct=metric('direct'),all=metric('all');
  all.entries=pending.entries+direct.entries;
  all.pnl=(pending.pnl==null&&direct.pnl==null)?null:n(pending.pnl,0)+n(direct.pnl,0);
  return{all:all,pending:pending,direct:direct,orders:orders,fallback:fallback,fillCount:fills.length,parentCount:Object.keys(mp.parents).length};
}
function ensureBar(){var filters=document.getElementById('historyTypeFilters');if(!filters)return null;var b=document.getElementById('ctlHistoryPnlSummaryV11');if(!b){b=document.createElement('div');b.id='ctlHistoryPnlSummaryV11';filters.parentNode.insertBefore(b,filters);}b.style.cssText='display:flex;align-items:center;gap:32px;flex-wrap:wrap;margin:0 0 10px 0;padding:13px 16px;border:1px solid var(--border);border-radius:10px;background:rgba(5,14,26,.78);font-family:JetBrains Mono,monospace;font-size:12px;line-height:1.4;';return b;}
function span(l,v,c){return'<span><span style="color:var(--text-muted);font-weight:700">'+l+'</span> <b style="color:'+c+'">'+v+'</b></span>';}
var cache={sig:'',ledger:null};
function signature(st){var f=Array.isArray(st&&st.fills)?st.fills:[],m=window.__CTL_HISTORY_MODE_V20__,meta=m&&m.meta||{};return[f.length,f[0]&&f[0].trade_id,f[0]&&f[0].timestamp,f[f.length-1]&&f[f.length-1].trade_id,Object.keys(meta.parentBracket||{}).length,(meta.triggers||[]).length].join('|');}
function ledger(st){var s=signature(st);if(cache.sig!==s||!cache.ledger){cache.sig=s;cache.ledger=build(st);}return cache.ledger;}
function paint(st){
  if(!st)return false;var mode=['all','pending','direct'].indexOf(st.mode)>=0?st.mode:'all',l=ledger(st),m=l[mode],b=ensureBar();if(!b)return false;
  b.style.display='flex';b.dataset.metricVersion=String(VERSION);b.dataset.metricMode=mode;b.title='Hyperliquid real ledger: TOTAL ENTRY = unique filled entry OID; PNL = sum real userFills.closedPnl allocated to those entry orders; PROBABILITAS = win rate of fully closed entry orders; RISK/REWARD = average realized win / average realized loss. ALL = PENDING ORDER + LANGSUNG ENTRY.';
  b.innerHTML=span('PNL',fmtMoney(m.pnl),m.pnl==null?'var(--text-muted)':(m.pnl>=0?'var(--green)':'var(--red)'))+span('TOTAL ENTRY',String(n(m.entries,0)),'var(--accent)')+span('PROBABILITAS',fmtPct(m.prob),m.prob!=null&&m.prob>=50?'var(--green)':'var(--gold)')+span('RISK/REWARD',fmtRR(m.rr),m.rr!=null&&m.rr>=1?'var(--green)':'var(--gold)');
  window.__CTL_REAL_METRICS_V30__.lastLedger=l;return true;
}
function install(){
  var st=window.__CTL_HISTORY_STABLE__;if(!st||st.version<10||typeof st.render!=='function'){setTimeout(install,80);return false;}
  var old=window.__CTL_REAL_METRICS_V30__;if(old&&old.ready&&st.render&&st.render.__ctlV30)return true;
  var base=st.render;function render(){var r=base.apply(st,arguments);paint(st);return r;}render.__ctlV30=true;render.__ctlV29=base.__ctlV29===true;render.__ctlV23=base.__ctlV23===true;render.__ctlV23Base=base.__ctlV23Base||null;st.render=render;
  var state={ready:true,version:VERSION,source:'real-userfills-oid-ledger+mutually-exclusive-entry-categories',baseRender:base,lastLedger:null};window.__CTL_REAL_METRICS_V30__=state;
  try{st.render();}catch(e){state.lastError=String(e&&e.message||e);paint(st);}return true;
}
window.__ctlInstallRealMetricsV30=install;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
