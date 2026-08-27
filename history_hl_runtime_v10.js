(function(){
'use strict';

var HL='https://api.hyperliquid.xyz/info';
var POLL=7000, PAGE=20, DEX_CACHE_MS=300000;
var FILL_CACHE='ctl_hl_last_good_fills_v10';
var OPEN_CACHE='ctl_hl_last_good_open_v10';
var PROVEN_CACHE='ctl_hl_proven_accounts_v10';

function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function validWallet(v){return /^0x[a-fA-F0-9]{40}$/.test(String(v||'').trim());}
function lower(v){return validWallet(v)?String(v).trim().toLowerCase():'';}
function clone(v){try{return JSON.parse(JSON.stringify(v));}catch(e){return Array.isArray(v)?v.slice():v;}}
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}
function coin(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function uniq(a){var seen={},out=[];(a||[]).forEach(function(v){v=lower(v);if(v&&!seen[v]){seen[v]=1;out.push(v);}});return out;}
function add(out,v){v=lower(v);if(v&&out.indexOf(v)<0)out.push(v);}
function tm(v){if(typeof v==='number'&&Number.isFinite(v))return v;var x=Date.parse(v||'');return Number.isFinite(x)?x:0;}
function fmtTime(v){var x=tm(v);if(!x)return String(v||'-').replace('T',' ').slice(0,19);var d=new Date(x);return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}
function fmtPx(v){v=n(v,0);if(!v)return'—';if(v>=1000)return v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});if(v>=1)return v.toFixed(5).replace(/0+$/,'').replace(/\.$/,'');return v.toFixed(7).replace(/0+$/,'').replace(/\.$/,'');}
function side(x){var s=String(x&&(x.side||x.type||x.direction)||'').toUpperCase();return s.indexOf('SELL')>=0||s.indexOf('SHORT')>=0?'SELL':'BUY';}
function safeJson(raw){try{return JSON.parse(raw||'null');}catch(e){return null;}}
function compactRows(rows){return (rows||[]).slice(0,2200).map(function(x){var y=clone(x);if(y&&y._raw)delete y._raw;return y;});}
function store(key,obj){try{localStorage.setItem(key,JSON.stringify(obj));}catch(e){try{sessionStorage.setItem(key,JSON.stringify(obj));}catch(_){}}}
function load(key){var x=null;try{x=safeJson(localStorage.getItem(key));}catch(e){}if(!x)try{x=safeJson(sessionStorage.getItem(key));}catch(e){}return x;}
function sessionEmail(){try{var u=safeJson(localStorage.getItem('session_user'));return u&&u.email?String(u.email).trim().toLowerCase():'';}catch(e){return'';}}

async function post(body,ms){
  var c=new AbortController(),timer=setTimeout(function(){c.abort();},ms||10000);
  try{
    var r=await fetch(HL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:c.signal});
    if(!r.ok)throw new Error('HL '+r.status+' '+body.type);
    var d=await r.json();if(d&&d.error)throw new Error(String(d.error));return d;
  } finally {clearTimeout(timer);}
}

function oldSessionCache(prefix){
  var best=null;
  try{
    for(var i=0;i<sessionStorage.length;i++){
      var k=sessionStorage.key(i);if(!k||k.indexOf(prefix)!==0)continue;
      var x=safeJson(sessionStorage.getItem(k));
      if(x&&Array.isArray(x.rows)&&x.rows.length&&(!best||x.rows.length>best.rows.length))best=x;
    }
  }catch(e){}
  return best;
}

function candidateSeeds(){
  var out=[],email=sessionEmail(),proven=load(PROVEN_CACHE);
  if(proven&&Array.isArray(proven.accounts))proven.accounts.forEach(function(a){add(out,a);});
  add(out,window._hlAccountWallet);add(out,window._userWallet);
  if(email){
    try{add(out,localStorage.getItem('ot_wallet_'+email));}catch(e){}
    try{add(out,localStorage.getItem('ctl_hl_account_wallet_v3:'+encodeURIComponent(email)));}catch(e){}
    try{var rr=safeJson(localStorage.getItem('ctl_hl_resolution_v3:'+encodeURIComponent(email)));if(rr){add(out,rr.account);add(out,rr.owner);}}catch(e){}
  }
  add(out,window._pagesHlActiveWallet);add(out,window._hlActiveWallet);add(out,window._hlSelectedWallet);add(out,window._userAddress);add(out,window._hlAgentWallet);
  try{if(typeof window.activeHyperliquidWallet==='function')add(out,window.activeHyperliquidWallet());}catch(e){}
  var old=oldSessionCache('ctl_hl_fills_v7:');if(old&&Array.isArray(old.rows))old.rows.slice(0,50).forEach(function(x){add(out,x&&x._hlAccount);});
  return uniq(out).slice(0,24);
}

