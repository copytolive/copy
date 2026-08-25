/* RENKO V12 tick-native engine.
 * Formation is price-event driven: every trade can lock one or many bricks immediately.
 * Continuation = 1 box, reversal = 2 boxes. Wicks come from actual trade extremes.
 */
(function(root){
'use strict';
const EPS=Number.EPSILON;
const num=v=>Number(v);
function decimals(x){const s=String(x);if(s.includes('e-'))return Math.min(12,Number(s.split('e-')[1])||0);const i=s.indexOf('.');return i<0?0:Math.min(12,s.length-i-1)}
function roundTick(v,t){v=num(v);t=num(t);if(!(v>0))return EPS;if(!(t>0))return v;const q=Math.max(1,Math.round(v/t)),d=decimals(t);return Number((q*t).toFixed(d))}
function floorBox(p,b,t){p=num(p);b=num(b);if(!(b>0))return p;const d=decimals(t>0?t:b/1e8),step=t>0?t:b/1e8,raw=Math.floor(p/b)*b;return Number((Math.floor((raw+step*1e-9)/step)*step).toFixed(d))}
function resolveBox(o,ticks){const method=String(o.method||'traditional').toLowerCase(),tick=num(o.tickSize)>0?num(o.tickSize):EPS,last=num(o.ltpSnapshot),fallback=num(ticks?.at?.(-1)?.price);let raw;if(method==='percentage')raw=Math.abs(Number.isFinite(last)?last:fallback)*Math.max(.000001,num(o.percentage)||.01);else if(method==='atr')raw=num(o.atrBox);else raw=num(o.traditionalBox);if(!(raw>0))raw=Math.max(tick,Math.abs(fallback||last||1)*.001);return{box:Math.max(tick,roundTick(raw,tick)),rawBox:raw}}
function init(anchor){return{lastClose:anchor,direction:0,pendingHigh:anchor,pendingLow:anchor,anchor,lastTime:0}}
function clone(s){return s?{lastClose:num(s.lastClose),direction:num(s.direction)||0,pendingHigh:num(s.pendingHigh),pendingLow:num(s.pendingLow),anchor:num(s.anchor),lastTime:num(s.lastTime)||0}:null}
function touch(s,p){if(!Number.isFinite(s.pendingHigh))s.pendingHigh=p;if(!Number.isFinite(s.pendingLow))s.pendingLow=p;if(p>s.pendingHigh)s.pendingHigh=p;if(p<s.pendingLow)s.pendingLow=p}
function resetPending(s,p){s.pendingHigh=p;s.pendingLow=p}
function emit(s,out,open,close,dir,t,box,wicks,rev,sourceId){let high=Math.max(open,close),low=Math.min(open,close);if(wicks){if(dir>0&&Number.isFinite(s.pendingLow))low=Math.min(low,s.pendingLow);if(dir<0&&Number.isFinite(s.pendingHigh))high=Math.max(high,s.pendingHigh)}out.push({time:num(t)||0,open,high,low,close,direction:dir,box,isReversal:!!rev,sourceId:sourceId??null});s.lastClose=close;s.direction=dir;s.lastTime=num(t)||s.lastTime;resetPending(s,close)}
function processTick(s,tick,out,box,wicks){const p=num(tick?.price),tm=num(tick?.time)||0;if(!Number.isFinite(p)||!(box>0))return 0;touch(s,p);const before=out.length;let guard=0;while(guard++<20000){const lc=s.lastClose,d=s.direction;if(d===0){if(p>=lc+box){emit(s,out,lc,lc+box,1,tm,box,wicks,false,tick?.id);continue}if(p<=lc-box){emit(s,out,lc,lc-box,-1,tm,box,wicks,false,tick?.id);continue}break}if(d>0){if(p>=lc+box){emit(s,out,lc,lc+box,1,tm,box,wicks,false,tick?.id);continue}if(p<=lc-2*box){emit(s,out,lc-box,lc-2*box,-1,tm,box,wicks,true,tick?.id);continue}break}if(p<=lc-box){emit(s,out,lc,lc-box,-1,tm,box,wicks,false,tick?.id);continue}if(p>=lc+2*box){emit(s,out,lc+box,lc+2*box,1,tm,box,wicks,true,tick?.id);continue}break}touch(s,p);return out.length-before}
function buildTicks(o){const ticks=(Array.isArray(o?.ticks)?o.ticks:[]).filter(x=>Number.isFinite(num(x?.price))).sort((a,b)=>(num(a.time)-num(b.time))||((num(a.id)||0)-(num(b.id)||0))),tickSize=num(o?.tickSize)>0?num(o.tickSize):EPS,bx=resolveBox(o||{},ticks),box=bx.box,p0=num(ticks[0]?.price);if(!Number.isFinite(p0))return{bricks:[],box,rawBox:bx.rawBox,tailState:null,anchor:null};const anchor=floorBox(p0,box,tickSize),state=init(anchor),bricks=[];for(const t of ticks)processTick(state,t,bricks,box,o?.wicks!==false);return{bricks,box,rawBox:bx.rawBox,tailState:clone(state),anchor}}
const API={buildTicks,processTick,resolveBox,roundTick,floorBox,initState:init,cloneState:clone};root.RenkoV12Engine=API;
root.onmessage=e=>{const m=e.data||{};if(m.type!=='build')return;try{const r=buildTicks(m);root.postMessage({type:'built',id:m.id,generation:m.generation,bricks:r.bricks,box:r.box,rawBox:r.rawBox,tailState:r.tailState,anchor:r.anchor,tickCount:Array.isArray(m.ticks)?m.ticks.length:0})}catch(err){root.postMessage({type:'error',id:m.id,generation:m.generation,message:String(err?.message||err)})}};
})(typeof self!=='undefined'?self:globalThis);
