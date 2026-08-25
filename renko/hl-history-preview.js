(()=>{
'use strict';
if(window.CTLHLRenkoPreview)return;
const INFO='https://api.hyperliquid.xyz/info';
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);
const raw=(q.get('symbol')||'SOL').toUpperCase().replace(/[^A-Z0-9]/g,'');
const COIN=(raw.endsWith('USDT')||raw.endsWith('USDC'))?raw.replace(/(USDT|USDC)$/,''):raw;
const STATIC=`hl-bootstrap-${encodeURIComponent(COIN)}.json`;
const TARGET=90;
let host=null,label=null,chart=null,series=null,bars=[],candles=[],lastExact=0,timer=0;
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:NaN};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function candleTime(c){return n(c?.t??c?.T??c?.time??c?.[0])}
function candleClose(c){return n(c?.c??c?.close??c?.[4])}
function candleHigh(c){return n(c?.h??c?.high??c?.[2])}
function candleLow(c){return n(c?.l??c?.low??c?.[3])}
function clean(rows){
  const m=new Map();
  for(const c of Array.isArray(rows)?rows:[]){const t=candleTime(c),cl=candleClose(c);if(!Number.isFinite(t)||!Number.isFinite(cl))continue;m.set(t,c)}
  return [...m.values()].sort((a,b)=>candleTime(a)-candleTime(b));
}
function atr(rows,len=14){
  const tr=[];let pc=NaN;
  for(const c of rows){const h=candleHigh(c),l=candleLow(c),cl=candleClose(c);if(![h,l,cl].every(Number.isFinite))continue;tr.push(Number.isFinite(pc)?Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)):h-l);pc=cl}
  if(!tr.length)return NaN;len=Math.max(1,Math.min(200,Math.floor(len)));
  if(tr.length<len)return tr.reduce((a,b)=>a+b,0)/tr.length;
  let a=tr.slice(0,len).reduce((x,y)=>x+y,0)/len;for(let i=len;i<tr.length;i++)a=((a*(len-1))+tr[i])/len;return a;
}
function build(rows){
  if(rows.length<2)return {bars:[],box:NaN};
  const last=candleClose(rows[rows.length-1]);let box=atr(rows.slice(-240),14);if(!(box>0))box=Math.abs(last)*0.001;if(!(box>0))return {bars:[],box:NaN};
  const out=[];let lc=NaN,dir=0,tm=0;
  for(const c of rows){const p=candleClose(c),hi=candleHigh(c),lo=candleLow(c),ct=Math.max(1,Math.floor(candleTime(c)/1000));if(!Number.isFinite(p))continue;
    if(!Number.isFinite(lc)){lc=Math.round(p/box)*box;continue}
    let guard=0;
    while(guard++<2000){let o,cl,nd=dir;
      if(dir===0){if(p>=lc+box){o=lc;cl=lc+box;nd=1}else if(p<=lc-box){o=lc;cl=lc-box;nd=-1}else break}
      else if(dir>0){if(p>=lc+box){o=lc;cl=lc+box;nd=1}else if(p<=lc-2*box){o=lc-box;cl=lc-2*box;nd=-1}else break}
      else {if(p<=lc-box){o=lc;cl=lc-box;nd=-1}else if(p>=lc+2*box){o=lc+box;cl=lc+2*box;nd=1}else break}
      tm=Math.max(tm+1,ct);const up=nd>0;
      out.push({time:tm,open:o,close:cl,high:Number.isFinite(hi)?Math.max(o,cl,hi):Math.max(o,cl),low:Number.isFinite(lo)?Math.min(o,cl,lo):Math.min(o,cl),color:up?'#089981':'#f23645',borderColor:up?'#089981':'#f23645',wickColor:up?'#089981':'#f23645'});
      lc=cl;dir=nd;
    }
  }
  return {bars:out,box};
}
function ensure(){
  const wrap=$('chartWrap'),L=window.LightweightCharts;if(!wrap||!L)return false;if(host?.isConnected)return true;
  host=document.createElement('div');host.id='ctlHlHistoryPreview';Object.assign(host.style,{position:'absolute',inset:'0',zIndex:'40',background:'#131722'});
  label=document.createElement('div');label.id='ctlHlHistoryLabel';Object.assign(label.style,{position:'absolute',left:'10px',top:'10px',zIndex:'41',padding:'5px 8px',border:'1px solid #315a52',borderRadius:'4px',background:'rgba(12,30,27,.94)',color:'#78dfb4',font:'700 9px/1.25 system-ui',letterSpacing:'.03em',pointerEvents:'none'});
  label.textContent='HYPERLIQUID HISTORY · loading real market bars…';wrap.append(host,label);
  chart=L.createChart(host,{layout:{background:{type:L.ColorType?.Solid??'solid',color:'#131722'},textColor:'#b2b5be',attributionLogo:false},grid:{vertLines:{color:'rgba(120,123,134,.14)'},horzLines:{color:'rgba(120,123,134,.14)'}},rightPriceScale:{borderColor:'#2a2e39',minimumWidth:64,scaleMargins:{top:.04,bottom:.05}},timeScale:{borderColor:'#2a2e39',timeVisible:true,secondsVisible:false,rightOffset:6,barSpacing:10,minBarSpacing:2},handleScroll:true,handleScale:true,crosshair:{mode:L.CrosshairMode?.Normal??0}});
  series=chart.addSeries(L.CandlestickSeries,{upColor:'#089981',downColor:'#f23645',borderUpColor:'#089981',borderDownColor:'#f23645',wickUpColor:'#089981',wickDownColor:'#f23645',priceLineVisible:true,lastValueVisible:true});
  const ro=new ResizeObserver(es=>{const r=es[0]?.contentRect;if(r?.width&&r?.height)chart?.resize(Math.floor(r.width),Math.floor(r.height))});ro.observe(wrap);return true;
}
function render(rows,source){
  candles=clean(rows);const x=build(candles);bars=x.bars;if(!bars.length||!ensure())return false;series.setData(bars);const count=bars.length;chart.timeScale().setVisibleLogicalRange({from:Math.max(0,count-60),to:count+5});
  label.textContent=`HYPERLIQUID RENKO HISTORY · ${Math.min(60,count)} visible · ${count} confirmed · real 1m source · exact tick syncing`;
  window.CTLHLRenkoPreview={coin:COIN,source,box:x.box,bars:bars,candles:candles,updatedAt:Date.now(),visualOnly:true};
  const tv=$('tvBrickMeta');if(tv)tv.textContent=`${Math.min(60,count)} visible · ${count} history preview`;
  const coverage=$('tvCoverage');if(coverage)coverage.textContent=`HL real history · ${count} Renko preview bricks · exact tick syncing`;
  return true;
}
async function post(payload,timeout=7000){const c=new AbortController(),tm=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(INFO,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',credentials:'omit',signal:c.signal});if(!r.ok)throw Error('HL HTTP '+r.status);return await r.json()}finally{clearTimeout(tm)}}
async function liveHistory(){const end=Date.now(),start=end-36*60*60*1000;return await post({type:'candleSnapshot',req:{coin:COIN,interval:'1m',startTime:start,endTime:end}})}
async function loadStatic(){try{const r=await fetch(STATIC+'?v=20260826',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();const rows=Array.isArray(d)?d:(d.candles||d.data||[]);if(rows.length)return rows}catch(e){console.warn('[HL history static]',e)}return []}
async function refresh(){try{const rows=await liveHistory();if(Array.isArray(rows)&&rows.length){render(rows,'hyperliquid-live-candles');return true}}catch(e){console.warn('[HL history live]',e)}return false}
function maybeYieldToExact(){const exact=window.RWARenkoV12?.state?.data?.length||0;if(exact>=60){lastExact=exact;if(host){host.remove();host=null}if(label){label.remove();label=null}try{chart?.remove()}catch{}chart=null;series=null;clearInterval(timer);timer=0;return true}return false}
async function boot(){
  for(let i=0;i<200&&!window.LightweightCharts;i++)await sleep(20);
  const cached=await loadStatic();if(cached.length)render(cached,'deploy-time-hyperliquid-candles');
  void refresh();
  timer=setInterval(()=>{if(maybeYieldToExact())return;void refresh()},15000);
  setInterval(maybeYieldToExact,500);
}
boot().catch(e=>console.error('[HL history preview]',e));
})();