async function resolveFamily(seeds){
  var out=uniq(seeds),masters=[];
  async function inspect(a){
    try{
      var r=await post({type:'userRole',user:a},6500),role=String(r&&r.role||'').toLowerCase();
      if(role==='agent'&&validWallet(r&&r.data&&r.data.user)){add(out,r.data.user);add(masters,r.data.user);}
      else if(role==='subaccount'&&validWallet(r&&r.data&&r.data.master)){add(out,r.data.master);add(masters,r.data.master);}
      else if(role==='user')add(masters,a);
    }catch(e){}
  }
  await Promise.all(out.slice(0,10).map(inspect));
  for(var i=0;i<masters.length&&i<8;i++){
    try{var s=await post({type:'subAccounts',user:masters[i]},7500);if(Array.isArray(s))s.forEach(function(x){add(out,x&&x.subAccountUser);});}catch(e){}
  }
  return uniq(out).slice(0,28);
}

var dexCache={at:0,list:['']};
async function dexes(){
  if(Date.now()-dexCache.at<DEX_CACHE_MS)return dexCache.list.slice();
  var list=[''];
  try{var d=await post({type:'perpDexs'},8000);if(Array.isArray(d))d.forEach(function(x){var nm=typeof x==='string'?x:(x&&typeof x.name==='string'?x.name:(Array.isArray(x)?x[0]:''));nm=String(nm||'').trim();if(nm&&list.indexOf(nm)<0)list.push(nm);});}catch(e){}
  dexCache={at:Date.now(),list:list.slice(0,16)};return dexCache.list.slice();
}

function classifyFill(f){
  var dir=String(f&&f.dir||'').trim().toLowerCase();
  if(/^open\b/.test(dir))return'ENTRY';
  if(/^close\b/.test(dir))return'CLOSE';
  var sp=Number(f&&f.startPosition),sz=Math.abs(Number(f&&f.sz));
  if(Number.isFinite(sp)&&Number.isFinite(sz)&&sz>0){
    var s=String(f.side||'').toUpperCase(),delta=(s==='B'||s==='BUY')?sz:-sz,end=sp+delta;
    if(Math.abs(sp)<1e-12&&Math.abs(end)>1e-12)return'ENTRY';
    if(sp*end>0&&Math.abs(end)>Math.abs(sp)+1e-12)return'ENTRY';
    if(sp*end>0&&Math.abs(end)<Math.abs(sp)-1e-12)return'CLOSE';
    if(sp*end<0)return'FLIP';
  }
  return Math.abs(n(f&&f.closedPnl,0))>1e-12?'CLOSE':'UNKNOWN';
}
function normFill(f,acct){
  if(!f)return null;var t=n(f.time,0)||tm(f.timestamp),cls=classifyFill(f),s=String(f.side||'').toUpperCase(),buy=s==='B'||s==='BUY',c=coin(f.coin||f.symbol),px=n(f.px!=null?f.px:f.price,0),sz=n(f.sz!=null?f.sz:f.volume,0),pnl=cls==='ENTRY'?null:n(f.closedPnl!=null?f.closedPnl:f.pnl,0);
  return{trade_id:f.tid||f.trade_id||f.oid||f.order_id||(acct+'-'+c+'-'+t+'-'+px+'-'+sz),timestamp:t?new Date(t).toISOString():String(f.timestamp||''),symbol:c+'/USD',coin:c,type:buy?'BUY':'SELL',side:buy?'BUY':'SELL',direction:String(f.dir||cls),volume:sz,lot:sz,price:px,entry_price:px,pnl:pnl,is_entry:cls==='ENTRY',_fillClass:cls,_hlDir:String(f.dir||''),_hlAccount:acct,_hlOid:f.oid||null};
}
async function fetchFills(accts){
  var rs=await Promise.allSettled(accts.map(function(a){return post({type:'userFills',user:a,aggregateByTime:true},9000);})),all=[],ok=0,nonemptyAccounts=[];
  rs.forEach(function(r,i){if(r.status==='fulfilled'&&Array.isArray(r.value)){ok++;if(r.value.length)nonemptyAccounts.push(accts[i]);r.value.forEach(function(f){var x=normFill(f,accts[i]);if(x)all.push(x);});}});
  if(!ok)throw new Error('Semua userFills gagal');
  var seen={},out=[];all.forEach(function(x){var k=[x._hlAccount,x.trade_id,x.timestamp,x.symbol,x.price,x.volume].join('|');if(seen[k])return;seen[k]=1;out.push(x);});
  out.sort(function(a,b){return tm(b.timestamp)-tm(a.timestamp);});return{rows:out,ok:ok,nonemptyAccounts:uniq(nonemptyAccounts)};
}

