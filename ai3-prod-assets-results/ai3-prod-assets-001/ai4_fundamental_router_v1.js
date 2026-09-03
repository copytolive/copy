(()=>{"use strict";
const ID="ai4-fundamental-root-view";
const EVENT="copytolive:open-fundamental";
const FRAME_SRC="/fundamental.html?embedded=1&v=20260903-11";
let oldHtmlOverflow="",oldBodyOverflow="";
function isFundamental(el){
  if(!el)return false;
  const text=(el.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
  const href=(el.getAttribute&&el.getAttribute("href")||"").toLowerCase();
  const aria=(el.getAttribute&&el.getAttribute("aria-label")||"").toLowerCase();
  return text==="fundamental"||text.startsWith("fundamental ")||href.includes("/fundamental")||aria.includes("fundamental");
}
function keepRootUrl(){
  try{
    if(location.pathname!=="/"||location.search||location.hash) history.replaceState(null,"","/");
  }catch(_){}
}
function closeFundamental(){
  const node=document.getElementById(ID);
  if(node)node.remove();
  document.documentElement.style.overflow=oldHtmlOverflow;
  if(document.body)document.body.style.overflow=oldBodyOverflow;
  keepRootUrl();
  window.dispatchEvent(new CustomEvent("copytolive:fundamental-closed"));
}
function openFundamental(){
  keepRootUrl();
  const existing=document.getElementById(ID);
  if(existing){const f=existing.querySelector("iframe");if(f)f.focus();return;}
  oldHtmlOverflow=document.documentElement.style.overflow;
  oldBodyOverflow=document.body?document.body.style.overflow:"";
  document.documentElement.style.overflow="hidden";
  if(document.body)document.body.style.overflow="hidden";
  const wrap=document.createElement("div");
  wrap.id=ID;
  wrap.setAttribute("role","dialog");
  wrap.setAttribute("aria-label","Fundamental");
  wrap.style.cssText="position:fixed;inset:0;z-index:2147483600;background:#070b0e;width:100vw;height:100dvh;overflow:hidden;";
  const frame=document.createElement("iframe");
  frame.src=FRAME_SRC;
  frame.title="CopyToLive Fundamental";
  frame.setAttribute("allow","clipboard-read; clipboard-write");
  frame.style.cssText="position:absolute;inset:0;width:100%;height:100%;border:0;background:#070b0e;";
  wrap.appendChild(frame);
  document.body.appendChild(wrap);
  frame.addEventListener("load",()=>{keepRootUrl();window.dispatchEvent(new CustomEvent("copytolive:fundamental-opened"));},{once:true});
}
document.addEventListener("click",e=>{
  const el=e.target&&e.target.closest?e.target.closest("a,button,[role='button']"):null;
  if(!isFundamental(el))return;
  e.preventDefault();
  e.stopPropagation();
  if(e.stopImmediatePropagation)e.stopImmediatePropagation();
  openFundamental();
},true);
function navigateFromFundamental(rawTarget){
  const target=String(rawTarget||"").toLowerCase();
  if(target==="fundamental")return;
  closeFundamental();
  if(target==="home")return;
  const mode={
    "signal-scan":"scanner-signal",
    "screener-crypto":"crypto",
    "hyperliquid":"live-trading",
    "renko":"renko"
  }[target];
  if(!mode)return;
  try{localStorage.setItem("ot_backtest_view_mode",mode);}catch(_){}
  // Reload the root app directly instead of clicking another root nav control.
  // This prevents the Fundamental overlay from being recreated by competing shell listeners.
  setTimeout(()=>{
    try{location.assign("/");}catch(_){location.href="/";}
  },40);
}
window.addEventListener("message",e=>{
  if(e.origin!==location.origin||!e.data||e.data.type!=="copytolive:main-nav")return;
  navigateFromFundamental(e.data.target);
});
window.addEventListener(EVENT,openFundamental);
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.getElementById(ID))closeFundamental();});
window.addEventListener("popstate",()=>{if(document.getElementById(ID))keepRootUrl();});
window.CopyToLiveFundamental={open:openFundamental,close:closeFundamental,navigate:navigateFromFundamental};
})();