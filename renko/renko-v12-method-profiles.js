(()=>{
'use strict';
if(window.RWARenkoV12MethodProfiles)return;
const STORE='rwa_renko_v12_method_profiles_v1';
const METHODS=['atr','traditional','percentage'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const $=id=>document.getElementById(id);
let engine=null;
let profiles=null;
let mounted=false;

function defaultsFromEngine(){
  const c=engine?.settings||{};
  const w=c.wicks!==false;
  const confirm=Number(c.confirmBricks)===1?1:2;
  return {
    atr:{atrLength:clamp(Math.floor(Number(c.atrLength)||14),1,200),wicks:w,confirmBricks:confirm},
    traditional:{boxSize:Math.max(Number.EPSILON,Number(c.traditionalBox)||100),wicks:w,confirmBricks:confirm},
    percentage:{percentage:clamp((Number(c.percentage)||.01)*100,.001,10),wicks:w,confirmBricks:confirm}
  };
}
function normalize(p,base){
  p=p&&typeof p==='object'?p:{};
  const out={
    atr:{...base.atr,...(p.atr||{})},
    traditional:{...base.traditional,...(p.traditional||{})},
    percentage:{...base.percentage,...(p.percentage||{})}
  };
  out.atr.atrLength=clamp(Math.floor(Number(out.atr.atrLength)||14),1,200);
  out.traditional.boxSize=Math.max(Number.EPSILON,Number(out.traditional.boxSize)||100);
  out.percentage.percentage=clamp(Number(out.percentage.percentage)||1,.001,10);
  for(const m of METHODS){out[m].wicks=out[m].wicks!==false;out[m].confirmBricks=Number(out[m].confirmBricks)===1?1:2}
  return out;
}
function load(){
  const base=defaultsFromEngine();
  try{return normalize(JSON.parse(localStorage.getItem(STORE)||'{}'),base)}catch{return base}
}
function save(){try{localStorage.setItem(STORE,JSON.stringify(profiles))}catch{}}
function opt(v,label){return `<option value="${v}">${label}</option>`}
function panel(method,title,accent,body){
  return `<section class="v12-profile-panel" data-v12-profile="${method}" style="--profile-accent:${accent}">
    <div class="v12-profile-head"><div><small>INDEPENDENT PROFILE</small><b>${title}</b></div><span class="v12-profile-state">SAVED</span></div>
    <div class="v12-profile-fields">${body}</div>
    <button class="v12-profile-apply" data-v12-apply="${method}">USE & APPLY ${title}</button>
  </section>`;
}
function style(){
  if($('v12MethodProfileStyle'))return;
  const s=document.createElement('style');s.id='v12MethodProfileStyle';s.textContent=`
  .v12-profile-note{grid-column:1/-1;display:flex;align-items:center;gap:7px;min-height:27px;padding:5px 8px;border:1px solid #2a2e39;border-radius:7px;background:#0d1119;color:#8b91a1;font:700 8px/1.2 system-ui;letter-spacing:.02em}
  .v12-profile-note b{color:#d8dbe3;font-size:9px}.v12-profile-note i{width:6px;height:6px;border-radius:50%;background:#2962ff;box-shadow:0 0 0 3px rgba(41,98,255,.12)}
  .v12-profile-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:6px}
  .v12-profile-panel{min-width:0;padding:7px;border:1px solid #2d3340;border-radius:8px;background:#0d1119;transition:border-color .15s,box-shadow .15s,background .15s}
  .v12-profile-panel.active{border-color:var(--profile-accent,#2962ff);box-shadow:0 0 0 1px color-mix(in srgb,var(--profile-accent,#2962ff) 28%,transparent) inset;background:#111722}
  .v12-profile-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px}.v12-profile-head div{min-width:0}.v12-profile-head small{display:block;color:#697080;font:800 6.5px/1 system-ui;letter-spacing:.08em}.v12-profile-head b{display:block;margin-top:3px;color:#e5e7ed;font:850 10px/1 system-ui;white-space:nowrap}.v12-profile-state{padding:3px 5px;border:1px solid #323947;border-radius:999px;color:#777e8e;font:800 6.5px/1 system-ui}.v12-profile-panel.active .v12-profile-state{border-color:var(--profile-accent,#2962ff);color:#dbe5ff}
  .v12-profile-fields{display:grid;grid-template-columns:minmax(62px,1fr) minmax(58px,.7fr) minmax(92px,1.05fr);gap:5px;align-items:end}.v12-profile-field{min-width:0}.v12-profile-field>label{display:block;margin-bottom:3px;color:#7d8493;font:800 6.5px/1 system-ui;letter-spacing:.05em}.v12-profile-field input,.v12-profile-field select{box-sizing:border-box;width:100%;height:26px;border:1px solid #343b49;border-radius:6px;background:#0a0e15;color:#e4e7ee;padding:0 6px;font:750 9px system-ui;outline:none}.v12-profile-field input:focus,.v12-profile-field select:focus{border-color:var(--profile-accent,#2962ff)}
  .v12-profile-check{display:flex;align-items:center;gap:5px;height:26px;padding:0 5px;border:1px solid #343b49;border-radius:6px;background:#0a0e15;color:#bcc1cc;font:750 8px system-ui;white-space:nowrap}.v12-profile-check input{accent-color:var(--profile-accent,#2962ff);margin:0}
  .v12-profile-apply{width:100%;height:25px;margin-top:5px;border:1px solid #3a4353;border-radius:6px;background:#1a2130;color:#d9dde7;font:850 8px system-ui;cursor:pointer}.v12-profile-panel.active .v12-profile-apply{border-color:var(--profile-accent,#2962ff);background:color-mix(in srgb,var(--profile-accent,#2962ff) 24%,#151a25);color:#fff}.v12-profile-apply:hover{filter:brightness(1.12)}
  @media(min-width:1200px){.v12-profile-grid{gap:5px;margin-top:4px}.v12-profile-panel{padding:5px 6px}.v12-profile-head{margin-bottom:4px}.v12-profile-field input,.v12-profile-field select,.v12-profile-check{height:23px}.v12-profile-apply{height:22px;margin-top:4px}.v12-profile-note{min-height:22px;padding:3px 7px}}
  @media(max-width:900px){.v12-profile-grid{grid-template-columns:1fr}.v12-profile-panel{padding:8px}.v12-profile-fields{grid-template-columns:1fr 1fr 1.25fr}}
  `;document.head.appendChild(s);
}
function render(){
  const card=document.querySelector('.v11-toolbar .v10-card:first-child');
  if(!card)return false;
  const modes=card.querySelector('.v11-methods');
  const params=card.querySelector('.v10-params');
  if(!modes||!params)return false;
  const note=card.querySelector('.v10-card-head small');
  if(note)note.textContent='Each method keeps its own settings · formation remains tick-by-tick';
  modes.innerHTML='<div class="v12-profile-note"><i></i><b>3 SEPARATE SETTINGS</b><span>ATR, Traditional and Percentage never share box parameters, Wicks or Entry Confirm.</span></div>';
  modes.style.gridTemplateColumns='1fr';
  params.className='v12-profile-grid';
  params.innerHTML=
    panel('atr','ATR','#9c7cff',`<div class="v12-profile-field"><label>ATR LENGTH</label><input id="v12AtrLength" inputmode="numeric"></div><label class="v12-profile-check"><input id="v12AtrWicks" type="checkbox"> WICKS</label><div class="v12-profile-field"><label>ENTRY CONFIRM</label><select id="v12AtrConfirm">${opt(2,'Reversal + 1')}${opt(1,'First reversal')}</select></div>`)+
    panel('traditional','TRADITIONAL','#2962ff',`<div class="v12-profile-field"><label>BOX SIZE</label><input id="v12TraditionalBox" inputmode="decimal"></div><label class="v12-profile-check"><input id="v12TraditionalWicks" type="checkbox"> WICKS</label><div class="v12-profile-field"><label>ENTRY CONFIRM</label><select id="v12TraditionalConfirm">${opt(2,'Reversal + 1')}${opt(1,'First reversal')}</select></div>`)+
    panel('percentage','PERCENTAGE (LTP)','#089981',`<div class="v12-profile-field"><label>PERCENTAGE %</label><input id="v12Percentage" inputmode="decimal"></div><label class="v12-profile-check"><input id="v12PercentageWicks" type="checkbox"> WICKS</label><div class="v12-profile-field"><label>ENTRY CONFIRM</label><select id="v12PercentageConfirm">${opt(2,'Reversal + 1')}${opt(1,'First reversal')}</select></div>`);
  syncUI();
  document.querySelectorAll('[data-v12-apply]').forEach(b=>b.addEventListener('click',()=>void applyProfile(b.dataset.v12Apply,true)));
  mounted=true;
  return true;
}
function syncUI(){
  if(!profiles)return;
  const set=(id,v)=>{const e=$(id);if(e)e.value=String(v)};
  const check=(id,v)=>{const e=$(id);if(e)e.checked=!!v};
  set('v12AtrLength',profiles.atr.atrLength);check('v12AtrWicks',profiles.atr.wicks);set('v12AtrConfirm',profiles.atr.confirmBricks);
  set('v12TraditionalBox',profiles.traditional.boxSize);check('v12TraditionalWicks',profiles.traditional.wicks);set('v12TraditionalConfirm',profiles.traditional.confirmBricks);
  set('v12Percentage',profiles.percentage.percentage);check('v12PercentageWicks',profiles.percentage.wicks);set('v12PercentageConfirm',profiles.percentage.confirmBricks);
  const active=String(engine?.settings?.method||'atr');
  document.querySelectorAll('[data-v12-profile]').forEach(p=>{const on=p.dataset.v12Profile===active;p.classList.toggle('active',on);const st=p.querySelector('.v12-profile-state');if(st)st.textContent=on?'ACTIVE':'SAVED'});
}
function readProfile(method){
  if(method==='atr'){
    profiles.atr.atrLength=clamp(Math.floor(Number($('v12AtrLength')?.value)||profiles.atr.atrLength),1,200);
    profiles.atr.wicks=!!$('v12AtrWicks')?.checked;
    profiles.atr.confirmBricks=Number($('v12AtrConfirm')?.value)===1?1:2;
  }else if(method==='traditional'){
    profiles.traditional.boxSize=Math.max(Number.EPSILON,Number($('v12TraditionalBox')?.value)||profiles.traditional.boxSize);
    profiles.traditional.wicks=!!$('v12TraditionalWicks')?.checked;
    profiles.traditional.confirmBricks=Number($('v12TraditionalConfirm')?.value)===1?1:2;
  }else if(method==='percentage'){
    profiles.percentage.percentage=clamp(Number($('v12Percentage')?.value)||profiles.percentage.percentage,.001,10);
    profiles.percentage.wicks=!!$('v12PercentageWicks')?.checked;
    profiles.percentage.confirmBricks=Number($('v12PercentageConfirm')?.value)===1?1:2;
  }
  save();
}
function pushProfile(method){
  const c=engine.settings,p=profiles[method];
  c.method=method;
  if(method==='atr')c.atrLength=p.atrLength;
  if(method==='traditional')c.traditionalBox=p.boxSize;
  if(method==='percentage')c.percentage=p.percentage/100;
  c.wicks=p.wicks;
  c.confirmBricks=p.confirmBricks;
}
async function applyProfile(method,read){
  if(!METHODS.includes(method)||!engine)return;
  if(read)readProfile(method);
  pushProfile(method);
  syncUI();
  try{await engine.setMethod(method)}finally{syncUI()}
}
async function boot(){
  for(let i=0;i<300&&!window.RWARenkoV12;i++)await new Promise(r=>setTimeout(r,50));
  engine=window.RWARenkoV12;if(!engine)return;
  profiles=load();style();
  for(let i=0;i<80&&!render();i++)await new Promise(r=>setTimeout(r,50));
  const current=METHODS.includes(engine.settings?.method)?engine.settings.method:'atr';
  pushProfile(current);
  await engine.setMethod(current);
  syncUI();
  setInterval(()=>{if(mounted)syncUI()},1000);
  window.RWARenkoV12MethodProfiles={version:'1.0.0',profiles,apply:applyProfile,storageKey:STORE};
}
boot().catch(e=>console.error('[V12 method profiles]',e));
})();