function pendingKind(o){var txt=(String(o&&o.orderType||'')+' '+String(o&&o.triggerCondition||'')).toUpperCase();if(txt.indexOf('TAKE PROFIT')>=0||/(^|\W)TP(\W|$)/.test(txt))return'TP';if(txt.indexOf('STOP')>=0||/(^|\W)SL(\W|$)/.test(txt))return'SL';if(o&&(o.isPositionTpsl||o.isPositionTpSl))return'TP/SL';if(o&&(o.isTrigger||n(o.triggerPx,0)>0))return'TRIGGER';return'LIMIT';}
function normOrder(o,acct,dex,parent){
  if(!o)return null;parent=parent||{};var c=coin(o.coin||parent.coin||o.symbol),s=String(o.side||parent.side||'').toUpperCase(),sell=s==='A'||s==='SELL',trigger=n(o.triggerPx,0),limit=n(o.limitPx!=null?o.limitPx:o.px,0),t=n(o.timestamp,0)||n(o.time,0)||n(parent.timestamp,0)||Date.now(),kind=pendingKind(o),vol=n(o.sz!=null?o.sz:(o.origSz!=null?o.origSz:parent.sz),0);
  return{order_id:o.oid||o.order_id||o.cloid||('hl-'+acct+'-'+c+'-'+t+'-'+kind),oid:o.oid||o.order_id||null,timestamp:new Date(t).toISOString(),created_at:new Date(t).toISOString(),symbol:c+'/USD',coin:c,type:sell?'SELL':'BUY',side:sell?'SELL':'BUY',direction:kind+(o.reduceOnly?' · REDUCE ONLY':''),volume:vol,lot:vol,price:trigger||limit,limit_price:limit,trigger_price:trigger,pnl:null,_pendingKind:kind,_pendingSource:'HL_OPEN',_hlAccount:acct,_hlDex:dex||'main',_reduceOnly:!!o.reduceOnly,_orderType:String(o.orderType||''),_triggerCondition:String(o.triggerCondition||'')};
}
function flattenOrder(o,acct,dex,parent,out){out=out||[];if(!o)return out;var x=normOrder(o,acct,dex,parent);if(x)out.push(x);(Array.isArray(o.children)?o.children:[]).forEach(function(ch){flattenOrder(ch,acct,dex,o,out);});return out;}
function semanticOrderKey(x){return [x._hlAccount||'',x.symbol||'',side(x),x._pendingKind||'',n(x.trigger_price||x.price,0).toPrecision(12),Math.abs(n(x.volume||x.lot,0)).toPrecision(12),x._reduceOnly?'R':''].join('|');}
function dedupeOrders(rows){var seen={},out=[];(rows||[]).forEach(function(x){if(!x)return;var k=semanticOrderKey(x);if(seen[k])return;seen[k]=1;out.push(x);});out.sort(function(a,b){var ap=/^(TP|SL|TP\/SL|TRIGGER)$/.test(String(a._pendingKind||''))?0:1,bp=/^(TP|SL|TP\/SL|TRIGGER)$/.test(String(b._pendingKind||''))?0:1;if(ap!==bp)return ap-bp;return tm(b.timestamp)-tm(a.timestamp);});return out;}
async function fetchOrdersType(type,accts,dxs){
  var tasks=[];accts.forEach(function(a){dxs.forEach(function(d){var body={type:type,user:a};if(d)body.dex=d;tasks.push({a:a,d:d,p:post(body,8500)});});});
  var rs=await Promise.allSettled(tasks.map(function(x){return x.p;})),all=[],ok=0;
  rs.forEach(function(r,i){if(r.status==='fulfilled'&&Array.isArray(r.value)){ok++;r.value.forEach(function(o){flattenOrder(o,tasks[i].a,tasks[i].d,null,all);});}});return{rows:all,ok:ok};
}
async function fetchOpen(accts,dxs){
  var fr=await fetchOrdersType('frontendOpenOrders',accts,dxs),br=await fetchOrdersType('openOrders',accts,dxs);
  if(!fr.ok&&!br.ok)throw new Error('Open order sources gagal');
  return{rows:dedupeOrders(fr.rows.concat(br.rows)),source:'frontendOpenOrders+openOrders'};
}

