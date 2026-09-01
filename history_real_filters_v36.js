(function(){
'use strict';

var VERSION=36;
var HL='https://api.hyperliquid.xyz/info';
var WS='wss://api.hyperliquid.xyz/ws';
var POLL_MS=7000;
var PAGE=20;

function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function tm(v){if(typeof v==='number'&&Number.isFinite(v))return v;var x=Date.parse(v||'');return Number.isFinite(x)?x:0;}
function valid(v){return /^0x[a-fA-F0-9]{40}$/.test(String(v||'').trim());}
function lower(v){return valid(v)?String(v).trim().toLowerCase():'';}
function add(a,v){v=lower(v);if(v&&a.indexOf(v)<0)a.push(v);}
function uniq(a){var s={},o=[];(a||[]).forEach(function(v){v=lower(v);if(v&&!s[v]){s[v]=1;o.push(v);}});return o;}
function safeJson(v){try{return JSON.parse(v||'null');}catch(e){return null;}}
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function coin(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function oid(v){return v==null?'':String(v);}
function fmtTime(v){var x=tm(v);if(!x)return'—';var d=new Date(x);return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}
function fmtPx(v){v=n(v,0);if(!v)return'—';if(v>=1000)return v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});if(v>=1)return v.toFixed(5).replace(/0+$/,'').replace(/\.$/,'');return v.toFixed(7).replace(/0+$/,'').replace(/\.$/,'');}
function side(x){var s=String(x&&(x.side||x.type||x.direction)||'').toUpperCase();return s.indexOf('SELL')>=0||s==='A'||s.indexOf('SHORT')>=0?'SELL':'BUY';}

async function post(body,ms){
  var c=new AbortController(),t=setTimeout(function(){c.abort();},ms||10000);
  try{
    var r=await fetch(HL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:c.signal});
    if(!r.ok)throw new Error('HL '+r.status+' '+body.type);
    var d=await r.json();if(d&&d.error)throw new Error(String(d.error));return d;
  }finally{clearTimeout(t);}
}

function sessionEmail(){try{var u=safeJson(localStorage.getItem('session_user'));return u&&u.email?String(u.email).trim().toLowerCase():'';}catch(e){return'';}}
function seeds(){
  var out=[],email=sessionEmail(),p=null,st=window.__CTL_HISTORY_STABLE__;
  try{p=safeJson(localStorage.getItem('ctl_hl_proven_accounts_v10'));}catch(e){}
  if(p&&Array.isArray(p.accounts))p.accounts.forEach(function(a){add(out,a);});
  add(out,window._hlAccountWallet);add(out,window._userWallet);add(out,window._hlActiveWallet);add(out,window._hlSelectedWallet);
  add(out,window._pagesHlActiveWallet);add(out,window._userAddress);add(out,window._hlAgentWallet);
  try{if(typeof window.activeHyperliquidWallet==='function')add(out,window.activeHyperliquidWallet());}catch(e){}
  if(email){
    try{add(out,localStorage.getItem('ot_wallet_'+email));}catch(e){}
    try{add(out,localStorage.getItem('ctl_hl_account_wallet_v3:'+encodeURIComponent(email)));}catch(e){}
    try{var rr=safeJson(localStorage.getItem('ctl_hl_resolution_v3:'+encodeURIComponent(email)));if(rr){add(out,rr.account);add(out,rr.owner);}}catch(e){}
  }
  (Array.isArray(st&&st.accounts)?st.accounts:[]).forEach(function(a){add(out,a);});
  (Array.isArray(st&&st.fills)?st.fills:[]).slice(0,300).forEach(function(f){add(out,f&&f._hlAccount);});
  return uniq(out).slice(0,16);
}

