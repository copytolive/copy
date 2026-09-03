(()=>{"use strict";
const VERSION=4,CLIENT_KEY="ctl_signal_scan_client_id",norm=s=>String(s||"").replace(/\s+/g," ").trim();
const aliases={back:["Backtest","Home"],fund:["Fundamental"],crypto:["Screener Crypto","Crypto"],signal:["Signal Scan"],hyper:["Hyperliquid"]};
function clientId(){try{let id=localStorage.getItem(CLIENT_KEY);if(!id){const token=(globalThis.crypto&&typeof crypto.randomUUID==="function")?crypto.randomUUID():Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);id="web-"+token;localStorage.setItem(CLIENT_KEY,id)}return id}catch(e){return "web-anonymous"}}
if(!window.__CTL_AI5_SIGNAL_FETCH_PATCH__){const nativeFetch=window.fetch.bind(window);window.fetch=function(input,init){try{const url=typeof input==="string"?input:String(input&&input.url||"");if(url.includes("/trading/signals/unified/scan")){const next=Object.assign({},init||{}),h=new Headers((init&&init.headers)||(typeof Request!=="undefined"&&input instanceof Request?input.headers:undefined)||{});if(!h.has("x-user-id"))h.set("x-user-id",clientId());next.headers=h;return nativeFetch(input,next)}}catch(e){}return nativeFetch(input,init)};window.__CTL_AI5_SIGNAL_FETCH_PATCH__=true}
function isAlias(b,list){const t=norm(b&&b.innerText);return list.some(n=>t===n||t.endsWith(" "+n))}
function spanFor(b){const names=Object.values(aliases).flat();return Array.from(b.querySelectorAll("span")).find(s=>names.includes(norm(s.textContent)))||Array.from(b.querySelectorAll("span")).filter(s=>norm(s.textContent)).pop()||null}
function setLabel(b,text){if(!b)return;const s=spanFor(b);if(s)s.textContent=text;else{const walker=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let n,last=null;while(n=walker.nextNode())if(norm(n.nodeValue))last=n;if(last)last.nodeValue=text}b.title=text;b.setAttribute("aria-label",text)}
function matchingButtons(root=document){const buttons=Array.from(root.querySelectorAll("button"));return buttons.filter(b=>Object.values(aliases).some(list=>isAlias(b,list)))}
function bestContainer(){
  const buttons=matchingButtons(document);let best=null,bestDepth=-1;
  for(const b of buttons){let el=b.parentElement,depth=0;while(el&&el!==document.body){const ds=matchingButtons(el);const keys=new Set;for(const x of ds){for(const [k,list] of Object.entries(aliases))if(isAlias(x,list))keys.add(k)}if(keys.has("back")&&keys.has("fund")&&keys.has("crypto")&&keys.has("signal")){if(depth>bestDepth){best=el;bestDepth=depth}break}el=el.parentElement;depth++}}
  return best;
}
function findIn(container,key){return matchingButtons(container).find(b=>isAlias(b,aliases[key]))||null}
function directItem(container,node){let el=node;while(el&&el.parentElement!==container)el=el.parentElement;return el&&el.parentElement===container?el:null}
function enforce(){
  const container=bestContainer();if(!container)return false;
  const back=findIn(container,"back"),fund=findIn(container,"fund"),crypto=findIn(container,"crypto"),signal=findIn(container,"signal"),hyper=findIn(container,"hyper");
  if(!back||!fund||!crypto||!signal)return false;
  setLabel(back,"Home");setLabel(fund,"Fundamental");setLabel(crypto,"Crypto");setLabel(signal,"Signal Scan");if(hyper)setLabel(hyper,"Hyperliquid");
  const nodes=[back,fund,signal,crypto,hyper].filter(Boolean).map(b=>directItem(container,b)).filter(Boolean);
  const uniq=[...new Set(nodes)];
  if(uniq.length>=4){
    const children=Array.from(container.children),idxs=uniq.map(n=>children.indexOf(n)).filter(i=>i>=0),at=Math.min(...idxs);
    const marker=document.createComment("ai5-signal-nav");
    container.insertBefore(marker,children[at]||null);
    const frag=document.createDocumentFragment();uniq.forEach(n=>frag.appendChild(n));
    marker.parentNode.insertBefore(frag,marker.nextSibling);marker.remove();
  }
  (container.closest("nav")||container).dataset.ai5SignalNav="1";
  return true;
}
let timer=null,count=0;
function install(){const ok=enforce();if(ok&&count>16&&timer){clearInterval(timer);timer=null}return ok}
function start(){install();timer=setInterval(()=>{count++;install();if(count>=80&&timer){clearInterval(timer);timer=null}},250);document.addEventListener("click",()=>setTimeout(install,60),true)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.__CTL_AI5_SIGNAL_SCAN__={version:VERSION,clientId:clientId(),navOrder:["Home","Fundamental","Signal Scan","Crypto","Hyperliquid"],fetchIdentity:true,install};
})();