function engineTargets(){
  var src=[],seen={};function addRows(a){if(!Array.isArray(a))return;a.forEach(function(o){if(!o||o._pendingSource==='HL_OPEN'||o._hlAccount||o._hlReal)return;var k=[o.strategy_id||o.trade_id||'',o.symbol||o.coin||'',o.stop_loss||o.sl||o.stopLoss||'',o.take_profit||o.tp||o.takeProfit||''].join('|');if(!seen[k]){seen[k]=1;src.push(o);}});}addRows(window._allPending);addRows(window._sortedPending);addRows(window._enginePositions);
  var rows=[];src.forEach(function(o,i){var sym=coin(o.symbol||o.coin)+'/USD',raw=String(o.side||o.direction||o.type||'').toUpperCase(),long=raw.indexOf('SHORT')<0&&raw.indexOf('SELL')<0,exitSide=long?'SELL':'BUY',vol=Math.abs(n(o.lot!=null?o.lot:(o.volume!=null?o.volume:(o.size!=null?o.size:o.szi)),0)),t=tm(o.created_at||o.opened_at||o.entry_time||o.timestamp)||Date.now(),sl=n(o.stop_loss!=null?o.stop_loss:(o.sl!=null?o.sl:o.stopLoss),0),tp=n(o.take_profit!=null?o.take_profit:(o.tp!=null?o.tp:o.takeProfit),0);function push(kind,px){if(!(px>0))return;rows.push({order_id:'target-'+kind+'-'+(o.order_id||o.trade_id||o.strategy_id||i)+'-'+px,timestamp:new Date(t).toISOString(),symbol:sym,type:exitSide,side:exitSide,volume:vol,price:px,trigger_price:px,pnl:null,_pendingKind:kind,_pendingSource:'ENGINE_TARGET',_reduceOnly:true});}push('SL',sl);push('TP',tp);});return dedupeOrders(rows);
}

function cacheBootstrap(){
  var fill=load(FILL_CACHE),open=load(OPEN_CACHE),oldF=oldSessionCache('ctl_hl_fills_v7:'),oldO=oldSessionCache('ctl_hl_open_v7:');
  if((!fill||!Array.isArray(fill.rows)||!fill.rows.length)&&oldF&&oldF.rows.length)fill={at:oldF.at||Date.now(),rows:compactRows(oldF.rows),accounts:uniq(oldF.rows.map(function(x){return x&&x._hlAccount;})),source:'v7-session'};
  if((!open||!Array.isArray(open.rows)||!open.rows.length)&&oldO&&oldO.rows.length)open={at:oldO.at||Date.now(),rows:compactRows(oldO.rows),accounts:uniq(oldO.rows.map(function(x){return x&&x._hlAccount;})),source:'v7-session'};
  var globals=[];if(Array.isArray(window._allFillsForLog)&&window._allFillsForLog.length)globals=window._allFillsForLog;else if(Array.isArray(window._tradeLogAllFills)&&window._tradeLogAllFills.length)globals=window._tradeLogAllFills;
  if((!fill||!fill.rows||!fill.rows.length)&&globals.length)fill={at:Date.now(),rows:compactRows(globals),accounts:uniq(globals.map(function(x){return x&&x._hlAccount;})),source:'window'};
  return{fill:fill,open:open};
}

