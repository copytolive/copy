(function(){
'use strict';
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function tm(v){if(typeof v==='number'&&Number.isFinite(v))return v;var x=Date.parse(v||'');return Number.isFinite(x)?x:0;}
function coin(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function side(x){var s=String(x&&(x.side||x.type||x.direction)||'').toUpperCase();return s.indexOf('SELL')>=0||s==='A'||s.indexOf('SHORT')>=0?'SELL':'BUY';}
function oid(v){return v==null?'':String(v);}
function run(){var st=window.__CTL_HISTORY_STABLE__,v=window.__CTL_HISTORY_MODE_V20__;if(!st||!v||!v.ready||!v.meta)return false;var entries=(st.fills||[]).filter(function(f){return f&&f.is_entry&&oid(f._hlOid);}),changed=false;
  (v.meta.triggers||[]).forEach(function(t){if(t.parentOid)return;var o=t.order||{},acct=String(t.account||''),c=coin(o.coin||o.symbol),trigSide=String(o.side||'').toUpperCase(),expected=trigSide==='A'||trigSide==='SELL'?'BUY':'SELL',qt=Math.abs(n(o.sz!=null?o.sz:o.origSz,0)),ot=n(o.timestamp,0)||tm(t.wrap&&t.wrap.statusTimestamp),best=null,score=Infinity;entries.forEach(function(e){if(String(e._hlAccount||'')!==acct||coin(e.symbol)!==c||side(e)!==expected)return;var et=tm(e.timestamp),dt=ot&&et?Math.abs(ot-et):0;if(ot&&et&&dt>30*60*1000)return;var eq=Math.abs(n(e.volume||e.lot,0)),qpen=qt>0?Math.abs(eq-qt)/Math.max(qt,1e-12):0,s=dt+qpen*60000;if(s<score){score=s;best=e;}});if(best){t.parentOid=oid(best._hlOid);v.meta.parentBracket[t.parentOid]=1;changed=true;}});
  if(changed){var map={};(v.meta.triggers||[]).forEach(function(t){var k=oid(t.order&&(t.order.oid||t.order.order_id||t.order.cloid));if(k&&t.parentOid)map[k]=t.parentOid;});(v.triggerRows||[]).forEach(function(r){if(!r._parentOid&&map[oid(r._hlOid)])r._parentOid=map[oid(r._hlOid)];});if(st.mode!=='all'&&typeof st.render==='function')try{st.render();}catch(e){}}
  return changed;
}
function install(){var old=window.__CTL_HISTORY_MODE_V20_INFER__;if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}var s={ready:true,version:20,timer:setInterval(run,900),run:run};window.__CTL_HISTORY_MODE_V20_INFER__=s;run();return true;}
window.__ctlInstallHlModeV20Infer=install;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();