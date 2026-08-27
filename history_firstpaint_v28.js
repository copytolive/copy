(function(){
'use strict';
var VERSION=28,KEY='ctl_hl_firstpaint_meta_v28',MAX_AGE=7*24*60*60*1000,POLL=1500;
function valid(v){return /^0x[a-fA-F0-9]{40}$/.test(String(v||'').trim());}
function lower(v){return valid(v)?String(v).trim().toLowerCase():'';}
function uniq(a){var seen={},out=[];(a||[]).forEach(function(v){v=lower(v);if(v&&!seen[v]){seen[v]=1;out.push(v);}});return out.sort();}
function accounts(st){var out=[];(Array.isArray(st&&st.fills)?st.fills:[]).slice(0,1200).forEach(function(x){var a=lower(x&&x._hlAccount);if(a)out.push(a);});[window._hlAccountWallet,window._userWallet,window._hlActiveWallet,window._hlSelectedWallet,window._pagesHlActiveWallet].forEach(function(x){var a=lower(x);if(a)out.push(a);});return uniq(out);}
function safeParse(s){try{return JSON.parse(s||'null');}catch(e){return null;}}
function load(){var x=null;try{x=safeParse(localStorage.getItem(KEY));}catch(e){}if(!x)try{x=safeParse(sessionStorage.getItem(KEY));}catch(e){}return x;}
function save(x){var s=JSON.stringify(x);try{localStorage.setItem(KEY,s);return true;}catch(e){}try{sessionStorage.setItem(KEY,s);return true;}catch(e){}return false;}
function overlap(a,b){var m={};(a||[]).forEach(function(x){m[x]=1;});for(var i=0;i<(b||[]).length;i++)if(m[b[i]])return true;return false;}
function compactTrigger(x){var o=x&&x.order||{},w=x&&x.wrap||{};return{account:lower(x&&x.account),parentOid:String(x&&x.parentOid||''),order:{oid:o.oid!=null?o.oid:null,order_id:o.order_id!=null?o.order_id:null,cloid:o.cloid!=null?o.cloid:null,coin:o.coin||o.symbol||'',symbol:o.symbol||o.coin||'',side:o.side||'',triggerPx:o.triggerPx!=null?o.triggerPx:null,limitPx:o.limitPx!=null?o.limitPx:null,px:o.px!=null?o.px:null,sz:o.sz!=null?o.sz:null,origSz:o.origSz!=null?o.origSz:null,orderType:o.orderType||'',triggerCondition:o.triggerCondition||'',tpsl:o.tpsl||'',reduceOnly:!!o.reduceOnly,isTrigger:!!o.isTrigger,timestamp:o.timestamp!=null?o.timestamp:null},wrap:{status:w.status||'',statusTimestamp:w.statusTimestamp!=null?w.statusTimestamp:null}};}
function compactMeta(m){var parent={},src=m&&m.parentBracket||{};Object.keys(src).forEach(function(k){if(src[k])parent[String(k)]=1;});var triggers=(m&&Array.isArray(m.triggers)?m.triggers:[]).slice(0,2500).map(compactTrigger);return{parentBracket:parent,triggers:triggers};}
function install(){var old=window.__CTL_FIRSTPAINT_V28__;if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  var st=window.__CTL_HISTORY_STABLE__,m=window.__CTL_HISTORY_MODE_V20__;if(!st||st.version<10||!m||!m.ready){setTimeout(install,80);return false;}
  var state={ready:true,version:VERSION,source:'account-safe-meta-cache-no-dom-writer',timer:null,hydrated:false,lastSaveSig:'',lastError:'',cacheAt:0};window.__CTL_FIRSTPAINT_V28__=state;
  function hydrate(){if(state.hydrated)return false;var c=load(),ac=accounts(st);if(!c||!c.at||Date.now()-Number(c.at)>MAX_AGE||!Array.isArray(c.accounts)||!ac.length||!overlap(ac,c.accounts)){state.hydrated=true;return false;}var cm=c.meta||{},tr=Array.isArray(cm.triggers)?cm.triggers:[],pb=cm.parentBracket&&typeof cm.parentBracket==='object'?cm.parentBracket:{};if(!tr.length&&!Object.keys(pb).length){state.hydrated=true;return false;}m.meta={byOid:{},parentBracket:pb,triggers:tr};m.lastMetaAt=Number(c.at)||0;m.firstPaintCacheAt=m.lastMetaAt;state.cacheAt=m.lastMetaAt;state.hydrated=true;try{if(typeof st.render==='function')st.render();}catch(e){state.lastError=String(e&&e.message||e);}return true;}
  function persist(){var ac=accounts(st),meta=compactMeta(m.meta||{});if(!ac.length||(!meta.triggers.length&&!Object.keys(meta.parentBracket).length))return false;var at=Number(m.lastMetaAt)||Date.now(),sig=[at,ac.join(','),meta.triggers.length,Object.keys(meta.parentBracket).length].join('|');if(sig===state.lastSaveSig)return false;var ok=save({version:VERSION,at:at,accounts:ac,meta:meta});if(ok){state.lastSaveSig=sig;state.cacheAt=at;}return ok;}
  hydrate();persist();state.timer=setInterval(function(){persist();},POLL);return true;
}
window.__ctlInstallFirstPaintV28=install;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