function perfStats(fills){
  var closed=(fills||[]).filter(function(x){return x&&!x.is_entry&&x.pnl!=null;}),wins=closed.filter(function(x){return n(x.pnl)>1e-12;}),losses=closed.filter(function(x){return n(x.pnl)<-1e-12;}),gp=wins.reduce(function(s,x){return s+n(x.pnl);},0),gl=Math.abs(losses.reduce(function(s,x){return s+n(x.pnl);},0)),net=closed.reduce(function(s,x){return s+n(x.pnl);},0),avgW=wins.length?gp/wins.length:0,avgL=losses.length?gl/losses.length:0,den=wins.length+losses.length,wr=den?wins.length/den*100:0,lr=den?losses.length/den*100:0,pf=gl>0?gp/gl:(gp>0?Infinity:0),rr=avgL>0?avgW/avgL:0,lp=wins.length?Math.max.apply(null,wins.map(function(x){return n(x.pnl);})):0,ll=losses.length?Math.min.apply(null,losses.map(function(x){return n(x.pnl);})):0,ordered=closed.slice().sort(function(a,b){return tm(a.timestamp)-tm(b.timestamp);}),cw=0,cl=0,mw=0,ml=0,wRuns=[],lRuns=[],longs=0,lw=0,shorts=0,sw=0;
  ordered.forEach(function(x){var p=n(x.pnl),d=String(x._hlDir||x.direction||'').toUpperCase();if(d.indexOf('LONG')>=0){longs++;if(p>0)lw++;}if(d.indexOf('SHORT')>=0){shorts++;if(p>0)sw++;}if(p>0){cw++;mw=Math.max(mw,cw);if(cl){lRuns.push(cl);cl=0;}}else if(p<0){cl++;ml=Math.max(ml,cl);if(cw){wRuns.push(cw);cw=0;}}else{if(cw){wRuns.push(cw);cw=0;}if(cl){lRuns.push(cl);cl=0;}}});if(cw)wRuns.push(cw);if(cl)lRuns.push(cl);
  return{closed:closed,wins:wins,losses:losses,gp:gp,gl:gl,net:net,avgW:avgW,avgL:avgL,wr:wr,lr:lr,pf:pf,rr:rr,lp:lp,ll:ll,mw:mw,ml:ml,longs:longs,lw:lw,shorts:shorts,sw:sw,avgWRun:wRuns.length?wRuns.reduce(function(a,b){return a+b;},0)/wRuns.length:0,avgLRun:lRuns.length?lRuns.reduce(function(a,b){return a+b;},0)/lRuns.length:0};
}
function setText(id,val,color){var e=document.getElementById(id);if(!e)return;if(e.textContent!==String(val))e.textContent=String(val);if(color&&e.style.color!==color)e.style.color=color;}
function paintPerf(st){if(!st.fills.length)return;var s=perfStats(st.fills),p=window._hlPortfolio||null,net=p&&Number.isFinite(Number(p.netPnl))?Number(p.netPnl):s.net,end=p&&Number.isFinite(Number(p.endEquity))?Number(p.endEquity):null,basis=end!=null?end-net:null,ddVal=p&&Number.isFinite(Number(p.maxDDval))?Number(p.maxDDval):0,ddPct=p&&Number.isFinite(Number(p.maxDDpct))?Number(p.maxDDpct):0,pay=s.closed.length?s.net/s.closed.length:0,rec=ddVal>0?net/ddVal:0;
  setText('statTotalTrades',s.closed.length,'var(--gold)');setText('dGrossProfit','$'+s.gp.toFixed(4),'var(--green)');setText('dGrossLoss','-$'+s.gl.toFixed(4),'var(--red)');setText('dAvgProfit','$'+s.avgW.toFixed(4));setText('dAvgLoss','$'+s.avgL.toFixed(4));setText('dPayoff',(pay>=0?'$':'-$')+Math.abs(pay).toFixed(4));setText('dPF',Number.isFinite(s.pf)?s.pf.toFixed(2):'∞');setText('dWinRate',s.wr.toFixed(2)+'% ('+s.wins.length+')','var(--green)');setText('dLossRate',s.lr.toFixed(2)+'% ('+s.losses.length+')','var(--red)');setText('dRR',s.rr?s.rr.toFixed(2):'-');setText('dRecovery',ddVal?rec.toFixed(2):'-');setText('dMaxProfit','$'+s.lp.toFixed(4));setText('dMaxDDVal','$'+ddVal.toFixed(4),'var(--red)');setText('dLargestProfit','$'+s.lp.toFixed(4),'var(--green)');setText('dLargestLoss','-$'+Math.abs(s.ll).toFixed(4),'var(--red)');setText('dMaxLoss','$'+ddVal.toFixed(4));setText('dConsecLoss',s.ml,'var(--gold)');setText('dLongsWon',s.lw+'/'+s.longs+' ('+(s.longs?Math.round(s.lw/s.longs*100):0)+'%)');setText('dShortsWon',s.sw+'/'+s.shorts+' ('+(s.shorts?Math.round(s.sw/s.shorts*100):0)+'%)');setText('dConsecWins',s.mw,'var(--gold)');setText('dAvgConsecW',s.avgWRun.toFixed(1));setText('dAvgConsecL',s.avgLRun.toFixed(1));setText('dTotalTrades2',s.closed.length,'var(--gold)');
  if(basis!=null&&basis>0){setText('dInitDeposit','$'+basis.toFixed(2));var g=net/basis*100;setText('statGrowth',(g>=0?'+':'')+g.toFixed(2)+'%',g>=0?'var(--green)':'var(--red)');}
  setText('statNetPnl',(net>=0?'+':'-')+'$'+Math.abs(net).toFixed(4),net>=0?'var(--green)':'var(--red)');setText('statMaxDD',ddPct.toFixed(2)+'%','var(--red)');
}