var familyCache={key:'',at:0,accounts:[]};
async function family(seed){
  seed=uniq(seed);var key=seed.join('|');
  if(key&&familyCache.key===key&&Date.now()-familyCache.at<60000&&familyCache.accounts.length)return familyCache.accounts.slice();
  var out=seed.slice(),masters=[];
  await Promise.all(seed.slice(0,10).map(async function(a){
    try{
      var r=await post({type:'userRole',user:a},6500),role=String(r&&r.role||'').toLowerCase();
      if(role==='agent'&&valid(r&&r.data&&r.data.user)){add(out,r.data.user);add(masters,r.data.user);}
      else if(role==='subaccount'&&valid(r&&r.data&&r.data.master)){add(out,r.data.master);add(masters,r.data.master);}
      else if(role==='user')add(masters,a);
    }catch(e){}
  }));
  for(var i=0;i<masters.length&&i<6;i++){
    try{var s=await post({type:'subAccounts',user:masters[i]},7500);if(Array.isArray(s))s.forEach(function(x){add(out,x&&x.subAccountUser);});}catch(e){}
  }
  out=uniq(out).slice(0,20);familyCache={key:key,at:Date.now(),accounts:out.slice()};return out;
}

var dexCache={at:0,list:['']};
async function dexes(){
  if(Date.now()-dexCache.at<300000)return dexCache.list.slice();
  var list=[''];
  try{
    var d=await post({type:'perpDexs'},8000);
    if(Array.isArray(d))d.forEach(function(x){var nm=typeof x==='string'?x:(x&&typeof x.name==='string'?x.name:(Array.isArray(x)?x[0]:''));nm=String(nm||'').trim();if(nm&&list.indexOf(nm)<0)list.push(nm);});
  }catch(e){}
  dexCache={at:Date.now(),list:list.slice(0,12)};return dexCache.list.slice();
}

function classifyFill(f){
  var dir=String(f&&f.dir||'').trim().toLowerCase();
  if(/^open\b/.test(dir))return'ENTRY';if(/^close\b/.test(dir))return'CLOSE';
  var sp=Number(f&&f.startPosition),sz=Math.abs(Number(f&&f.sz)),s=String(f&&f.side||'').toUpperCase();
  if(Number.isFinite(sp)&&Number.isFinite(sz)&&sz>0){
    var delta=(s==='B'||s==='BUY')?sz:-sz,end=sp+delta;
    if(Math.abs(sp)<1e-12&&Math.abs(end)>1e-12)return'ENTRY';
    if(sp*end>0&&Math.abs(end)>Math.abs(sp)+1e-12)return'ENTRY';
    if(sp*end>0&&Math.abs(end)<Math.abs(sp)-1e-12)return'CLOSE';
    if(sp*end<0)return'FLIP';
  }
  return Math.abs(n(f&&f.closedPnl,0))>1e-12?'CLOSE':'UNKNOWN';
}
function normFill(f,a){
  if(!f)return null;
  var t=n(f.time,0)||tm(f.timestamp),cls=classifyFill(f),buy=String(f.side||'').toUpperCase()==='B',c=coin(f.coin||f.symbol),px=n(f.px!=null?f.px:f.price,0),sz=Math.abs(n(f.sz!=null?f.sz:f.volume,0)),cp=n(f.closedPnl,0),fee=Math.abs(n(f.fee,0)),token=String(f.feeToken||'USDC').toUpperCase(),feeUsd=(token==='USDC'||token==='USDT'||token==='USDE')?fee:0;
  return{trade_id:f.tid||f.trade_id||f.oid||(a+'-'+c+'-'+t+'-'+px+'-'+sz),timestamp:t?new Date(t).toISOString():'',time:t,symbol:c+'/USD',coin:c,type:buy?'BUY':'SELL',side:buy?'BUY':'SELL',direction:String(f.dir||cls),volume:sz,lot:sz,price:px,entry_price:px,pnl:cls==='ENTRY'?null:cp-feeUsd,is_entry:cls==='ENTRY',_fillClass:cls,_hlDir:String(f.dir||''),_hlAccount:a,_hlOid:f.oid==null?null:String(f.oid),_hlTid:f.tid==null?null:String(f.tid),_hlFeeUsd:feeUsd,_source:'HL_FILL'};
}
function fillKey(x){return[x&&x._hlAccount||'',x&&x._hlTid||x&&x.trade_id||'',x&&x._hlOid||'',x&&x.time||tm(x&&x.timestamp),x&&x.symbol||'',n(x&&x.price),n(x&&x.volume)].join('|');}
function mergeFills(rows){var s={},o=[];(rows||[]).forEach(function(x){if(!x)return;var k=fillKey(x);if(s[k])return;s[k]=1;o.push(x);});o.sort(function(a,b){return tm(b.timestamp)-tm(a.timestamp);});return o.slice(0,10000);}

