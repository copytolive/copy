import{r as React,j as J}from"./dashboard-WZpp2Gui.js";

const API_BASE="/trading/signals";
const MAJORS=["BTC","ETH","SOL","HYPE","XRP","DOGE","BNB"];
const TF=["15m","1h","4h","1d"];
const RRS=["1:1","1:1.5","1:2","1:2.5","1:3"];
const RR_VALUE={"1:1":1,"1:1.5":1.5,"1:2":2,"1:2.5":2.5,"1:3":3};
const MODES=["strict","moderate","aggressive"];
const MAX_SELECTED=40;
const AUTO_PREFILTER_MAX=20;

function keyOf(pairs,tf,rr,mode){
  return [pairs.slice().sort().join(","),tf,rr,mode].join("|");
}
function fmtMs(ms){
  const n=Number(ms||0);
  if(!Number.isFinite(n)||n<=0)return "—";
  return n<1000?Math.round(n)+" ms":(n/1000).toFixed(1)+" s";
}
function nowLabel(ts){
  try{return new Date(ts).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"});}catch{return "—";}
}
function pickText(v,fallback="—"){return v===null||v===undefined||v===""?fallback:String(v)}
function scoreText(v){const n=Number(v);return Number.isFinite(n)?n.toFixed(1):"—"}

function StaticChart({pair,bars,height=220}){
  const rows=(Array.isArray(bars)?bars:[]).slice(-60).map(r=>({
    o:Number(r.open??r.o),h:Number(r.high??r.h),l:Number(r.low??r.l),c:Number(r.close??r.c)
  })).filter(r=>[r.o,r.h,r.l,r.c].every(Number.isFinite));
  if(!rows.length)return J.jsx("div",{className:"h-full flex items-center justify-center text-[11px] text-zinc-600",children:"Chart data tidak tersedia"});
  const lo=Math.min(...rows.map(r=>r.l)),hi=Math.max(...rows.map(r=>r.h)),span=Math.max(1e-12,hi-lo);
  const W=1000,H=Math.max(180,height),step=W/rows.length,y=v=>H-12-(v-lo)/span*(H-24);
  const shapes=[];
  rows.forEach((r,i)=>{
    const x=i*step+step/2,color=r.c>=r.o?"#10b981":"#f43f5e";
    shapes.push(J.jsx("line",{x1:x,x2:x,y1:y(r.h),y2:y(r.l),stroke:color,strokeWidth:1},"w-"+i));
    shapes.push(J.jsx("rect",{x:x-Math.max(1,step*.28),y:Math.min(y(r.o),y(r.c)),width:Math.max(2,step*.56),height:Math.max(1,Math.abs(y(r.c)-y(r.o))),fill:color,opacity:.9},"b-"+i));
  });
  return J.jsx("svg",{viewBox:"0 0 1000 "+H,preserveAspectRatio:"none",className:"w-full h-full block bg-zinc-950",role:"img","aria-label":pair+" static candlestick chart",children:shapes});
}

function SelectCell({label,value,onChange,options}){
  return J.jsxs("label",{className:"min-w-0 px-4 py-3 flex flex-col justify-center border-r border-[#2B3139]",style:{flex:"1 1 150px",minWidth:"135px"},children:[
    J.jsx("span",{className:"text-[12px] font-extrabold text-[#EAECEF]",children:label}),
    J.jsx("select",{value,onChange:e=>onChange(e.target.value),className:"mt-0.5 w-full bg-transparent border-0 outline-none text-[13px] text-[#848E9C] cursor-pointer",children:options.map(o=>J.jsx("option",{value:o.value??o,children:o.label??o},o.value??o))})
  ]});
}

function PairChip({pair,selected,onToggle}){
  return J.jsx("button",{type:"button",onClick:()=>onToggle(pair),className:"px-2.5 py-1.5 rounded-md text-[11px] font-bold border transition-none "+(selected?"bg-[#F0B90B]/15 border-[#F0B90B]/40 text-[#FFD700]":"bg-[#1b2027] border-[#252b33] text-[#8b95a5] hover:text-zinc-200"),"aria-pressed":selected,children:pair});
}

function VoteDetails({votes}){
  const rows=Array.isArray(votes)?votes:[];
  if(!rows.length)return J.jsx("div",{className:"text-[11px] text-zinc-600 px-3 py-2",children:"Detail engine tidak tersedia"});
  return J.jsx("div",{className:"space-y-1.5 px-3 pb-3",children:rows.slice(0,14).map((v,i)=>J.jsxs("div",{className:"flex items-center gap-2 rounded-md bg-[#0d1115] border border-[#222831] px-2.5 py-2 text-[11px]",children:[
    J.jsx("span",{className:"flex-1 text-zinc-300 truncate",children:String(v.engine||v.name||"engine").replaceAll("_"," ")}),
    J.jsx("span",{className:"text-zinc-500",children:pickText(v.direction,"HOLD")}),
    J.jsx("span",{className:"font-mono text-zinc-400",children:Number.isFinite(Number(v.confidence))?Math.round(Number(v.confidence))+"%":"—"})
  ]},v.engine||i))});
}

function CandidateCard({item,deep=false}){
  const [open,setOpen]=React.useState(false);
  const votes=item.debug_votes||[];
  return J.jsxs("div",{className:"rounded-lg border border-[#2b323c] bg-[#191f26] overflow-hidden",children:[
    J.jsxs("div",{className:"flex items-center gap-2 px-3 py-2.5",children:[
      J.jsx("span",{className:"font-bold text-sm text-zinc-100",children:item.pair}),
      J.jsx("span",{className:"text-[9px] uppercase tracking-wide px-2 py-1 rounded bg-zinc-800 text-zinc-400",children:deep?"34-engine deep":"10-engine prefilter"}),
      J.jsx("span",{className:"ml-auto text-[11px] font-bold "+(item.direction==="LONG"?"text-emerald-400":item.direction==="SHORT"?"text-rose-400":"text-zinc-500"),children:pickText(item.direction,"HOLD")}),
      !deep&&J.jsx("span",{className:"text-[10px] text-zinc-500",children:"score "+scoreText(item.score)})
    ]}),
    J.jsxs("div",{className:"px-3 pb-2 flex items-center gap-3 text-[10px] text-zinc-500",children:[
      !deep&&J.jsx("span",{children:"agreement "+(item.agreement||0)}),
      deep&&item.confidence!==undefined&&J.jsx("span",{children:"confidence "+Math.round(Number(item.confidence)||0)+"%"}),
      votes.length>0&&J.jsx("button",{type:"button",onClick:()=>setOpen(v=>!v),className:"ml-auto text-[#FFD700] font-bold",children:open?"Sembunyikan detail":"Lihat "+votes.length+" engine"})
    ]}),
    open&&J.jsx(VoteDetails,{votes})
  ]});
}

function MarketScanner(){
  const [universe,setUniverse]=React.useState([]);
  const [universeError,setUniverseError]=React.useState("");
  const [selected,setSelected]=React.useState(()=>new Set(MAJORS));
  const [tf,setTf]=React.useState("1h");
  const [rr,setRr]=React.useState("1:2");
  const [mode,setMode]=React.useState(()=>{try{return localStorage.getItem("ot_scan_sensitivity")||"strict"}catch{return "strict"}});
  const [search,setSearch]=React.useState("");
  const [showPerps,setShowPerps]=React.useState(40);
  const [prefilterState,setPrefilterState]=React.useState({status:"idle",key:"",candidates:[],results:[],errors:[],scan:null,message:""});
  const [deepState,setDeepState]=React.useState({status:"idle",signals:[],errors:[],bars:{},scan:null,message:""});
  const [lastRun,setLastRun]=React.useState(null);
  const [chartPair,setChartPair]=React.useState(null);

  const mounted=React.useRef(true);
  const prefilterBusy=React.useRef(false);
  const queuedPrefilter=React.useRef(null);
  const prefilterToken=React.useRef(0);
  const deepBusy=React.useRef(false);
  const currentKeyRef=React.useRef("");

  React.useEffect(()=>()=>{mounted.current=false},[]);
  React.useEffect(()=>{try{localStorage.setItem("ot_scan_sensitivity",mode)}catch{}},[mode]);

  React.useEffect(()=>{
    let alive=true;
    fetch(API_BASE+"/unified/hyperliquid-universe",{cache:"no-store"}).then(async r=>{
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.detail||j.error||"Instrument universe unavailable");
      return Array.isArray(j.symbols)?j.symbols:[];
    }).then(rows=>{if(alive){setUniverse(rows);setUniverseError("")}}).catch(err=>{if(alive)setUniverseError(String(err.message||err))});
    return()=>{alive=false};
  },[]);

  const pairs=React.useMemo(()=>Array.from(selected),[selected]);
  const currentKey=React.useMemo(()=>keyOf(pairs,tf,rr,mode),[pairs,tf,rr,mode]);
  const majors=React.useMemo(()=>MAJORS.filter(x=>universe.some(y=>String(y).toUpperCase()===x)),[universe]);
  const majorSet=React.useMemo(()=>new Set(majors.map(x=>x.toUpperCase())),[majors]);
  const perps=React.useMemo(()=>universe.filter(x=>!majorSet.has(String(x).toUpperCase())),[universe,majorSet]);
  const q=search.trim().toUpperCase();
  const visibleMajors=React.useMemo(()=>majors.filter(x=>!q||String(x).toUpperCase().includes(q)),[majors,q]);
  const filteredPerps=React.useMemo(()=>perps.filter(x=>!q||String(x).toUpperCase().includes(q)),[perps,q]);

  const candidatesFresh=prefilterState.status==="ready"&&prefilterState.key===currentKey;
  const stale=!!lastRun&&lastRun.key!==currentKey;
  const autoEligible=pairs.length>0&&pairs.length<=AUTO_PREFILTER_MAX;
  currentKeyRef.current=currentKey;

  const togglePair=pair=>{
    if(deepBusy.current)return;
    setSelected(prev=>{
      const next=new Set(prev),has=next.has(pair);
      if(has)next.delete(pair);
      else if(next.size<MAX_SELECTED)next.add(pair);
      return next;
    });
  };

  const prefilterFetch=React.useCallback(async snap=>{
    if(!snap||!mounted.current)return;
    if(prefilterBusy.current){queuedPrefilter.current=snap;return;}
    prefilterBusy.current=true;
    const token=++prefilterToken.current;
    if(mounted.current)setPrefilterState(s=>({...s,status:"loading",message:"Prefilter "+snap.pairs.length+" instruments…"}));
    try{
      const resp=await fetch(API_BASE+"/unified/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pairs:snap.pairs,timeframe:snap.tf,account_balance:10000,rr_target:RR_VALUE[snap.rr],sensitivity:snap.mode,stage:"prefilter"})});
      const data=await resp.json().catch(()=>({}));
      if(!resp.ok)throw new Error(data.detail||data.error||"HTTP "+resp.status);
      if(mounted.current&&token===prefilterToken.current&&currentKeyRef.current===snap.key){
        setPrefilterState({status:"ready",key:snap.key,candidates:data.candidates||[],results:data.prefilter_results||[],errors:data.errors||[],scan:data.scan||null,message:""});
      }
    }catch(err){
      if(mounted.current&&token===prefilterToken.current&&currentKeyRef.current===snap.key){
        setPrefilterState({status:"error",key:snap.key,candidates:[],results:[],errors:[],scan:null,message:String(err.message||err)});
      }
    }finally{
      prefilterBusy.current=false;
      const queued=queuedPrefilter.current;queuedPrefilter.current=null;
      if(queued&&mounted.current&&queued.key!==snap.key)setTimeout(()=>prefilterFetch(queued),120);
    }
  },[]);

  React.useEffect(()=>{
    if(!universe.length||!pairs.length)return;
    if(!autoEligible){
      setPrefilterState(s=>s.key===currentKey?s:{status:"manual",key:"",candidates:[],results:[],errors:[],scan:null,message:pairs.length+" selected — tekan Cari Kandidat untuk prefilter"});
      return;
    }
    setPrefilterState(s=>s.key===currentKey&&s.status==="ready"?s:{...s,status:"queued",message:"Menyiapkan kandidat…"});
    const snap={pairs:pairs.slice(),tf,rr,mode,key:currentKey};
    const id=setTimeout(()=>prefilterFetch(snap),650);
    return()=>clearTimeout(id);
  },[currentKey,universe.length,autoEligible]);

  const manualPrefilter=()=>{
    if(!pairs.length||prefilterBusy.current)return;
    prefilterFetch({pairs:pairs.slice(),tf,rr,mode,key:currentKey});
  };

  const deepScan=async()=>{
    if(deepBusy.current||!candidatesFresh)return;
    const deepPairs=(prefilterState.candidates||[]).map(x=>x.pair).filter(Boolean).slice(0,2);
    if(!deepPairs.length)return;
    deepBusy.current=true;
    const run={id:"scan-"+Date.now().toString(36),key:currentKey,pairs:pairs.slice(),deepPairs:deepPairs.slice(),tf,rr,mode,startedAt:Date.now()};
    setDeepState({status:"scanning",signals:[],errors:[],bars:{},scan:null,message:"Deep scanning "+deepPairs.length+" candidates…"});
    try{
      const resp=await fetch(API_BASE+"/unified/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pairs:deepPairs,timeframe:run.tf,account_balance:10000,rr_target:RR_VALUE[run.rr],sensitivity:run.mode,stage:"deep"})});
      const data=await resp.json().catch(()=>({}));
      if(!resp.ok)throw new Error(data.detail||data.error||"HTTP "+resp.status);
      const finished={...run,finishedAt:Date.now(),durationMs:data.scan?.duration_ms??(Date.now()-run.startedAt),scannedPairs:Number(data.pairs_scanned??deepPairs.length),signalsCount:Number(data.total_signals??(data.signals||[]).length)};
      if(mounted.current){
        setLastRun(finished);
        setDeepState({status:"complete",signals:data.signals||[],errors:data.errors||[],bars:data.bars_cache||{},scan:data.scan||null,message:""});
        setChartPair(null);
      }
    }catch(err){
      const finished={...run,finishedAt:Date.now(),durationMs:Date.now()-run.startedAt,scannedPairs:0,signalsCount:0,failed:true};
      if(mounted.current){setLastRun(finished);setDeepState({status:"error",signals:[],errors:[],bars:{},scan:null,message:String(err.message||err)})}
    }finally{deepBusy.current=false}
  };

  const action=()=>{
    if(pairs.length>AUTO_PREFILTER_MAX&&!candidatesFresh)return manualPrefilter();
    if(candidatesFresh)return deepScan();
  };
  const actionDisabled=pairs.length===0||prefilterState.status==="loading"||prefilterState.status==="queued"||deepState.status==="scanning"||(autoEligible&&!candidatesFresh)|| (candidatesFresh&&prefilterState.candidates.length===0);
  const actionLabel=deepState.status==="scanning"?"Deep scanning…":prefilterState.status==="loading"||prefilterState.status==="queued"?"Mencari kandidat…":!autoEligible&&!candidatesFresh?"Cari Kandidat "+pairs.length:candidatesFresh?"Deep Scan "+Math.min(2,prefilterState.candidates.length):"Menunggu kandidat";

  const deepItems=React.useMemo(()=>{
    const sig=(deepState.signals||[]).map(s=>({...s,kind:"signal",debug_votes:s.debug_votes||[]}));
    const err=(deepState.errors||[]).filter(e=>e.kind!=="prefilter").map(e=>({pair:e.pair,kind:e.kind||"no_consensus",direction:e.direction||"HOLD",confidence:e.confidence,debug_votes:e.debug_votes||[],error:e.error}));
    const map=new Map();
    [...sig,...err].forEach(x=>{if(x.pair&&!map.has(x.pair))map.set(x.pair,x)});
    return Array.from(map.values());
  },[deepState]);

  const filterBar=J.jsxs("div",{"data-ai5-filterbar":"1",style:{width:"calc(100% - 24px)",maxWidth:"1170px",minHeight:"64px",margin:"12px auto",display:"flex",flexWrap:"wrap",background:"#1E2329",border:"1px solid #2B3139",borderRadius:"24px",overflow:"hidden",boxSizing:"border-box",color:"#EAECEF"},children:[
    J.jsxs("div",{className:"min-w-0 px-4 py-3 flex flex-col justify-center border-r border-[#2B3139]",style:{flex:"1 1 170px",minWidth:"150px"},children:[
      J.jsx("span",{className:"text-[12px] font-extrabold",children:"Instruments"}),
      J.jsx("span",{className:"text-[13px] text-[#848E9C]",children:pairs.length+" selected"})
    ]}),
    J.jsx(SelectCell,{label:"Timeframe",value:tf,onChange:setTf,options:TF}),
    J.jsx(SelectCell,{label:"R:R",value:rr,onChange:setRr,options:RRS}),
    J.jsx(SelectCell,{label:"Mode",value:mode,onChange:setMode,options:MODES.map(v=>({value:v,label:v[0].toUpperCase()+v.slice(1)}))}),
    J.jsx("button",{type:"button",onClick:action,disabled:actionDisabled,style:{alignSelf:"center",flex:"1 1 150px",minWidth:"130px",height:"40px",margin:"8px 10px",border:0,borderRadius:"22px",background:actionDisabled?"#5e4d00":"#F0B90B",color:actionDisabled?"#9b8b50":"#0B0E11",fontWeight:900,fontSize:"12px",cursor:actionDisabled?"default":"pointer"},children:actionLabel})
  ]});

  return J.jsxs("div",{"data-ai5-signal-v8":"1",className:"min-h-screen bg-[#0b0f12] text-zinc-200",style:{overflowAnchor:"none"},children:[
    J.jsxs("header",{className:"px-4 py-3 border-b border-[#252b33] bg-[#151a20] flex flex-wrap items-center gap-2",children:[
      J.jsx("h2",{className:"text-sm font-extrabold",children:"Market Scanner"}),
      J.jsx("span",{className:"text-[10px] text-zinc-500",children:deepState.status==="scanning"?"Deep scanning":prefilterState.status==="loading"?"Prefiltering":stale?"Filters changed":"Ready"}),
      J.jsx("span",{className:"ml-auto text-[10px] px-2 py-1 rounded border border-[#2a3139] bg-[#0d1115]",children:"Selected "+pairs.length}),
      J.jsx("span",{className:"text-[10px] px-2 py-1 rounded border border-[#2a3139] bg-[#0d1115]",children:"Candidates "+(candidatesFresh?prefilterState.candidates.length:0)}),
      J.jsx("span",{className:"text-[10px] px-2 py-1 rounded border border-[#2a3139] bg-[#0d1115]",children:"Signals "+deepState.signals.length})
    ]}),
    filterBar,
    J.jsx("div",{className:"px-4 pb-2 text-center text-[10px] text-zinc-500",children:autoEligible?"Auto Filter + Auto Prefilter aktif · Deep Scan tetap manual":"Lebih dari 20 instrument: prefilter dijalankan manual agar server tetap ringan"}),

    J.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-3 px-3 pb-5",children:[
      J.jsxs("aside",{className:"rounded-xl border border-[#2a3139] bg-[#12171c] overflow-hidden lg:sticky lg:top-2 lg:self-start",children:[
        J.jsxs("div",{className:"p-3 border-b border-[#252b33]",children:[
          J.jsxs("div",{className:"flex items-center justify-between mb-2",children:[J.jsx("span",{className:"font-bold text-xs",children:"Instruments"}),J.jsx("span",{className:"text-[10px] text-zinc-500",children:pairs.length+"/"+(universe.length||"—")})]}),
          J.jsx("input",{value:search,onChange:e=>setSearch(e.target.value),placeholder:"Cari instrument",className:"w-full rounded-lg border border-[#2a3139] bg-[#0d1115] px-3 py-2 text-[11px] outline-none text-zinc-300"})
        ]}),
        universeError&&J.jsx("div",{className:"px-3 py-2 text-[10px] text-rose-400",children:universeError}),
        J.jsxs("div",{className:"p-3 border-b border-[#252b33]",children:[
          J.jsxs("div",{className:"flex items-center gap-2 mb-2",children:[J.jsx("span",{className:"font-extrabold text-xs",children:"Major"}),J.jsx("span",{className:"ml-auto text-[10px] text-[#FFD700]",children:visibleMajors.filter(x=>selected.has(x)).length+"/"+majors.length})]}),
          J.jsx("div",{className:"flex flex-wrap gap-1.5",children:visibleMajors.map(p=>J.jsx(PairChip,{pair:p,selected:selected.has(p),onToggle:togglePair},p))})
        ]}),
        J.jsxs("div",{className:"p-3 max-h-[520px] overflow-y-auto",style:{overflowAnchor:"none"},children:[
          J.jsxs("div",{className:"flex items-center gap-2 mb-2",children:[J.jsx("span",{className:"font-extrabold text-xs",children:"Perpetuals"}),J.jsx("span",{className:"ml-auto text-[10px] text-zinc-500",children:filteredPerps.filter(x=>selected.has(x)).length+"/"+perps.length})]}),
          J.jsx("div",{className:"flex flex-wrap gap-1.5",children:filteredPerps.slice(0,showPerps).map(p=>J.jsx(PairChip,{pair:p,selected:selected.has(p),onToggle:togglePair},p))}),
          filteredPerps.length>showPerps&&J.jsx("button",{type:"button",onClick:()=>setShowPerps(v=>Math.min(v+40,filteredPerps.length)),className:"w-full mt-3 py-2 rounded-lg text-[10px] font-bold text-[#FFD700] border border-[#3a3217]",children:"Tampilkan "+Math.min(40,filteredPerps.length-showPerps)+" lagi"})
        ]})
      ]}),

      J.jsxs("main",{className:"min-w-0 space-y-3",children:[
        J.jsxs("section",{className:"rounded-xl border border-[#2a3139] bg-[#12171c] p-3",children:[
          J.jsxs("div",{className:"flex flex-wrap items-center gap-2",children:[
            J.jsx("span",{className:"text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-[#4b400d] text-[#FFD700]",children:"10 Engine Prefilter"}),
            J.jsx("span",{className:"text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-[#4b400d] text-[#FFD700]",children:"34 Deep Engines"}),
            J.jsx("span",{className:"text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-[#29323a] text-zinc-400",children:"Deep manual"}),
            prefilterState.scan&&J.jsx("span",{className:"ml-auto text-[10px] text-zinc-500",children:"Prefilter "+fmtMs(prefilterState.scan.duration_ms)})
          ]}),
          prefilterState.status==="error"&&J.jsx("div",{className:"mt-3 rounded-lg border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-[11px] text-rose-300",children:"Prefilter gagal: "+prefilterState.message}),
          candidatesFresh&&prefilterState.candidates.length===0&&J.jsx("div",{className:"mt-3 rounded-lg border border-[#34311d] bg-[#211d10] px-3 py-3 text-center text-[11px] text-amber-300",children:"Tidak ada kandidat yang cukup kuat untuk Deep Scan."}),
          candidatesFresh&&prefilterState.candidates.length>0&&J.jsxs("div",{className:"mt-3",children:[
            J.jsx("div",{className:"text-[11px] text-zinc-500 mb-2",children:pairs.length+" selected → "+prefilterState.candidates.length+" kandidat untuk Deep Scan"}),
            J.jsx("div",{className:"grid grid-cols-1 xl:grid-cols-2 gap-2",children:prefilterState.candidates.map(x=>J.jsx(CandidateCard,{item:x},x.pair))})
          ]})
        ]}),

        lastRun&&J.jsxs("section",{className:"rounded-xl border "+(stale?"border-amber-700/50 bg-amber-950/10":"border-[#2a3139] bg-[#12171c]")+" p-3",children:[
          J.jsxs("div",{className:"flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]",children:[
            J.jsx("strong",{className:stale?"text-amber-300":"text-zinc-200",children:stale?"Previous Scan · Filters Changed":"Last Scan"}),
            J.jsx("span",{className:"text-zinc-500",children:lastRun.scannedPairs+" deep scanned"}),
            J.jsx("span",{className:"text-zinc-500",children:lastRun.deepPairs.join(", ")}),
            J.jsx("span",{className:"text-zinc-500",children:lastRun.tf+" · RR "+lastRun.rr+" · "+lastRun.mode}),
            J.jsx("span",{className:"text-zinc-500",children:fmtMs(lastRun.durationMs)}),
            J.jsx("span",{className:"text-zinc-600",children:nowLabel(lastRun.finishedAt)})
          ]}),
          stale&&J.jsx("div",{className:"mt-2 text-[10px] text-amber-400",children:"Filter saat ini berbeda dari scan terakhir. Jalankan prefilter dan Deep Scan kembali untuk hasil baru."})
        ]}),

        deepState.status==="scanning"&&J.jsx("section",{className:"rounded-xl border border-[#2a3139] bg-[#12171c] px-4 py-8 text-center text-sm text-zinc-400",children:"Deep analysis berjalan di server. UI tetap dapat digunakan."}),
        deepState.status==="error"&&J.jsx("section",{className:"rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-4 text-sm text-rose-300",children:"Scan gagal: "+deepState.message}),
        deepState.status==="complete"&&J.jsxs("section",{className:"rounded-xl border border-[#2a3139] bg-[#12171c] p-3",children:[
          J.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[
            J.jsx("strong",{className:"text-sm",children:"Deep Analysis"}),
            J.jsx("span",{className:"text-[10px] text-zinc-500",children:(lastRun?.scannedPairs||0)+" scanned · "+deepState.signals.length+" signals"})
          ]}),
          deepItems.length===0&&J.jsxs("div",{className:"rounded-lg border border-[#34311d] bg-[#211d10] px-4 py-5 text-center",children:[
            J.jsx("div",{className:"font-bold text-amber-300 text-sm",children:"Tidak ada sinyal — engine belum konsensus"}),
            J.jsx("div",{className:"mt-1 text-[11px] text-zinc-500",children:"Deep Scan selesai dengan sukses, tetapi tidak ada setup yang melewati seluruh gate."})
          ]}),
          deepItems.length>0&&J.jsx("div",{className:"space-y-2",children:deepItems.map(x=>J.jsx(CandidateCard,{item:x,deep:true},x.pair+"-"+x.kind))}),
          deepState.signals.length>0&&J.jsx("div",{className:"mt-3 space-y-2",children:deepState.signals.map(s=>J.jsxs("div",{className:"rounded-lg border border-[#2a3139] overflow-hidden",children:[
            J.jsxs("button",{type:"button",onClick:()=>setChartPair(chartPair===s.pair?null:s.pair),className:"w-full flex items-center gap-2 px-3 py-2.5 bg-[#171d23]",children:[
              J.jsx("strong",{children:s.pair}),
              J.jsx("span",{className:s.direction==="LONG"?"text-emerald-400":"text-rose-400",children:s.direction}),
              J.jsx("span",{className:"text-zinc-500 text-[11px]",children:Math.round(Number(s.confidence)||0)+"%"}),
              J.jsx("span",{className:"ml-auto text-[10px] text-[#FFD700]",children:chartPair===s.pair?"Tutup chart":"Buka chart"})
            ]}),
            chartPair===s.pair&&J.jsx("div",{className:"h-[220px]",style:{overflowAnchor:"none"},children:J.jsx(StaticChart,{pair:s.pair,bars:deepState.bars[s.pair]||[]})})
          ]},s.pair))})
        ]}),

        !lastRun&&deepState.status==="idle"&&J.jsx("section",{className:"rounded-xl border border-dashed border-[#2a3139] bg-[#0f1419] px-4 py-10 text-center text-[12px] text-zinc-500",children:"Pilih instrument dan filter. Prefilter berjalan otomatis; 34-engine Deep Scan hanya berjalan setelah Anda menekan tombol Deep Scan."})
      ]})
    ]})
  ]});
}
export{MarketScanner as default};