function fillKey(x){return [x&&x._hlAccount||'',coin(x&&x.symbol),x&&x.trade_id||'',x&&x.timestamp||'',n(x&&x.price),n(x&&x.volume)].join('|');}
function dirEntry(x){var d=String(x&& (x._hlDir||x.direction)||'').toUpperCase();if(d.indexOf('LONG')>=0)return'LONG';if(d.indexOf('SHORT')>=0)return'SHORT';return side(x)==='SELL'?'SHORT':'LONG';}
function dirClose(x){var d=String(x&& (x._hlDir||x.direction)||'').toUpperCase();if(d.indexOf('CLOSE LONG')>=0||d.indexOf('LONG')>=0)return'LONG';if(d.indexOf('CLOSE SHORT')>=0||d.indexOf('SHORT')>=0)return'SHORT';return side(x)==='SELL'?'LONG':'SHORT';}
function entryPnlMap(fills){var ordered=(fills||[]).slice().sort(function(a,b){return tm(a.timestamp)-tm(b.timestamp);}),buckets={},map={};function bucket(x,d){var k=[x._hlAccount||'',coin(x.symbol),d].join('|');return buckets[k]||(buckets[k]=[]);}ordered.forEach(function(x){if(!x)return;var q=Math.abs(n(x.volume||x.lot,0));if(!(q>0))return;if(x.is_entry){var d=dirEntry(x),lot={key:fillKey(x),remaining:q,realized:0,matched:false,dir:d,entry:n(x.price,0),symbol:coin(x.symbol),account:x._hlAccount||''};bucket(x,d).push(lot);map[lot.key]=lot;return;}if(x.pnl==null)return;var b=bucket(x,dirClose(x)),left=q,matched=[];for(var i=0;i<b.length&&left>1e-12;i++){if(!(b[i].remaining>1e-12))continue;var use=Math.min(b[i].remaining,left);matched.push([b[i],use]);left-=use;}var mq=matched.reduce(function(s,m){return s+m[1];},0);if(!(mq>0))return;matched.forEach(function(m){m[0].realized+=n(x.pnl)*(m[1]/mq);m[0].remaining=Math.max(0,m[0].remaining-m[1]);m[0].matched=true;});});return map;}
function livePosMap(){var m={};(Array.isArray(window._hlPosLive)?window._hlPosLive:[]).forEach(function(p){var k=coin(p&& (p.displayCoin||p.coin||p.symbolKey));if(k!=='-')m[k]=p;});return m;}
function directPnl(x,map,pos){var lot=map[fillKey(x)];if(!lot)return null;var value=lot.realized,label=lot.matched?'REAL':'',p=pos[lot.symbol];if(lot.remaining>1e-12&&p&&n(p.current,0)>0&&lot.entry>0){var q=Math.min(lot.remaining,Math.abs(n(p.szi,0))||lot.remaining),mark=n(p.current),u=(lot.dir==='LONG'?(mark-lot.entry):(lot.entry-mark))*q;value+=u;label='LIVE';}if(!label)return null;return{value:value,label:label};}
function pendingPnl(o,fills,pos){var px=n(o.trigger_price||o.price||o.limit_price,0),q=Math.abs(n(o.volume||o.lot,0));if(!(px>0&&q>0))return null;var sym=coin(o.symbol),p=pos[sym],ep=p&&n(p.entry,0)>0?n(p.entry):0,dir=p?(n(p.szi,0)>=0?'LONG':'SHORT'):'';if(!ep){var best=null;(fills||[]).forEach(function(f){if(!f||!f.is_entry||coin(f.symbol)!==sym)return;if(o._hlAccount&&f._hlAccount!==o._hlAccount)return;if(!best||tm(f.timestamp)>tm(best.timestamp))best=f;});if(best){ep=n(best.price,0);dir=dirEntry(best);}}if(!(ep>0&&dir))return null;return{value:(dir==='LONG'?(px-ep):(ep-px))*q,label:'EST'};}
function pnlText(r){return r?(r.label+' '+(r.value>=0?'+$':'-$')+Math.abs(r.value).toFixed(4)):'—';}

function cleanupOld(){
  var x=window.__CTL_HISTORY_STABLE__;if(x&&x.version<10){try{if(x.timer)clearInterval(x.timer);}catch(e){}try{if(x.domGuard)x.domGuard.disconnect();}catch(e){}}
  var v8=window.__CTL_HISTORY_V8_OVERLAY__;if(v8){try{if(v8.timer)clearInterval(v8.timer);}catch(e){}try{if(v8.observer)v8.observer.disconnect();}catch(e){}}
  var g=window.__CTL_HISTORY_V8_DOM_GUARD__;if(g){try{if(g.timer)clearInterval(g.timer);}catch(e){}try{if(g.observer)g.observer.disconnect();}catch(e){}}
  var p=window.__CTL_HL_PNL_V9__;if(p&&p.timer)try{clearInterval(p.timer);}catch(e){}
  var pt=window.__CTL_POSITION_TARGETS_V8__;if(pt&&pt.timer)try{clearInterval(pt.timer);}catch(e){}
}