function isTrigger(o){
  if(!o)return false;var txt=(String(o.orderType||'')+' '+String(o.triggerCondition||'')+' '+String(o.tpsl||'')).toUpperCase();
  return !!o.isTrigger||!!o.isPositionTpsl||!!o.isPositionTpSl||n(o.triggerPx,0)>0||txt.indexOf('TAKE PROFIT')>=0||txt.indexOf('STOP')>=0||/(^|\W)(TP|SL)(\W|$)/.test(txt);
}
function triggerKind(o){var txt=(String(o&&o.orderType||'')+' '+String(o&&o.triggerCondition||'')+' '+String(o&&o.tpsl||'')).toUpperCase();if(txt.indexOf('TAKE PROFIT')>=0||/(^|\W)TP(\W|$)/.test(txt))return'TP';if(txt.indexOf('STOP')>=0||/(^|\W)SL(\W|$)/.test(txt))return'SL';return'TRIGGER';}
function normOpen(o,a,d,parent){
  parent=parent||{};var c=coin(o.coin||parent.coin||o.symbol),s=String(o.side||parent.side||'').toUpperCase(),sell=s==='A'||s==='SELL',tr=n(o.triggerPx,0),lp=n(o.limitPx!=null?o.limitPx:o.px,0),t=n(o.timestamp,0)||n(o.time,0)||n(parent.timestamp,0)||Date.now(),q=Math.abs(n(o.sz!=null?o.sz:(o.origSz!=null?o.origSz:parent.sz),0)),k=triggerKind(o);
  return{order_id:o.oid||o.order_id||o.cloid||('v36-'+a+'-'+c+'-'+t+'-'+k),oid:o.oid||o.order_id||null,timestamp:new Date(t).toISOString(),symbol:c+'/USD',coin:c,type:sell?'SELL':'BUY',side:sell?'SELL':'BUY',direction:k+(o.reduceOnly?' · REDUCE ONLY':''),volume:q,lot:q,price:tr||lp,limit_price:lp,trigger_price:tr,pnl:null,_pendingKind:k,_pendingSource:'HL_OPEN',_source:'HL_OPEN',_status:'OPEN',_hlAccount:a,_hlDex:d||'main',_hlOid:o.oid==null?null:String(o.oid),_reduceOnly:!!o.reduceOnly};
}
function flattenOpen(o,a,d,parent,out){
  out=out||[];if(!o)return out;
  if(isTrigger(o)){var x=normOpen(o,a,d,parent);if(x&&x.price>0&&x.volume>0)out.push(x);}
  (Array.isArray(o.children)?o.children:[]).forEach(function(ch){flattenOpen(ch,a,d,o,out);});return out;
}
function openKey(x){return[x&&x._hlAccount||'',x&&x._hlOid||x&&x.order_id||'',x&&x.symbol||'',x&&x._pendingKind||'',n(x&&x.trigger_price||x&&x.price,0),n(x&&x.volume,0)].join('|');}
function dedupeOpen(rows){var s={},o=[];(rows||[]).forEach(function(x){if(!x)return;var k=openKey(x);if(s[k])return;s[k]=1;o.push(x);});o.sort(function(a,b){return tm(b.timestamp)-tm(a.timestamp);});return o;}

