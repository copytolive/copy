(function(){
'use strict';

var VERSION=36;
var HL='https://api.hyperliquid.xyz/info';
var WS='wss://api.hyperliquid.xyz/ws';
var POLL_MS=7000;
var FAMILY_TTL=60000;
var PAGE=20;

function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function tm(v){if(typeof v==='number'&&Number.isFinite(v))return v;var x=Date.parse(v||'');return Number.isFinite(x)?x:0;}
function valid(v){return /^0x[a-fA-F0-9]{40}$/.test(String(v||'').trim());}
function lower(v){return valid(v)?String(v).trim().toLowerCase():'';}
function uniq(a){var s={},o=[];(a||[]).forEach(function(v){v=lower(v);if(v&&!s[v]){s[v]=1;o.push(v);}});return o;}
function add(a,v){v=lower(v);if(v&&a.indexOf(v)<0)a.push(v);}
function safeJson(v){try{return JSON.parse(v||'null');}catch(e){return null;}}
function coin(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function oid(v){return v==null?'':String(v);}
function clone(v){try{return JSON.parse(JSON.stringify(v));}catch(e){return Array.isArray(v)?v.slice():v;}}

async function post(body,ms){
  var c=new AbortController(),t=setTimeout(function(){c.abort();},ms||10000);
  try{
    var r=await fetch(HL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:c.signal});
    if(!r.ok)throw new Error('HL '+r.status+' '+body.type);
    var d=await r.json();
    if(d&&d.error)throw new Error(String(d.error));
    return d;
  }finally{clearTimeout(t);}
}

function sessionEmail(){
  try{
    var u=safeJson(localStorage.getItem('session_user'));
    return u&&u.email?String(u.email).trim().toLowerCase():'';
  }catch(e){return'';}
}

function seedAccounts(){
  var out=[],email=sessionEmail(),p=null;
  try{p=safeJson(localStorage.getItem('ctl_hl_proven_accounts_v10'));}catch(e){}
  if(p&&Array.isArray(p.accounts))p.accounts.forEach(function(a){add(out,a);});
  add(out,window._hlAccountWallet);
  add(out,window._userWallet);
  add(out,window._hlActiveWallet);
  add(out,window._hlSelectedWallet);
  add(out,window._pagesHlActiveWallet);
  add(out,window._userAddress);
  add(out,window._hlAgentWallet);
  try{if(typeof window.activeHyperliquidWallet==='function')add(out,window.activeHyperliquidWallet());}catch(e){}
  if(email){
    try{add(out,localStorage.getItem('ot_wallet_'+email));}catch(e){}
    try{add(out,localStorage.getItem('ctl_hl_account_wallet_v3:'+encodeURIComponent(email)));}catch(e){}
    try{
      var rr=safeJson(localStorage.getItem('ctl_hl_resolution_v3:'+encodeURIComponent(email)));
      if(rr){add(out,rr.account);add(out,rr.owner);}
    }catch(e){}
  }
  var st=window.__CTL_HISTORY_STABLE__;
  (Array.isArray(st&&st.accounts)?st.accounts:[]).forEach(function(a){add(out,a);});
  (Array.isArray(st&&st.fills)?st.fills:[]).slice(0,400).forEach(function(f){add(out,f&&f._hlAccount);});
  return uniq(out).slice(0,16);
}

var familyCache={key:'',at:0,accounts:[]};

async function resolveFamily(seeds){
  seeds=uniq(seeds);
  var key=seeds.join('|');
  if(key&&familyCache.key===key&&Date.now()-familyCache.at<FAMILY_TTL&&familyCache.accounts.length){
    return familyCache.accounts.slice();
  }
  var out=seeds.slice(),masters=[];
  async function inspect(a){
    try{
      var r=await post({type:'userRole',user:a},6500);
      var role=String(r&&r.role||'').toLowerCase();
      if(role==='agent'&&valid(r&&r.data&&r.data.user)){add(out,r.data.user);add(masters,r.data.user);}
      else if(role==='subaccount'&&valid(r&&r.data&&r.data.master)){add(out,r.data.master);add(masters,r.data.master);}
      else if(role==='user')add(masters,a);
    }catch(e){}
  }
  await Promise.all(seeds.slice(0,10).map(inspect));
  for(var i=0;i<masters.length&&i<6;i++){
    try{
      var s=await post({type:'subAccounts',user:masters[i]},8000);
      if(Array.isArray(s))s.forEach(function(x){add(out,x&&x.subAccountUser);});
    }catch(e){}
  }
  out=uniq(out).slice(0,20);
  familyCache={key:key,at:Date.now(),accounts:out.slice()};
  return out;
}

var dexCache={at:0,list:['']};
async function dexes(){
  if(Date.now()-dexCache.at<300000)return dexCache.list.slice();
  var list=[''];
  try{
    var d=await post({type:'perpDexs'},8000);
    if(Array.isArray(d))d.forEach(function(x){
      var nm=typeof x==='string'?x:(x&&typeof x.name==='string'?x.name:(Array.isArray(x)?x[0]:''));
      nm=String(nm||'').trim();
      if(nm&&list.indexOf(nm)<0)list.push(nm);
    });
  }catch(e){}
  dexCache={at:Date.now(),list:list.slice(0,12)};
  return dexCache.list.slice();
}

function classifyFill(f){
  var dir=String(f&&f.dir||'').trim().toLowerCase();
  if(/^open\b/.test(dir))return'ENTRY';
  if(/^close\b/.test(dir))return'CLOSE';
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
  var t=n(f.time,0)||tm(f.timestamp),cls=classifyFill(f),buy=String(f.side||'').toUpperCase()==='B',c=coin(f.coin||f.symbol),px=n(f.px!=null?f.px:f.price,0),sz=Math.abs(n(f.sz!=null?f.sz:f.volume,0)),cp=n(f.closedPnl,0),fee=Math.abs(n(f.fee,0)),feeToken=String(f.feeToken||'USDC').toUpperCase(),feeUsd=(feeToken==='USDC'||feeToken==='USDT'||feeToken==='USDE')?fee:0;
  return{
    trade_id:f.tid||f.trade_id||f.oid||(a+'-'+c+'-'+t+'-'+px+'-'+sz),
    timestamp:t?new Date(t).toISOString():String(f.timestamp||''),
    time:t,
    symbol:c+'/USD',
    coin:c,
    type:buy?'BUY':'SELL',
    side:buy?'BUY':'SELL',
    direction:String(f.dir||cls),
    volume:sz,
    lot:sz,
    price:px,
    entry_price:px,
    pnl:cls==='ENTRY'?null:cp,
    is_entry:cls==='ENTRY',
    _fillClass:cls,
    _hlDir:String(f.dir||''),
    _hlAccount:a,
    _hlOid:f.oid==null?null:String(f.oid),
    _hlTid:f.tid==null?null:String(f.tid),
    _hlClosedPnl:cp,
    _hlFee:fee,
    _hlFeeUsd:feeUsd,
    _hlFeeKnown:fee===0||feeUsd===fee,
    _hlFeeToken:feeToken,
    _hlNetPnl:cp-feeUsd,
    _raw:f
  };
}

function fillKey(x){
  return[x&&x._hlAccount||'',x&&x._hlTid||x&&x.trade_id||'',x&&x._hlOid||'',x&&x.time||tm(x&&x.timestamp),x&&x.symbol||'',n(x&&x.price),n(x&&x.volume)].join('|');
}

function mergeFills(rows){
  var seen={},out=[];
  (rows||[]).forEach(function(x){if(!x)return;var k=fillKey(x);if(seen[k])return;seen[k]=1;out.push(x);});
  out.sort(function(a,b){return tm(b.timestamp)-tm(a.timestamp);});
  return out.slice(0,10000);
}

function isTrigger(o){
  if(!o)return false;
  var txt=(String(o.orderType||'')+' '+String(o.triggerCondition||'')+' '+String(o.tpsl||'')).toUpperCase();
  return !!o.isTrigger||!!o.isPositionTpsl||!!o.isPositionTpSl||n(o.triggerPx,0)>0||txt.indexOf('TAKE PROFIT')>=0||txt.indexOf('STOP')>=0||/(^|\W)(TP|SL)(\W|$)/.test(txt);
}

function triggerKind(o){
  var txt=(String(o&&o.orderType||'')+' '+String(o&&o.triggerCondition||'')+' '+String(o&&o.tpsl||'')).toUpperCase();
  if(txt.indexOf('TAKE PROFIT')>=0||/(^|\W)TP(\W|$)/.test(txt))return'TP';
  if(txt.indexOf('STOP')>=0||/(^|\W)SL(\W|$)/.test(txt))return'SL';
  return'TRIGGER';
}

function normOpen(o,a,d,parent){
  if(!o)return null;
  parent=parent||{};
  var c=coin(o.coin||parent.coin||o.symbol),s=String(o.side||parent.side||'').toUpperCase(),sell=s==='A'||s==='SELL',tr=n(o.triggerPx,0),lp=n(o.limitPx!=null?o.limitPx:o.px,0),t=n(o.timestamp,0)||n(o.time,0)||n(parent.timestamp,0)||Date.now(),q=Math.abs(n(o.sz!=null?o.sz:(o.origSz!=null?o.origSz:parent.sz),0)),k=triggerKind(o);
  return{
    order_id:o.oid||o.order_id||o.cloid||('v36-'+a+'-'+c+'-'+t+'-'+k),
    oid:o.oid||o.order_id||null,
    timestamp:new Date(t).toISOString(),
    created_at:new Date(t).toISOString(),
    symbol:c+'/USD',
    coin:c,
    type:sell?'SELL':'BUY',
    side:sell?'SELL':'BUY',
    direction:k+(o.reduceOnly?' · REDUCE ONLY':''),
    volume:q,
    lot:q,
    price:tr||lp,
    limit_price:lp,
    trigger_price:tr,
    pnl:null,
    _pendingKind:k,
    _pendingSource:'HL_OPEN',
    _source:'HL_OPEN',
    _status:'OPEN',
    _hlAccount:a,
    _hlDex:d||'main',
    _hlOid:o.oid==null?null:String(o.oid),
    _reduceOnly:!!o.reduceOnly,
    _orderType:String(o.orderType||''),
    _triggerCondition:String(o.triggerCondition||'')
  };
}

function flattenOpen(o,a,d,parent,out){
  out=out||[];
  if(!o)return out;
  if(isTrigger(o)){
    var x=normOpen(o,a,d,parent);
    if(x&&x.price>0&&x.volume>0)out.push(x);
  }
  (Array.isArray(o.children)?o.children:[]).forEach(function(ch){flattenOpen(ch,a,d,o,out);});
  return out;
}

function openKey(x){
  return[x&&x._hlAccount||'',x&&x._hlOid||x&&x.order_id||'',x&&x.symbol||'',x&&x._pendingKind||'',n(x&&x.trigger_price||x&&x.price,0),n(x&&x.volume,0)].join('|');
}

function dedupeOpen(rows){
  var seen={},out=[];
  (rows||[]).forEach(function(x){if(!x)return;var k=openKey(x);if(seen[k])return;seen[k]=1;out.push(x);});
  out.sort(function(a,b){return tm(b.timestamp)-tm(a.timestamp);});
  return out;
}

async function fetchAccountFills(a){
  var r=await post({type:'userFills',user:a,aggregateByTime:true},10000);
  return(Array.isArray(r)?r:[]).map(function(f){return normFill(f,a);}).filter(Boolean);
}

async function fetchAccountOpen(a,dxs){
  var tasks=[];
  dxs.forEach(function(d){
    var a1={type:'frontendOpenOrders',user:a};if(d)a1.dex=d;
    var a2={type:'openOrders',user:a};if(d)a2.dex=d;
    tasks.push({d:d,p:post(a1,9000)});
    tasks.push({d:d,p:post(a2,9000)});
  });
  var rs=await Promise.allSettled(tasks.map(function(x){return x.p;})),out=[],ok=0;
  rs.forEach(function(r,i){
    if(r.status!=='fulfilled'||!Array.isArray(r.value))return;
    ok++;
    r.value.forEach(function(o){flattenOpen(o,a,tasks[i].d,null,out);});
  });
  if(!ok)throw new Error('openOrders gagal '+a);
  return dedupeOpen(out);
}

function flattenHistory(a,rows){
  var byOid={},parentBracket={},childToParent={},triggers=[];
  function put(o,w,parent){
    if(!o)return;
    var id=oid(o.oid||o.order_id||o.cloid),kids=Array.isArray(o.children)?o.children:[];
    if(id&&!byOid[id])byOid[id]={account:a,order:o,wrap:w,parentOid:parent||''};
    if(id&&!o.reduceOnly&&kids.some(isTrigger))parentBracket[id]=1;
    if(isTrigger(o)){
      triggers.push({account:a,order:o,wrap:w,parentOid:parent||''});
      if(id&&parent){childToParent[id]=String(parent);parentBracket[String(parent)]=1;}
    }
    kids.forEach(function(ch){put(ch,w,id||parent||'');});
  }
  (Array.isArray(rows)?rows:[]).forEach(function(w){put(w&&w.order?w.order:w,w,'');});
  return{byOid:byOid,parentBracket:parentBracket,childToParent:childToParent,triggers:triggers};
}

function mergeMeta(parts){
  var out={byOid:{},parentBracket:{},childToParent:{},triggers:[]},seen={};
  parts.forEach(function(p){
    Object.assign(out.byOid,p.byOid||{});
    Object.assign(out.parentBracket,p.parentBracket||{});
    Object.assign(out.childToParent,p.childToParent||{});
    (p.triggers||[]).forEach(function(x){
      var o=x&&x.order||{},k=[x.account,oid(o.oid||o.order_id||o.cloid),triggerKind(o),n(o.triggerPx||o.limitPx||o.px,0),n(o.sz||o.origSz,0),String(x&&x.wrap&&x.wrap.status||'')].join('|');
      if(!seen[k]){seen[k]=1;out.triggers.push(x);}
    });
  });
  out.triggers.sort(function(a,b){return n(b&&b.wrap&&b.wrap.statusTimestamp,0)-n(a&&a.wrap&&a.wrap.statusTimestamp,0);});
  return out;
}

async function fetchAccountHistory(a){
  var r=await post({type:'historicalOrders',user:a},10000);
  return flattenHistory(a,Array.isArray(r)?r:[]);
}

function buttonState(st){
  var f=document.getElementById('historyTypeFilters');if(!f)return;
  f.querySelectorAll('[data-history-type]').forEach(function(b){
    var on=String(b.dataset.historyType||'all')===st.mode;
    b.classList.toggle('active',on);
    b.setAttribute('aria-pressed',on?'true':'false');
    b.disabled=false;
    b.style.pointerEvents='auto';
    b.style.cursor='pointer';
  });
}

function paintStatus(state){
  var st=window.__CTL_HISTORY_STABLE__,m=window.__CTL_HISTORY_MODE_V20__,e=document.getElementById('tradeLogInfo');
  if(!st||!e)return;
  var direct=0,pb=m&&m.meta&&m.meta.parentBracket||{};
  (st.fills||[]).forEach(function(f){if(f&&f.is_entry){var id=oid(f._hlOid);if(!(id&&pb[id]))direct++;}});
  var txt='REAL HYPERLIQUID · '+(state.wsConnected?'LIVE':'REST')+' · '+state.accounts.length+' account';
  if(st.mode==='all')txt+=' · '+(st.fills||[]).length+' fills';
  else if(st.mode==='pending')txt+=' · '+(st.pending||[]).length+' active TP/SL';
  else txt+=' · '+direct+' direct entries';
  if(state.lastError)txt+=' · retrying: '+state.lastError;
  e.textContent=txt;
  e.style.color=state.lastError?'var(--gold)':'var(--green)';
  e.dataset.realHyperliquid='36';
}

function install(){
  var st=window.__CTL_HISTORY_STABLE__,m=window.__CTL_HISTORY_MODE_V20__,fix=window.__CTL_HL_FIX_V23__,z=window.__CTL_ZERO_FLICKER_V35__;
  if(!st||st.version<10||!m||!m.ready||!fix||!fix.ready||!z||!z.ready||typeof st.render!=='function'){
    setTimeout(install,120);return false;
  }
  var old=window.__CTL_REAL_FILTERS_V36__;
  if(old&&old.ready){try{old.refresh&&old.refresh('reinstall');}catch(e){}return true;}

  var state={
    ready:true,
    version:VERSION,
    source:'real-hyperliquid-userFills+frontendOpenOrders+openOrders+historicalOrders+ws-trigger',
    accounts:[],
    lastSync:0,
    lastError:'',
    refreshBusy:false,
    refreshQueued:false,
    refreshReason:'',
    timer:null,
    ws:null,
    wsConnected:false,
    wsAccountsKey:'',
    wsReconnect:null,
    apiSuccess:0,
    fills:0,
    open:0,
    historyAccounts:0,
    mode:st.mode||'all'
  };
  window.__CTL_REAL_FILTERS_V36__=state;

  function renderSoon(){
    if(state.renderQueued)return;
    state.renderQueued=true;
    requestAnimationFrame(function(){
      state.renderQueued=false;
      try{st.render();}catch(e){state.lastError=String(e&&e.message||e);}
      buttonState(st);
      paintStatus(state);
    });
  }

  st.setMode=function(mode){
    mode=['all','pending','direct'].indexOf(mode)>=0?mode:'all';
    st.mode=mode;
    state.mode=mode;
    window._historyTypeFilter=mode;
    st.shown=PAGE;
    m.shown=PAGE;
    try{sessionStorage.setItem('copy_history_type_filter',mode);}catch(e){}
    buttonState(st);
    renderSoon();
    return true;
  };
  window.setHistoryTypeFilter=st.setMode;

  function wsClose(){
    if(state.wsReconnect){clearTimeout(state.wsReconnect);state.wsReconnect=null;}
    if(state.ws){try{state.ws.onclose=null;state.ws.close();}catch(e){}state.ws=null;}
    state.wsConnected=false;
  }

  function scheduleRefresh(reason,delay){
    state.refreshReason=reason||state.refreshReason||'event';
    if(state.refreshQueued)return;
    state.refreshQueued=true;
    setTimeout(function(){state.refreshQueued=false;refresh(state.refreshReason);},delay==null?250:delay);
  }

  function connectWs(accounts){
    accounts=uniq(accounts);
    var key=accounts.join('|');
    if(!accounts.length){wsClose();return;}
    if(state.ws&&state.wsConnected&&state.wsAccountsKey===key)return;
    wsClose();
    state.wsAccountsKey=key;
    try{
      var ws=new WebSocket(WS);state.ws=ws;
      ws.onopen=function(){
        if(state.ws!==ws)return;
        state.wsConnected=true;
        accounts.forEach(function(a){
          try{ws.send(JSON.stringify({method:'subscribe',subscription:{type:'userFills',user:a}}));}catch(e){}
          try{ws.send(JSON.stringify({method:'subscribe',subscription:{type:'orderUpdates',user:a}}));}catch(e){}
        });
        paintStatus(state);
      };
      ws.onmessage=function(ev){
        if(state.ws!==ws)return;
        var msg=safeJson(ev&&ev.data),ch=String(msg&&msg.channel||'');
        if(ch==='userFills'||ch==='orderUpdates')scheduleRefresh('ws-'+ch,120);
      };
      ws.onerror=function(){state.wsConnected=false;paintStatus(state);};
      ws.onclose=function(){
        if(state.ws!==ws)return;
        state.ws=null;state.wsConnected=false;paintStatus(state);
        state.wsReconnect=setTimeout(function(){connectWs(state.accounts);},2000);
      };
    }catch(e){state.lastError='ws '+String(e&&e.message||e);paintStatus(state);}
  }

  async function refresh(reason){
    if(state.refreshBusy){state.refreshReason=reason||'queued';return false;}
    state.refreshBusy=true;
    try{
      var seeds=seedAccounts();
      if(!seeds.length){
        state.lastError='wallet Hyperliquid belum ter-resolve';
        paintStatus(state);
        return false;
      }
      var accounts=await resolveFamily(seeds);
      if(!accounts.length){
        state.lastError='account Hyperliquid tidak ditemukan';
        paintStatus(state);
        return false;
      }
      var dxs=await dexes(),fillJobs=accounts.map(fetchAccountFills),openJobs=accounts.map(function(a){return fetchAccountOpen(a,dxs);}),histJobs=accounts.map(fetchAccountHistory);
      var all=await Promise.allSettled([Promise.allSettled(fillJobs),Promise.allSettled(openJobs),Promise.allSettled(histJobs)]);
      var fills=[],opens=[],metaParts=[],success=0;
      if(all[0].status==='fulfilled')all[0].value.forEach(function(r){if(r.status==='fulfilled'){success++;fills=fills.concat(r.value||[]);}});
      if(all[1].status==='fulfilled')all[1].value.forEach(function(r){if(r.status==='fulfilled'){success++;opens=opens.concat(r.value||[]);}});
      if(all[2].status==='fulfilled')all[2].value.forEach(function(r){if(r.status==='fulfilled'){success++;metaParts.push(r.value);}});
      if(!success)throw new Error('semua endpoint Hyperliquid gagal');

      fills=mergeFills(fills);
      opens=dedupeOpen(opens);
      var meta=mergeMeta(metaParts);

      if(fills.length){
        st.fills=fills;
        window._allFillsForLog=clone(fills);
        window._tradeLogAllFills=clone(fills);
      }else if(!Array.isArray(st.fills)){st.fills=[];}

      st.exchange=opens.slice();
      st.pending=opens.slice();
      st.accounts=accounts.slice();
      st.lastError='';

      m.meta=meta;
      m.lastMetaAt=Date.now();
      m.lastError='';

      var ledger=window.__CTL_HL_LEDGER_V32__;
      if(ledger){
        ledger.parentPending=Object.assign({},ledger.parentPending||{},meta.parentBracket||{});
        ledger.childToParent=Object.assign({},ledger.childToParent||{},meta.childToParent||{});
      }

      state.accounts=accounts.slice();
      state.lastSync=Date.now();
      state.lastError='';
      state.apiSuccess=success;
      state.fills=(st.fills||[]).length;
      state.open=opens.length;
      state.historyAccounts=metaParts.length;
      state.lastReason=reason||'poll';

      connectWs(accounts);

      try{
        if(ledger&&typeof ledger.sync==='function')Promise.resolve(ledger.sync()).catch(function(){});
      }catch(e){}

      renderSoon();
      try{window.dispatchEvent(new CustomEvent('ctl-real-filters-v36',{detail:{accounts:accounts.slice(),fills:state.fills,open:state.open,lastSync:state.lastSync}}));}catch(e){}
      return true;
    }catch(e){
      state.lastError=String(e&&e.message||e);
      st.lastError=state.lastError;
      renderSoon();
      return false;
    }finally{
      state.refreshBusy=false;
      if(state.refreshReason&&state.refreshReason!==reason){
        var q=state.refreshReason;state.refreshReason='';scheduleRefresh(q,250);
      }
    }
  }

  state.refresh=refresh;
  state.setMode=st.setMode;
  state.connectWs=connectWs;
  state.stop=function(){
    if(state.timer)clearInterval(state.timer);
    state.timer=null;wsClose();
  };

  buttonState(st);
  state.timer=setInterval(function(){if(!document.hidden)refresh('poll');},POLL_MS);
  window.addEventListener('focus',function(){scheduleRefresh('focus',50);});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)scheduleRefresh('visible',50);});
  setTimeout(function(){refresh('install');},0);
  return true;
}

window.__ctlInstallRealFiltersV36=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});
else setTimeout(install,0);
})();