function install(){
  var d=document,tbody=d.getElementById('historyTableBody'),filters=d.getElementById('historyTypeFilters');if(!tbody||!filters){setTimeout(install,100);return false;}
  if(window.__CTL_HISTORY_STABLE__&&window.__CTL_HISTORY_STABLE__.version>=10)return true;
  cleanupOld();
  var boot=cacheBootstrap(),mode=String(window._historyTypeFilter||'all');if(['all','pending','direct'].indexOf(mode)<0)mode='all';
  var st={ready:true,version:10,source:'hyperliquid-persistent-v10',mode:mode,fills:boot.fill&&Array.isArray(boot.fill.rows)?clone(boot.fill.rows):[],exchange:boot.open&&Array.isArray(boot.open.rows)?dedupeOrders(clone(boot.open.rows)):[],engine:[],pending:[],accounts:[],shown:PAGE,polling:false,lastError:'',lastGood:boot.fill&&boot.fill.at||0,lastOpenGood:boot.open&&boot.open.at||0,fillSource:boot.fill&&boot.fill.source||'',openSource:boot.open&&boot.open.source||'',rendering:false,observer:null,timer:null};
  window.__CTL_HISTORY_STABLE__=st;
  if(st.fills.length){window._allFillsForLog=clone(st.fills);window._tradeLogAllFills=clone(st.fills);}

  function rows(){if(st.mode==='direct')return st.fills.filter(function(x){return x&&x.is_entry;});if(st.mode==='pending')return st.pending;return st.fills;}
  function active(){filters.querySelectorAll('.history-type-filter').forEach(function(b){var a=b.dataset.historyType===st.mode;b.classList.toggle('active',a);b.setAttribute('aria-pressed',a?'true':'false');b.removeAttribute('onclick');b.style.pointerEvents='auto';b.style.cursor='pointer';});}
  function status(rs){var e=d.getElementById('tradeLogInfo');if(!e)return;var s;if(st.mode==='all')s='Hyperliquid fills · '+st.fills.length+' fills';else if(st.mode==='direct')s='LANGSUNG ENTRY · '+rs.length+' open/add fills · '+st.fills.length+' total fills';else{var tp=st.exchange.filter(function(x){return /^(TP|SL|TP\/SL|TRIGGER)$/.test(String(x._pendingKind||''));}).length;s='PENDING ORDER · HL '+st.exchange.length+' · TP/SL '+tp+' · TARGET '+st.engine.length;}if(st.lastError)s+=' · cache dipertahankan ('+st.lastError+')';e.textContent=s;e.style.color=st.lastError?'var(--gold)':'var(--green)';}
  function empty(rs){var e=d.getElementById('emptyHistory'),t=d.getElementById('historyTable');if(rs.length){if(e)e.style.display='none';if(t)t.style.display='';return;}if(t)t.style.display='none';if(!e)return;e.style.display='';var a=e.querySelector('.text'),b=e.querySelector('.sub');if(st.mode==='pending'){if(a)a.textContent='Tidak ada Pending Order aktif';if(b)b.textContent=st.lastError?'Data terakhir valid belum ditemukan untuk account aktif.':'HL open 0 dan TARGET SL/TP 0.';}else if(st.mode==='direct'){if(a)a.textContent='Tidak ada open/add fill pada history Hyperliquid';if(b)b.textContent=st.lastError?'Cache/history account aktif belum tersedia.':'Menunggu userFills.';}else{if(a)a.textContent='Belum ada fill Hyperliquid';if(b)b.textContent=st.lastError?'Cache/history account aktif belum tersedia.':'Menunggu userFills.';}}
  function observe(){if(!st.observer)return;try{st.observer.observe(d.body,{subtree:true,childList:true,characterData:true});}catch(e){}}
  function render(){
    if(st.rendering)return;st.rendering=true;try{if(st.observer)st.observer.disconnect();active();st.engine=engineTargets();st.pending=dedupeOrders(st.exchange.concat(st.engine));var rs=rows(),max=Math.min(rs.length,st.shown||PAGE),entryMap=st.mode==='direct'?entryPnlMap(st.fills):null,posMap=(st.mode==='direct'||st.mode==='pending')?livePosMap():null;tbody.innerHTML='';
      for(var i=0;i<max;i++){var x=rs[i],pending=st.mode==='pending',entry=!!x.is_entry,kind=pending?(x._pendingKind||'PENDING'):(entry?'ENTRY':(x._fillClass||'CLOSE')),sd=side(x),r=null;if(st.mode==='direct')r=directPnl(x,entryMap,posMap);else if(st.mode==='pending')r=pendingPnl(x,st.fills,posMap);var pnl=r?pnlText(r):(x.pnl==null?'—':((n(x.pnl)>=0?'+$':'-$')+Math.abs(n(x.pnl)).toFixed(4))),pv=r?r.value:(x.pnl==null?null:n(x.pnl)),pc=pv==null?'var(--text-muted)':(pv>1e-12?'var(--green)':(pv<-1e-12?'var(--red)':'var(--text-muted)')),src=pending?(x._pendingSource==='ENGINE_TARGET'?'TARGET':'HL'):'HL',tr=d.createElement('tr');tr.innerHTML='<td style="color:var(--text-muted);font-size:11px">'+fmtTime(x.timestamp||x.created_at)+'</td><td>'+(i+1)+'</td><td style="font-weight:700">'+esc(x.symbol||'-')+'</td><td class="'+(sd==='BUY'?'side-long':'side-short')+'" style="font-weight:800">'+sd+'</td><td style="font-weight:800">'+esc(kind+(pending&&x._reduceOnly?' · REDUCE':''))+'</td><td>'+esc(x.volume!=null?x.volume:(x.lot||0))+'</td><td>'+fmtPx(x.trigger_price||x.price||x.entry_price)+'</td><td style="color:'+pc+';font-weight:800">'+pnl+'</td><td style="font-weight:800;color:'+(src==='HL'?'var(--green)':'var(--gold)')+'">'+src+'</td>';tbody.appendChild(tr);}
      var wrap=d.getElementById('loadMoreDealsWrap'),btn=d.getElementById('loadMoreDealsBtn');if(wrap){if(max<rs.length){wrap.style.display='';if(btn)btn.textContent='📋 Load More +'+Math.min(PAGE,rs.length-max)+' ('+(rs.length-max)+' remaining)';}else wrap.style.display='none';}empty(rs);status(rs);paintPerf(st);
    }finally{st.rendering=false;observe();}
  }
  st.render=render;st.setMode=function(m){m=['all','pending','direct'].indexOf(m)>=0?m:'all';st.mode=m;window._historyTypeFilter=m;st.shown=PAGE;try{sessionStorage.setItem('copy_history_type_filter',m);}catch(e){}render();};st.loadMore=function(){st.shown=Math.min(rows().length,(st.shown||PAGE)+PAGE);render();};window.setHistoryTypeFilter=st.setMode;window._loadMoreDeals=st.loadMore;
  filters.addEventListener('click',function(ev){var b=ev.target.closest&&ev.target.closest('.history-type-filter');if(!b||!filters.contains(b))return;ev.preventDefault();ev.stopImmediatePropagation();st.setMode(b.dataset.historyType||'all');},true);
  var queued=false;st.observer=new MutationObserver(function(ms){if(st.rendering||queued)return;var rel=ms.some(function(m){var z=m.target&&(m.target.nodeType===1?m.target:m.target.parentElement);while(z&&z!==d.body){if(z.id==='historyTableBody'||z.id==='emptyHistory'||z.id==='historyTable'||z.id==='tradeLogInfo'||z.id==='historyTypeFilters'||z.id==='statTotalTrades'||z.id==='dGrossProfit'||z.id==='dGrossLoss'||z.id==='dWinRate'||z.id==='dLossRate'||z.id==='dTotalTrades2')return true;z=z.parentElement;}return false;});if(!rel)return;queued=true;requestAnimationFrame(function(){queued=false;render();});});observe();

  async function poll(){
    if(st.polling)return;st.polling=true;try{
      var seeds=candidateSeeds();if(!seeds.length){st.lastError='wallet belum tersedia';render();return;}
      var fam=await resolveFamily(seeds),dx=await dexes();st.accounts=fam;
      var r=await Promise.allSettled([fetchFills(fam),fetchOpen(fam,dx)]);
      if(r[0].status==='fulfilled'){
        var fr=r[0].value;if(fr.rows.length){st.fills=fr.rows;st.lastGood=Date.now();st.fillSource='live';st.lastError='';window._allFillsForLog=clone(st.fills);window._tradeLogAllFills=clone(st.fills);store(FILL_CACHE,{at:st.lastGood,rows:compactRows(st.fills),accounts:fr.nonemptyAccounts.length?fr.nonemptyAccounts:fam,source:'live'});store(PROVEN_CACHE,{at:Date.now(),accounts:fr.nonemptyAccounts.length?fr.nonemptyAccounts:fam});}
        else if(st.fills.length){st.lastError='userFills sementara 0; history terakhir dipertahankan';}
        else st.lastError='userFills 0';
      } else if(st.fills.length)st.lastError='userFills gagal; cache dipertahankan';else st.lastError='userFills gagal';
      if(r[1].status==='fulfilled'){
        var or=r[1].value;if(or.rows.length){st.exchange=or.rows;st.lastOpenGood=Date.now();st.openSource='live';store(OPEN_CACHE,{at:st.lastOpenGood,rows:compactRows(st.exchange),accounts:fam,source:'live'});}
        else if(st.exchange.length&&Date.now()-st.lastOpenGood>180000){st.exchange=[];store(OPEN_CACHE,{at:Date.now(),rows:[],accounts:fam,source:'confirmed-empty'});}
      }
      render();
    }catch(e){st.lastError=String(e&&e.message||e);render();}finally{st.polling=false;}
  }
  st.poll=poll;st.timer=setInterval(poll,POLL);render();poll();return true;
}

window.__ctlInstallHlHistoryV10=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
