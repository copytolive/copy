(function(){
'use strict';
var TICK=900, REFRESH=9000;
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function coin(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function sideFromPosition(szi){return n(szi,0)>=0?'SELL':'BUY';}
function sideFromDirection(v){v=String(v||'').toUpperCase();return (v.indexOf('SHORT')>=0||v.indexOf('SELL')>=0)?'BUY':'SELL';}
function cleanNumText(v){v=String(v||'').replace(/,/g,'').replace(/[^0-9.\-]/g,'');var x=parseFloat(v);return Number.isFinite(x)?x:0;}
function clone(v){try{return JSON.parse(JSON.stringify(v));}catch(e){return Array.isArray(v)?v.slice():v;}}
function key(x){return [x&&x._pendingSource||'',x&&x.symbol||'',x&&x.side||'',x&&x._pendingKind||'',n(x&&x.trigger_price||x&&x.price,0).toPrecision(12),Math.abs(n(x&&x.volume||x&&x.lot,0)).toPrecision(12)].join('|');}
function dedupe(rows){var seen={},out=[];(rows||[]).forEach(function(x){if(!x)return;var k=key(x);if(seen[k])return;seen[k]=1;out.push(x);});return out;}
function mk(sym,kind,px,vol,exitSide,source,ts){
  if(!(px>0&&vol>0))return null;
  return {order_id:'v14-'+source+'-'+coin(sym)+'-'+kind+'-'+px+'-'+vol,timestamp:new Date(ts||Date.now()).toISOString(),created_at:new Date(ts||Date.now()).toISOString(),symbol:coin(sym)+'/USD',coin:coin(sym),type:exitSide,side:exitSide,direction:kind+' · REDUCE ONLY',volume:vol,lot:vol,price:px,trigger_price:px,pnl:null,_pendingKind:kind,_pendingSource:source,_reduceOnly:true};
}
function fromHlReal(){
  var out=[];(Array.isArray(window._hlRealPending)?window._hlRealPending:[]).forEach(function(o){
    if(!o)return;var sym=o.symbol||o.coin,vol=Math.abs(n(o.lot!=null?o.lot:o.volume,0)),px=n(o.trigger_price||o.price,0);if(!(vol>0&&px>0))return;
    var k=String(o._exitKind||o.pool_status||o.order_type||'').toUpperCase();if(k.indexOf('TAKE PROFIT')>=0||k==='TP')k='TP';else if(k.indexOf('STOP')>=0||k==='SL')k='SL';else k='LIMIT';
    var dir=String(o.direction||o.side||'').toUpperCase(),exitSide=(dir.indexOf('LONG')>=0||dir==='BUY')?'BUY':'SELL';
    out.push({order_id:o.order_id||('v14-real-'+coin(sym)+'-'+k+'-'+px+'-'+vol),timestamp:o.created_at||o.timestamp||new Date().toISOString(),created_at:o.created_at||o.timestamp||new Date().toISOString(),symbol:coin(sym)+'/USD',coin:coin(sym),type:exitSide,side:exitSide,direction:k+(o._reduceOnly?' · REDUCE ONLY':''),volume:vol,lot:vol,price:px,trigger_price:px,pnl:null,_pendingKind:k,_pendingSource:'HL_OPEN',_reduceOnly:!!o._reduceOnly});
  });return dedupe(out);
}
function fromHlSlTpMap(){
  var out=[],map=window._hlSlTpByCoin||{},pos=Array.isArray(window._hlPosLive)?window._hlPosLive:[];
  pos.forEach(function(p){if(!p)return;var raw=String(p.coin||p.displayCoin||p.symbolKey||''),disp=coin(raw),m=map[raw]||map[disp]||map[String(raw).toUpperCase()]||{},vol=Math.abs(n(p.szi,0)),exitSide=sideFromPosition(p.szi);if(!(vol>0))return;var sl=n(m.sl,0),tp=n(m.tp,0),x;if(sl>0){x=mk(disp,'SL',sl,vol,exitSide,'HL_OPEN');if(x)out.push(x);}if(tp>0){x=mk(disp,'TP',tp,vol,exitSide,'HL_OPEN');if(x)out.push(x);}});return dedupe(out);
}
function fromEngine(){
  var liveCoins={};(Array.isArray(window._hlPosLive)?window._hlPosLive:[]).forEach(function(p){liveCoins[coin(p&&(p.coin||p.displayCoin||p.symbolKey))]=p;});
  var out=[];(Array.isArray(window._enginePositions)?window._enginePositions:[]).forEach(function(p,i){if(!p)return;var sym=coin(p.symbol||p.coin),live=liveCoins[sym];if(Object.keys(liveCoins).length&&!live)return;var vol=Math.abs(n(live&&live.szi,0))||Math.abs(n(p.lot!=null?p.lot:(p.volume!=null?p.volume:(p.size!=null?p.size:p.szi)),0));if(!(vol>0))return;var sl=n(p.stop_loss!=null?p.stop_loss:(p.sl!=null?p.sl:p.stopLoss),0),tp=n(p.take_profit!=null?p.take_profit:(p.tp!=null?p.tp:p.takeProfit),0),exitSide=live?sideFromPosition(live.szi):sideFromDirection(p.direction||p.side||p.type),x;if(sl>0){x=mk(sym,'SL',sl,vol,exitSide,'ENGINE_TARGET',p.timestamp||p.created_at);if(x)out.push(x);}if(tp>0){x=mk(sym,'TP',tp,vol,exitSide,'ENGINE_TARGET',p.timestamp||p.created_at);if(x)out.push(x);}});return dedupe(out);
}
function fromPositionTable(){
  var body=document.getElementById('positionsTableBody');if(!body)return[];var out=[];body.querySelectorAll('tr').forEach(function(tr){var c=tr.cells;if(!c||c.length<7)return;var sym=coin(c[1]&&c[1].textContent||c[0]&&c[0].textContent),dir=String(c[2]&&c[2].textContent||'').toUpperCase(),vol=Math.abs(cleanNumText(c[3]&&c[3].textContent)),sl=cleanNumText(c[5]&&c[5].textContent),tp=cleanNumText(c[6]&&c[6].textContent),exitSide=dir.indexOf('SHORT')>=0?'BUY':'SELL',x;if(!(vol>0))return;if(sl>0){x=mk(sym,'SL',sl,vol,exitSide,'ENGINE_TARGET');if(x)out.push(x);}if(tp>0){x=mk(sym,'TP',tp,vol,exitSide,'ENGINE_TARGET');if(x)out.push(x);}});return dedupe(out);
}
function signature(rows){return (rows||[]).map(key).sort().join('~');}
function install(){
  var prev=window.__CTL_HL_PENDING_BRIDGE_V14__;if(prev&&prev.timer)try{clearInterval(prev.timer);}catch(e){}if(prev&&prev.refreshTimer)try{clearInterval(prev.refreshTimer);}catch(e){}
  var state={ready:true,version:14,timer:null,refreshTimer:null,lastSig:'',source:''};window.__CTL_HL_PENDING_BRIDGE_V14__=state;
  function sync(){var st=window.__CTL_HISTORY_STABLE__;if(!st||st.version<10)return false;var real=fromHlReal(),mapRows=fromHlSlTpMap(),engine=fromEngine(),dom=fromPositionTable();var hl=dedupe(real.concat(mapRows)),targets=dedupe(engine.concat(dom));if(hl.length){st.exchange=hl;state.source='hl-real/map';}if(targets.length){st.engine=targets;state.source+=(state.source?'+':'')+'position-target';}
    var combined=dedupe((Array.isArray(st.exchange)?st.exchange:[]).concat(Array.isArray(st.engine)?st.engine:[])),sig=signature(combined);if(sig!==state.lastSig){state.lastSig=sig;if(typeof st.render==='function'&&!st.rendering)try{st.render();}catch(e){}}return !!combined.length;}
  function refresh(){try{if(typeof window.fetchStatus==='function')window.fetchStatus();}catch(e){}try{if(typeof window.fetchDashboardData==='function')window.fetchDashboardData();}catch(e){}setTimeout(sync,500);}
  state.sync=sync;state.refresh=refresh;state.timer=setInterval(sync,TICK);state.refreshTimer=setInterval(function(){var st=window.__CTL_HISTORY_STABLE__;if(!st||st.mode!=='pending')return;var has=(Array.isArray(st.exchange)&&st.exchange.length)||(Array.isArray(st.engine)&&st.engine.length);if(!has)refresh();},REFRESH);setTimeout(function(){sync();refresh();},250);return true;
}
window.__ctlInstallHlPendingBridgeV14=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
