(()=>{"use strict";
const VERSION=4,CLIENT_KEY="ctl_signal_scan_client_id",norm=s=>String(s||"").replace(/\s+/g," ").trim();
const aliases={back:["Backtest","Home"],fund:["Fundamental"],crypto:["Screener Crypto","Crypto"],signal:["Signal Scan"],hyper:["Hyperliquid"]};
function clientId(){try{let id=localStorage.getItem(CLIENT_KEY);if(!id){const token=(globalThis.crypto&&typeof crypto.randomUUID==="function")?crypto.randomUUID():Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);id="web-"+token;localStorage.setItem(CLIENT_KEY,id)}return id}catch(e){return "web-anonymous"}}
if(!window.__CTL_AI5_SIGNAL_FETCH_PATCH__){const nativeFetch=window.fetch.bind(window);window.fetch=function(input,init){try{const url=typeof input==="string"?input:String(input&&input.url||"");if(url.includes("/trading/signals/unified/scan")){const next=Object.assign({},init||{}),h=new Headers((init&&init.headers)||(typeof Request!=="undefined"&&input instanceof Request?input.headers:undefined)||{});if(!h.has("x-user-id"))h.set("x-user-id",clientId());next.headers=h;return nativeFetch(input,next)}}catch(e){}return nativeFetch(input,init)};window.__CTL_AI5_SIGNAL_FETCH_PATCH__=true}
function install(){return true}
window.__CTL_AI5_SIGNAL_SCAN__={version:5,clientId:clientId(),navOrder:["Home","Fundamental","Signal Scan","Crypto","Renko"],fetchIdentity:true,domSafe:true,install};
})();