async function fetchFills(a){var r=await post({type:'userFills',user:a,aggregateByTime:true},10000);return(Array.isArray(r)?r:[]).map(function(f){return normFill(f,a);}).filter(Boolean);}
async function fetchOpen(a,dxs){
  var tasks=[];dxs.forEach(function(d){var x={type:'frontendOpenOrders',user:a},y={type:'openOrders',user:a};if(d){x.dex=d;y.dex=d;}tasks.push({d:d,p:post(x,9000)});tasks.push({d:d,p:post(y,9000)});});
  var rs=await Promise.allSettled(tasks.map(function(x){return x.p;})),out=[],ok=0;
  rs.forEach(function(r,i){if(r.status==='fulfilled'&&Array.isArray(r.value)){ok++;r.value.forEach(function(o){flattenOpen(o,a,tasks[i].d,null,out);});}});
  if(!ok)throw new Error('openOrders gagal '+a);return dedupeOpen(out);
}
function flattenHistory(a,rows){
  var parentBracket={},childToParent={};
  function put(o,parent){
    if(!o)return;var id=oid(o.oid||o.order_id||o.cloid),kids=Array.isArray(o.children)?o.children:[];
    if(id&&!o.reduceOnly&&kids.some(isTrigger))parentBracket[id]=1;
    if(isTrigger(o)&&id&&parent){childToParent[id]=String(parent);parentBracket[String(parent)]=1;}
    kids.forEach(function(ch){put(ch,id||parent||'');});
  }
  (Array.isArray(rows)?rows:[]).forEach(function(w){put(w&&w.order?w.order:w,'');});
  return{parentBracket:parentBracket,childToParent:childToParent};
}
async function fetchHistory(a){var r=await post({type:'historicalOrders',user:a},10000);return flattenHistory(a,Array.isArray(r)?r:[]);}
function mergeMeta(parts){var p={},c={};(parts||[]).forEach(function(x){Object.assign(p,x&&x.parentBracket||{});Object.assign(c,x&&x.childToParent||{});});return{parentBracket:p,childToParent:c};}

