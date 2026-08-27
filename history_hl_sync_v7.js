(function(){
'use strict';
var HL='https://api.hyperliquid.xyz/info',POLL=7000,PAGE=20,DEX_CACHE_MS=300000;
function validWallet(v){return /^0x[a-fA-F0-9]{40}$/.test(String(v||'').trim());}
function lower(v){return validWallet(v)?String(v).trim().toLowerCase():'';}
function uniq(a){var seen={},out=[];(a||[]).forEach(function(v){v=lower(v);if(v&&!seen[v]){seen[v]=1;out.push(v);}});return out;}
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function coin(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function iso(v){var m=typeof v==='number'?v:Date.parse(v||'');return Number.isFinite(m)&&m>0?new Date(m).toISOString():'';}
function clone(v){try{return JSON.parse(JSON.stringify(v));}catch(e){return Array.isArray(v)?v.slice():v;}}
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
async function post(body,ms){var c=new AbortController(),t=setTimeout(function(){c.abort();},ms||10000);try{var r=await fetch(HL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:c.signal});if(!r.ok)throw new Error('HL '+r.status+' '+body.type);var d=await r.json();if(d&&d.error)throw new Error(String(d.error));return d;}finally{clearTimeout(t);}}
function sessionEmail(){try{var u=JSON.parse(localStorage.getItem('session_user')||'null');return u&&u.email?String(u.email).trim().toLowerCase():'';}catch(e){return'';}}
function addSeed(out,v){v=lower(v);if(v&&out.indexOf(v)<0)out.push(v);}
function candidateSeeds(){
  var out=[],email=sessionEmail();
  addSeed(out,window._hlAccountWallet);
  addSeed(out,window._userWallet);
  if(email){try{addSeed(out,localStorage.getItem('ot_wallet_'+email));}catch(e){}
    try{addSeed(out,localStorage.getItem('ctl_hl_account_wallet_v3:'+encodeURIComponent(email)));}catch(e){}
    try{var rr=JSON.parse(localStorage.getItem('ctl_hl_resolution_v3:'+encodeURIComponent(email))||'null');if(rr)addSeed(out,rr.account);}catch(e){}
  }
  addSeed(out,window._pagesHlActiveWallet);
  addSeed(out,window._hlActiveWallet);
  addSeed(out,window._hlSelectedWallet);
  addSeed(out,window._userAddress);
  try{if(typeof window.activeHyperliquidWallet==='function')addSeed(out,window.activeHyperliquidWallet());}catch(e){}
  addSeed(out,window._hlAgentWallet);
  return out;
}
async function resolveFamily(seeds){
  var out=uniq(seeds),masters=[];
  async function inspect(a){
    try{
      var r=await post({type:'userRole',user:a},7000),role=String(r&&r.role||'').toLowerCase();
      if(role==='agent'&&validWallet(r&&r.data&&r.data.user)){var owner=lower(r.data.user);addSeed(out,owner);addSeed(masters,owner);}
      else if(role==='subaccount'&&validWallet(r&&r.data&&r.data.master)){var m=lower(r.data.master);addSeed(masters,m);}
      else if(role==='user'){addSeed(masters,a);}
    }catch(e){}
  }
  await Promise.all(out.slice(0,6).map(inspect));
  for(var i=0;i<masters.length&&i<6;i++){
    try{var s=await post({type:'subAccounts',user:masters[i]},8000);if(Array.isArray(s))s.forEach(function(x){addSeed(out,x&&x.subAccountUser);});}catch(e){}
  }
  return uniq(out).slice(0,20);
}
var dexCache={at:0,list:['','xyz','km','vntl']};
async function dexes(){
  if(Date.now()-dexCache.at<DEX_CACHE_MS)return dexCache.list.slice();
  var list=[''];
  try{
    var d=await post({type:'perpDexs'},9000);
    if(Array.isArray(d))d.forEach(function(x){
      var nm='';
      if(typeof x==='string')nm=x;
      else if(x&&typeof x.name==='string')nm=x.name;
      else if(Array.isArray(x)&&typeof x[0]==='string')nm=x[0];
      nm=String(nm||'').trim();if(nm&&list.indexOf(nm)<0)list.push(nm);
    });
  }catch(e){}
  ['xyz','km','vntl'].forEach(function(x){if(list.indexOf(x)<0)list.push(x);});
  dexCache={at:Date.now(),list:list.slice(0,16)};return dexCache.list.slice();
}
function classifyFill(f){
  var dir=String(f&&f.dir||'').trim().toLowerCase();
  if(/^open\b/.test(dir))return'ENTRY';
  if(/^close\b/.test(dir))return'CLOSE';
  var sp=Number(f&&f.startPosition),sz=Math.abs(Number(f&&f.sz));
  if(Number.isFinite(sp)&&Number.isFinite(sz)&&sz>0){
    var side=String(f.side||'').toUpperCase(),delta=(side==='B'||side==='BUY')?sz:-sz,end=sp+delta;
    if(Math.abs(sp)<1e-12&&Math.abs(end)>1e-12)return'ENTRY';
    if(sp*end>0&&Math.abs(end)>Math.abs(sp)+1e-12)return'ENTRY';
    if(sp*end>0&&Math.abs(end)<Math.abs(sp)-1e-12)return'CLOSE';
    if(sp*end<0)return'FLIP';
  }
  return Math.abs(n(f&&f.closedPnl,0))>1e-12?'CLOSE':'UNKNOWN';
}
function normFill(f,acct){
  if(!f)return null;var tm=n(f.time,0)||Date.parse(f.timestamp||'')||0,cls=classifyFill(f),side=String(f.side||'').toUpperCase(),buy=side==='B'||side==='BUY',c=coin(f.coin||f.symbol),p=n(f.px!=null?f.px:f.price,0),sz=n(f.sz!=null?f.sz:f.volume,0),pnl=(cls==='ENTRY')?null:n(f.closedPnl!=null?f.closedPnl:f.pnl,0);
  return{trade_id:f.tid||f.trade_id||f.oid||f.order_id||(acct+'-'+c+'-'+tm+'-'+p+'-'+sz),timestamp:tm?new Date(tm).toISOString():iso(f.timestamp),symbol:c+'/USD',coin:c,type:buy?'BUY':'SELL',side:buy?'BUY':'SELL',direction:String(f.dir||cls),volume:sz,lot:sz,price:p,entry_price:p,pnl:pnl,is_entry:cls==='ENTRY',_fillClass:cls,_hlDir:String(f.dir||''),_hlAccount:acct,_hlOid:f.oid||null,_raw:f};
}
async function fetchFills(accts){
  var rs=await Promise.allSettled(accts.map(function(a){return post({type:'userFills',user:a,aggregateByTime:true},9500);})),all=[],ok=0;
  rs.forEach(function(r,i){if(r.status==='fulfilled'&&Array.isArray(r.value)){ok++;r.value.forEach(function(f){var x=normFill(f,accts[i]);if(x)all.push(x);});}});
  if(!ok)throw new Error('Semua userFills gagal');
  var seen={},out=[];all.forEach(function(x){var k=[x._hlAccount,x.trade_id,x.timestamp,x.symbol,x.price,x.volume].join('|');if(seen[k])return;seen[k]=1;out.push(x);});
  out.sort(function(a,b){return Date.parse(b.timestamp||0)-Date.parse(a.timestamp||0);});return{rows:out,ok:ok,attempted:accts.length};
}
function pendingKind(o){var txt=(String(o&&o.orderType||'')+' '+String(o&&o.triggerCondition||'')).toUpperCase();if(txt.indexOf('TAKE PROFIT')>=0||/(^|\W)TP(\W|$)/.test(txt))return'TP';if(txt.indexOf('STOP')>=0||/(^|\W)SL(\W|$)/.test(txt))return'SL';if(o&&(o.isPositionTpsl||o.isPositionTpSl))return'TP/SL';if(o&&(o.isTrigger||n(o.triggerPx,0)>0))return'TRIGGER';return'LIMIT';}
function normOrder(o,acct,dex,parent){
  if(!o)return null;parent=parent||{};var c=coin(o.coin||parent.coin||o.symbol),s=String(o.side||parent.side||'').toUpperCase(),sell=s==='A'||s==='SELL',trigger=n(o.triggerPx,0),limit=n(o.limitPx!=null?o.limitPx:o.px,0),tm=n(o.timestamp,0)||n(o.time,0)||n(parent.timestamp,0)||Date.now(),kind=pendingKind(o),vol=n(o.sz!=null?o.sz:(o.origSz!=null?o.origSz:parent.sz),0);
  return{order_id:o.oid||o.order_id||o.cloid||('hl-'+acct+'-'+c+'-'+tm+'-'+kind),oid:o.oid||o.order_id||null,timestamp:new Date(tm).toISOString(),created_at:new Date(tm).toISOString(),symbol:c+'/USD',coin:c,type:sell?'SELL':'BUY',side:sell?'SELL':'BUY',direction:kind+(o.reduceOnly?' · REDUCE ONLY':''),volume:vol,lot:vol,price:trigger||limit,limit_price:limit,trigger_price:trigger,pnl:null,_logKind:'pending',_pendingKind:kind,_pendingSource:'HL_OPEN',_hlAccount:acct,_hlDex:dex||'main',_reduceOnly:!!o.reduceOnly,_isTrigger:!!o.isTrigger||trigger>0,_isPositionTpsl:!!(o.isPositionTpsl||o.isPositionTpSl),_orderType:String(o.orderType||''),_triggerCondition:String(o.triggerCondition||''),_raw:o};
}
function flattenOrder(o,acct,dex,parent,out){out=out||[];if(!o)return out;var x=normOrder(o,acct,dex,parent);if(x)out.push(x);var kids=Array.isArray(o.children)?o.children:[];kids.forEach(function(ch){flattenOrder(ch,acct,dex,o,out);});return out;}
function dedupeOrders(all){var seen={},out=[];(all||[]).forEach(function(x){if(!x)return;var k=[x._hlAccount,x.oid||x.order_id,x.symbol,x._pendingKind,x.trigger_price,x.limit_price,x.volume].join('|');if(seen[k])return;seen[k]=1;out.push(x);});out.sort(function(a,b){var ap=/^(TP|SL|TP\/SL|TRIGGER)$/.test(a._pendingKind)?0:1,bp=/^(TP|SL|TP\/SL|TRIGGER)$/.test(b._pendingKind)?0:1;if(ap!==bp)return ap-bp;return Date.parse(b.timestamp||0)-Date.parse(a.timestamp||0);});return out;}
async function fetchOrdersType(type,accts,dxs){
  var tasks=[];accts.forEach(function(a){dxs.forEach(function(d){var b={type:type,user:a};if(d)b.dex=d;tasks.push({a:a,d:d,p:post(b,9000)});});});
  var rs=await Promise.allSettled(tasks.map(function(t){return t.p;})),all=[],ok=0;
  rs.forEach(function(r,i){if(r.status==='fulfilled'&&Array.isArray(r.value)){ok++;r.value.forEach(function(o){flattenOrder(o,tasks[i].a,tasks[i].d,null,all);});}});
  return{rows:all,ok:ok,attempted:tasks.length};
}
async function fetchHistoricalOpen(accts){var rs=await Promise.allSettled(accts.map(function(a){return post({type:'historicalOrders',user:a},10000);})),all=[],ok=0;rs.forEach(function(r,i){if(r.status==='fulfilled'&&Array.isArray(r.value)){ok++;r.value.forEach(function(row){if(String(row&&row.status||'').toLowerCase()!=='open')return;flattenOrder(row&&row.order?row.order:row,accts[i],'historical',null,all);});}});return{rows:all,ok:ok,attempted:accts.length};}
async function fetchOpen(accts,dxs){
  var fr=await fetchOrdersType('frontendOpenOrders',accts,dxs),br=await fetchOrdersType('openOrders',accts,dxs),rows=fr.rows.concat(br.rows),source='frontendOpenOrders+openOrders';
  var hist={rows:[],ok:0,attempted:0};if(!rows.length){hist=await fetchHistoricalOpen(accts);rows=rows.concat(hist.rows);if(hist.rows.length)source='historicalOrders';}
  if(!fr.ok&&!br.ok&&!hist.ok)throw new Error('Semua open-order source Hyperliquid gagal');
  return{rows:dedupeOrders(rows),source:source,ok:fr.ok+br.ok+hist.ok,attempted:fr.attempted+br.attempted+hist.attempted,frontOk:fr.ok,basicOk:br.ok};
}
function cacheKey(kind,seed){return'ctl_hl_'+kind+'_v7:'+(seed||'unknown');}
function readCache(kind,seeds){for(var i=0;i<(seeds||[]).length;i++){try{var raw=sessionStorage.getItem(cacheKey(kind,seeds[i]));if(!raw)continue;var x=JSON.parse(raw);if(x&&Array.isArray(x.rows)&&x.rows.length)return x;}catch(e){}}return null;}
function writeCache(kind,seed,rows,extra){if(!seed||!rows||!rows.length)return;try{sessionStorage.setItem(cacheKey(kind,seed),JSON.stringify({at:Date.now(),rows:rows.slice(0,2000),extra:extra||{}}));}catch(e){}}
function fmtTime(v){if(!v)return'-';var d=new Date(v);if(isNaN(d))return String(v).replace('T',' ').slice(0,19);return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}
function fmtPx(v){v=n(v,0);if(!v)return'—';if(v>=1000)return v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});if(v>=1)return v.toFixed(5).replace(/0+$/,'').replace(/\.$/,'');return v.toFixed(7).replace(/0+$/,'').replace(/\.$/,'');}
function side(x){var s=String(x&& (x.side||x.type||x.direction)||'').toUpperCase();return s.indexOf('SELL')>=0||s.indexOf('SHORT')>=0?'SELL':'BUY';}
function applyCanonicalPerf(){if(window._historySymbolFilter)return false;var p=window._hlPortfolio;if(!p)return false;var net=Number(p.netPnl),end=Number(p.endEquity),dd=Number(p.maxDDpct);if(!Number.isFinite(net)||!Number.isFinite(end))return false;var basis=end-net;function set(id,v,c){var e=document.getElementById(id);if(!e)return;if(e.textContent!==v)e.textContent=v;if(c&&e.style.color!==c)e.style.color=c;}set('statNetPnl',(net>=0?'+':'-')+'$'+Math.abs(net).toFixed(4),net>=0?'var(--green)':'var(--red)');if(basis>0.01){var g=net/basis*100;set('statGrowth',(g>=0?'+':'')+g.toFixed(2)+'%',g>=0?'var(--green)':'var(--red)');set('dInitDeposit','$'+basis.toFixed(2));}if(Number.isFinite(dd))set('statMaxDD',dd.toFixed(2)+'%','var(--red)');return true;}
function installPerfStability(){var old=window.__CTL_PERF_STABLE__;if(old&&old.version>=1){try{old.apply();}catch(e){}return old;}var ctl={version:1,apply:applyCanonicalPerf,timer:null};ctl.timer=setInterval(applyCanonicalPerf,1000);window.__CTL_PERF_STABLE__=ctl;applyCanonicalPerf();return ctl;}
function install(){
  var d=document,oldCtl=window.__CTL_HISTORY_STABLE__,filters=d.getElementById('historyTypeFilters'),tbody=d.getElementById('historyTableBody');if(!filters||!tbody)return false;
  try{if(oldCtl&&oldCtl.timer)clearInterval(oldCtl.timer);if(oldCtl&&oldCtl.domGuard)oldCtl.domGuard.disconnect();}catch(e){}
  var fresh=filters.cloneNode(true);filters.parentNode.replaceChild(fresh,filters);filters=fresh;filters.querySelectorAll('.history-type-filter').forEach(function(b){b.removeAttribute('onclick');b.style.pointerEvents='auto';b.style.cursor='pointer';});
  var seeds=candidateSeeds(),existing=[];
  if(oldCtl&&Array.isArray(oldCtl.fills)&&oldCtl.fills.length)existing=clone(oldCtl.fills);
  else if(Array.isArray(window._allFillsForLog)&&window._allFillsForLog.length)existing=clone(window._allFillsForLog);
  else if(Array.isArray(window._tradeLogAllFills)&&window._tradeLogAllFills.length)existing=clone(window._tradeLogAllFills);
  var fc=readCache('fills',seeds),oc=readCache('open',seeds);if(!existing.length&&fc)existing=clone(fc.rows);
  var mode=String(window._historyTypeFilter||'all');if(['all','pending','direct'].indexOf(mode)<0)mode='all';
  var ctl={ready:true,version:7,source:'hyperliquid-family-v7',mode:mode,fills:existing,hlOpen:oc?clone(oc.rows):[],accounts:[],seed:seeds[0]||'',shown:PAGE,polling:false,lastGood:0,lastError:'',openSource:oc&&oc.extra&&oc.extra.source||'',zeroOpenConfirm:0,zeroFillConfirm:0,timer:null,domGuard:null,rendering:false,statusText:'',statusColor:'var(--green)'};window.__CTL_HISTORY_STABLE__=ctl;installPerfStability();
  function rows(){if(ctl.mode==='direct')return ctl.fills.filter(function(x){return x&&x.is_entry;});if(ctl.mode==='pending')return ctl.hlOpen;return ctl.fills;}
  function setActive(){filters.querySelectorAll('.history-type-filter').forEach(function(b){var a=b.dataset.historyType===ctl.mode;b.classList.toggle('active',a);b.setAttribute('aria-pressed',a?'true':'false');});}
  function buildStatus(rs){var txt;if(ctl.mode==='all')txt='Hyperliquid fills · '+ctl.fills.length+' fills · '+ctl.accounts.length+' account'+(ctl.accounts.length===1?'':'s');else if(ctl.mode==='direct')txt='LANGSUNG ENTRY · '+rs.length+' open/add fills · '+ctl.fills.length+' total fills';else{var tp=ctl.hlOpen.filter(function(x){return /^(TP|SL|TP\/SL|TRIGGER)$/.test(String(x._pendingKind||''));}).length;txt='PENDING ORDER · HL open '+ctl.hlOpen.length+' · TP/SL '+tp+(ctl.openSource?' · '+ctl.openSource:'');}if(ctl.lastError)txt+=' · last sync warning';return txt;}
  function paintStatus(rs){var e=d.getElementById('tradeLogInfo');if(!e)return;ctl.statusText=buildStatus(rs);ctl.statusColor=ctl.lastError?'var(--gold)':'var(--green)';if(e.textContent!==ctl.statusText)e.textContent=ctl.statusText;if(e.style.color!==ctl.statusColor)e.style.color=ctl.statusColor;e.title='Source: real Hyperliquid userFills + frontendOpenOrders/openOrders/historicalOrders for the current resolved account family.';}
  function paintEmpty(rs){var e=d.getElementById('emptyHistory'),t=d.getElementById('historyTable');if(rs.length){if(e)e.style.display='none';if(t)t.style.display='';return;}if(t)t.style.display='none';if(!e)return;e.style.display='';var a=e.querySelector('.text'),b=e.querySelector('.sub');if(ctl.mode==='pending'){if(a)a.textContent='Tidak ada Pending Order aktif';if(b)b.textContent=ctl.lastError?'Sinkronisasi open order belum berhasil; data terakhir yang valid akan dipertahankan.':'Hyperliquid mengembalikan 0 open order untuk seluruh account terkait.';}else if(ctl.mode==='direct'){if(a)a.textContent='Tidak ada open/add fill pada history Hyperliquid';if(b)b.textContent=ctl.fills.length?'Ada '+ctl.fills.length+' fill, tetapi tidak ada yang diklasifikasikan OPEN/ADD.':'Menunggu userFills dari account aktif.';}else{if(a)a.textContent='Belum ada fill Hyperliquid';if(b)b.textContent='Menunggu userFills dari account aktif.';}}
  function render(){if(ctl.rendering)return;ctl.rendering=true;try{setActive();var rs=rows(),max=Math.min(rs.length,ctl.shown||PAGE);tbody.innerHTML='';for(var i=0;i<max;i++){(function(x,idx){var tr=d.createElement('tr'),pending=ctl.mode==='pending',entry=!!x.is_entry,pnl=x.pnl==null?'—':((n(x.pnl)>=0?'+$':'-$')+Math.abs(n(x.pnl)).toFixed(4)),dir=pending?(x._pendingKind||x.direction||'PENDING'):(entry?'ENTRY':(x._fillClass||'CLOSE')),color=x.pnl==null?'var(--text-muted)':(n(x.pnl)>=0?'var(--green)':'var(--red)'),sd=side(x);tr.style.cursor='pointer';tr.title=pending?('Hyperliquid '+dir+(x._orderType?' · '+x._orderType:'')):'Hyperliquid fill · '+dir;tr.innerHTML='<td style="color:var(--text-muted);font-size:11px">'+fmtTime(x.timestamp||x.created_at)+'</td><td>'+(idx+1)+'</td><td style="font-weight:700">'+esc(x.symbol||'-')+'</td><td class="'+(sd==='BUY'?'side-long':'side-short')+'" style="font-weight:800">'+sd+'</td><td style="font-weight:800">'+esc(dir+(pending&&x._reduceOnly?' · REDUCE':''))+'</td><td>'+esc(x.volume!=null?x.volume:(x.lot||0))+'</td><td>'+fmtPx(x.trigger_price||x.price||x.entry_price)+'</td><td style="color:'+color+';font-weight:800">'+pnl+'</td><td style="font-weight:700;color:var(--text-muted)">HL</td>';tr.addEventListener('click',function(){try{if(typeof window.openPendingChart==='function')window.openPendingChart(x.symbol,x.trigger_price||x.price||x.entry_price,0,0,dir,pending?'PENDING':'HL',String(x.trade_id||x.order_id||''));}catch(e){}});tbody.appendChild(tr);})(rs[i],i);}ctl.shown=max;var wrap=d.getElementById('loadMoreDealsWrap'),btn=d.getElementById('loadMoreDealsBtn');if(wrap){if(max<rs.length){wrap.style.display='';if(btn)btn.textContent='📋 Load More +'+Math.min(PAGE,rs.length-max)+' ('+(rs.length-max)+' remaining)';}else wrap.style.display='none';}paintEmpty(rs);paintStatus(rs);}finally{ctl.rendering=false;}}
  ctl.setMode=function(m){m=['all','pending','direct'].indexOf(m)>=0?m:'all';ctl.mode=m;window._historyTypeFilter=m;ctl.shown=PAGE;try{sessionStorage.setItem('copy_history_type_filter',m);}catch(e){}render();};
  ctl.loadMore=function(){ctl.shown=Math.min(rows().length,(ctl.shown||PAGE)+PAGE);render();};window.setHistoryTypeFilter=ctl.setMode;window._loadMoreDeals=ctl.loadMore;
  filters.addEventListener('click',function(ev){var b=ev.target.closest&&ev.target.closest('.history-type-filter');if(!b||!filters.contains(b))return;ev.preventDefault();ev.stopPropagation();ctl.setMode(b.dataset.historyType||'all');},true);
  var guardQueued=false;try{ctl.domGuard=new MutationObserver(function(muts){if(ctl.rendering||guardQueued)return;var relevant=muts.some(function(m){var q=m.target&& (m.target.nodeType===1?m.target:m.target.parentElement);while(q&&q!==d.body){if(q.id==='historyTableBody'||q.id==='emptyHistory'||q.id==='historyTable'||q.id==='tradeLogInfo'||q.id==='historyTypeFilters')return true;q=q.parentElement;}return false;});if(!relevant)return;guardQueued=true;requestAnimationFrame(function(){guardQueued=false;render();});});ctl.domGuard.observe(d.body,{subtree:true,childList:true,characterData:true});}catch(e){}
  async function poll(){if(ctl.polling)return;var currentSeeds=candidateSeeds();if(!currentSeeds.length){ctl.lastError='wallet belum tersedia';render();return;}ctl.polling=true;try{var fam=await resolveFamily(currentSeeds),dx=await dexes();ctl.accounts=fam;ctl.seed=currentSeeds[0];var result=await Promise.allSettled([fetchFills(fam),fetchOpen(fam,dx)]);
      if(result[0].status==='fulfilled'){
        var fr=result[0].value;if(fr.rows.length){ctl.fills=fr.rows;ctl.zeroFillConfirm=0;writeCache('fills',ctl.seed,ctl.fills,{accounts:fam});}
        else{ctl.zeroFillConfirm++;if(!ctl.fills.length&&ctl.zeroFillConfirm>=2)ctl.fills=[];}
      }
      if(result[1].status==='fulfilled'){
        var or=result[1].value;ctl.openSource=or.source;if(or.rows.length){ctl.hlOpen=or.rows;ctl.zeroOpenConfirm=0;writeCache('open',ctl.seed,ctl.hlOpen,{source:or.source,accounts:fam});}
        else{ctl.zeroOpenConfirm++;if(ctl.zeroOpenConfirm>=2)ctl.hlOpen=[];}
      }
      if(result[0].status==='rejected'&&result[1].status==='rejected')throw result[0].reason;
      ctl.lastError='';ctl.lastGood=Date.now();if(ctl.fills.length){window._allFillsForLog=clone(ctl.fills);window._tradeLogAllFills=clone(ctl.fills);}render();
    }catch(e){ctl.lastError=String(e&&e.message||e);render();}finally{ctl.polling=false;}}
  ctl.poll=poll;ctl.timer=setInterval(poll,POLL);render();poll();return true;
}
window.__ctlInstallHlHistoryV7=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();