function install(){
  var st=window.__CTL_HISTORY_STABLE__,m=window.__CTL_HISTORY_MODE_V20__,z=window.__CTL_ZERO_FLICKER_V35__,tbody=document.getElementById('historyTableBody'),filters=document.getElementById('historyTypeFilters');
  if(!st||st.version<10||!m||!m.ready||!z||!z.ready||!tbody||!filters||typeof st.render!=='function'){setTimeout(install,120);return false;}
  var old=window.__CTL_REAL_FILTERS_V36__;if(old&&old.ready&&old.ownerLock)return true;

  try{if(st.timer)clearInterval(st.timer);}catch(e){}st.timer=null;
  try{if(st.observer)st.observer.disconnect();}catch(e){}st.observer=null;
  try{if(m.metaTimer)clearInterval(m.metaTimer);}catch(e){}m.metaTimer=null;
  try{if(m.dataTimer)clearInterval(m.dataTimer);}catch(e){}m.dataTimer=null;
  ['__CTL_HL_PENDING_V19__','__CTL_HL_PENDING_V18__','__CTL_HL_SUMMARY_V19__','__CTL_HL_SUMMARY_V18__','__CTL_HL_MARKET_ONLY_V18__'].forEach(function(k){var x=window[k];try{if(x&&x.timer)clearInterval(x.timer);}catch(e){}if(x)x.timer=null;});

  var state={ready:true,version:VERSION,ownerLock:true,source:'real-hyperliquid-owner-v36',accounts:[],lastSync:0,lastGoodSync:0,lastError:'',apiSuccess:0,fillSuccess:0,openSuccess:0,historySuccess:0,fills:0,open:0,direct:0,refreshBusy:false,queued:false,timer:null,ws:null,wsConnected:false,wsKey:'',wsReconnect:null,rendering:false,shown:PAGE};
  window.__CTL_REAL_FILTERS_V36__=state;

  var baseRender=st.render;
  function directRows(){
    var pb=m&&m.meta&&m.meta.parentBracket||{};
    return(st.fills||[]).filter(function(f){if(!f||!f.is_entry)return false;var id=oid(f._hlOid);return !(id&&pb[id]);});
  }
  function currentRows(){if(st.mode==='pending')return Array.isArray(st.pending)?st.pending:[];if(st.mode==='direct')return directRows();return Array.isArray(st.fills)?st.fills:[];}
  function buttons(){filters.querySelectorAll('[data-history-type]').forEach(function(b){var on=String(b.dataset.historyType||'all')===st.mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');b.disabled=false;b.style.pointerEvents='auto';b.style.cursor='pointer';});}
  function status(){
    var e=document.getElementById('tradeLogInfo');if(!e)return;
    var fresh=state.lastGoodSync>0?(Date.now()-state.lastGoodSync<30000):false;
    var txt='REAL HYPERLIQUID · '+(state.wsConnected?'LIVE':(fresh?'REST':'RETRY'))+' · '+state.accounts.length+' account';
    if(st.mode==='all')txt+=' · '+(st.fills||[]).length+' fills';
    else if(st.mode==='pending')txt+=' · '+(st.pending||[]).length+' active TP/SL';
    else txt+=' · '+directRows().length+' direct entries';
    if(state.lastError)txt+=' · last-good retained · '+state.lastError;
    e.textContent=txt;e.style.color=state.lastError?'var(--gold)':'var(--green)';e.dataset.realHyperliquid='36';e.dataset.owner='v36';
  }
  function empty(rows){
    var e=document.getElementById('emptyHistory'),t=document.getElementById('historyTable');
    if(rows.length){if(e)e.style.display='none';if(t)t.style.display='';return;}
    if(t)t.style.display='none';if(!e)return;e.style.display='';
    var a=e.querySelector('.text'),b=e.querySelector('.sub');
    if(st.mode==='pending'){if(a)a.textContent='Tidak ada Pending Order TP/SL aktif';if(b)b.textContent='Hyperliquid openOrders terhubung; saat ini 0 trigger aktif.';}
    else if(st.mode==='direct'){if(a)a.textContent='Tidak ada Langsung Entry';if(b)b.textContent='Tidak ada open/add fill tanpa parent TP/SL pada account aktif.';}
    else{if(a)a.textContent='Belum ada fill Hyperliquid';if(b)b.textContent='Menunggu userFills account aktif.';}
  }
  function paintRows(){
    var rows=currentRows(),max=Math.min(rows.length,state.shown||PAGE);tbody.innerHTML='';
    for(var i=0;i<max;i++){
      var x=rows[i],pending=st.mode==='pending',entry=!!x.is_entry,kind=pending?(x._pendingKind||'PENDING'):(entry?'ENTRY':(x._fillClass||'CLOSE')),sd=side(x),pv=x.pnl==null?null:n(x.pnl,0),pnl=pv==null?'—':((pv>=0?'+$':'-$')+Math.abs(pv).toFixed(4)),pc=pv==null?'var(--text-muted)':(pv>=0?'var(--green)':'var(--red)'),tr=document.createElement('tr');
      tr.innerHTML='<td style="color:var(--text-muted);font-size:11px">'+fmtTime(x.timestamp)+'</td><td>'+(i+1)+'</td><td style="font-weight:700">'+esc(x.symbol||'-')+'</td><td class="'+(sd==='BUY'?'side-long':'side-short')+'" style="font-weight:800">'+sd+'</td><td style="font-weight:800">'+esc(kind+(pending&&x._reduceOnly?' · REDUCE':''))+'</td><td>'+esc(x.volume!=null?x.volume:(x.lot||0))+'</td><td>'+fmtPx(x.trigger_price||x.price||x.entry_price)+'</td><td style="color:'+pc+';font-weight:800">'+pnl+'</td><td style="font-weight:800;color:var(--green)">HL</td>';
      tbody.appendChild(tr);
    }
    var wrap=document.getElementById('loadMoreDealsWrap'),btn=document.getElementById('loadMoreDealsBtn');
    if(wrap){if(max<rows.length){wrap.style.display='';if(btn)btn.textContent='📋 Load More +'+Math.min(PAGE,rows.length-max)+' ('+(rows.length-max)+' remaining)';}else wrap.style.display='none';}
    empty(rows);buttons();status();
  }
  function ownedRender(){
    if(state.rendering)return;state.rendering=true;
    try{
      if(st.mode==='pending')m.triggerRows=(Array.isArray(st.pending)?st.pending:[]).slice();
      try{baseRender();}catch(e){}
      paintRows();
    }finally{state.rendering=false;}
  }
  ['__ctlV23','__ctlV29','__ctlV30','__ctlV31','__ctlV33','__ctlV35'].forEach(function(k){ownedRender[k]=baseRender[k]===true;});
  ownedRender.__ctlV36=true;st.render=ownedRender;

  st.setMode=function(mode){
    mode=['all','pending','direct'].indexOf(mode)>=0?mode:'all';st.mode=mode;window._historyTypeFilter=mode;state.shown=PAGE;m.shown=PAGE;
    try{sessionStorage.setItem('copy_history_type_filter',mode);}catch(e){}
    ownedRender();return true;
  };
  window.setHistoryTypeFilter=st.setMode;
  window._loadMoreDeals=function(){state.shown=Math.min(currentRows().length,(state.shown||PAGE)+PAGE);ownedRender();};

  var info=document.getElementById('tradeLogInfo');
  if(info){
    state.statusObserver=new MutationObserver(function(){if(state.rendering)return;var txt=String(info.textContent||'');if(txt.indexOf('REAL HYPERLIQUID')!==0)Promise.resolve().then(status);});
    try{state.statusObserver.observe(info,{childList:true,characterData:true,subtree:true});}catch(e){}
  }

  function wsClose(){if(state.wsReconnect){clearTimeout(state.wsReconnect);state.wsReconnect=null;}if(state.ws){try{state.ws.onclose=null;state.ws.close();}catch(e){}state.ws=null;}state.wsConnected=false;}
  function connectWs(accounts){
    accounts=uniq(accounts);var key=accounts.join('|');if(!accounts.length){wsClose();return;}if(state.ws&&state.wsConnected&&state.wsKey===key)return;wsClose();state.wsKey=key;
    try{
      var ws=new WebSocket(WS);state.ws=ws;
      ws.onopen=function(){if(state.ws!==ws)return;state.wsConnected=true;accounts.forEach(function(a){try{ws.send(JSON.stringify({method:'subscribe',subscription:{type:'userFills',user:a}}));}catch(e){}try{ws.send(JSON.stringify({method:'subscribe',subscription:{type:'orderUpdates',user:a}}));}catch(e){}});status();};
      ws.onmessage=function(ev){if(state.ws!==ws)return;var msg=safeJson(ev&&ev.data),ch=String(msg&&msg.channel||'');if(ch==='userFills'||ch==='orderUpdates')schedule('ws-'+ch,120);};
      ws.onerror=function(){state.wsConnected=false;status();};
      ws.onclose=function(){if(state.ws!==ws)return;state.ws=null;state.wsConnected=false;status();state.wsReconnect=setTimeout(function(){connectWs(state.accounts);},2000);};
    }catch(e){state.lastError='ws '+String(e&&e.message||e);status();}
  }
  function schedule(reason,delay){state.reason=reason||state.reason||'event';if(state.queued)return;state.queued=true;setTimeout(function(){state.queued=false;var r=state.reason||'event';state.reason='';refresh(r);},delay==null?250:delay);}

  async function refresh(reason){
    if(state.refreshBusy){state.reason=reason||'queued';return false;}state.refreshBusy=true;
    try{
      var ss=seeds();if(!ss.length)throw new Error('wallet Hyperliquid belum ter-resolve');
      var accounts=await family(ss);if(!accounts.length)throw new Error('account Hyperliquid tidak ditemukan');
      var dxs=await dexes();
      var fr=await Promise.allSettled(accounts.map(fetchFills));
      var or=await Promise.allSettled(accounts.map(function(a){return fetchOpen(a,dxs);}));
      var hr=await Promise.allSettled(accounts.map(fetchHistory));
      var fills=[],opens=[],metaParts=[],fo=0,oo=0,ho=0;
      fr.forEach(function(r){if(r.status==='fulfilled'){fo++;fills=fills.concat(r.value||[]);}});
      or.forEach(function(r){if(r.status==='fulfilled'){oo++;opens=opens.concat(r.value||[]);}});
      hr.forEach(function(r){if(r.status==='fulfilled'){ho++;metaParts.push(r.value||{});}});
      if(!fo&&!oo&&!ho)throw new Error('semua endpoint Hyperliquid gagal');

      if(fo){st.fills=mergeFills(fills);window._allFillsForLog=st.fills.slice();window._tradeLogAllFills=st.fills.slice();}
      if(oo){st.exchange=dedupeOpen(opens);st.pending=st.exchange.slice();}
      if(ho){var meta=mergeMeta(metaParts);m.meta=Object.assign({},m.meta||{},meta);m.lastMetaAt=Date.now();var ledger=window.__CTL_HL_LEDGER_V32__;if(ledger){ledger.parentPending=Object.assign({},ledger.parentPending||{},meta.parentBracket);ledger.childToParent=Object.assign({},ledger.childToParent||{},meta.childToParent);}}
      st.accounts=accounts.slice();st.lastError='';
      state.accounts=accounts.slice();state.apiSuccess=fo+oo+ho;state.fillSuccess=fo;state.openSuccess=oo;state.historySuccess=ho;state.fills=(st.fills||[]).length;state.open=(st.pending||[]).length;state.direct=directRows().length;state.lastSync=Date.now();state.lastGoodSync=state.lastSync;state.lastReason=reason||'poll';
      state.lastError=(fo?'':'userFills retry')+(oo?'':((fo?'':' · ')+'openOrders retry'))+(ho?'':(((fo||oo)?' · ':'')+'historicalOrders retry'));
      connectWs(accounts);ownedRender();
      try{window.dispatchEvent(new CustomEvent('ctl-real-filters-v36',{detail:{accounts:accounts.slice(),fills:state.fills,open:state.open,direct:state.direct,lastSync:state.lastSync,partial:!!state.lastError}}));}catch(e){}
      return true;
    }catch(e){
      state.lastError=String(e&&e.message||e);if(state.lastGoodSync<=0)st.lastError=state.lastError;ownedRender();return false;
    }finally{
      state.refreshBusy=false;if(state.reason){var q=state.reason;state.reason='';schedule(q,250);}
    }
  }

  state.refresh=refresh;state.setMode=st.setMode;state.connectWs=connectWs;state.stop=function(){if(state.timer)clearInterval(state.timer);state.timer=null;wsClose();try{if(state.statusObserver)state.statusObserver.disconnect();}catch(e){}};
  state.timer=setInterval(function(){if(!document.hidden)refresh('poll');},POLL_MS);
  window.addEventListener('focus',function(){schedule('focus',50);});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)schedule('visible',50);});
  buttons();ownedRender();setTimeout(function(){refresh('install');},0);
  return true;
}

window.__ctlInstallRealFiltersV36=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
