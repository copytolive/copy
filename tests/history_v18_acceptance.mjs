import fs from 'node:fs';
const files=['history_hl_pending_v18.js','history_hl_summary_v18.js','history_hl_market_only_v18.js','history_hl_sync_v7_guard.js'];
for(const f of files){const s=fs.readFileSync(f,'utf8');new Function(s);console.log('SYNTAX_OK',f,s.length);}
const p=fs.readFileSync('history_hl_pending_v18.js','utf8');
const s=fs.readFileSync('history_hl_summary_v18.js','utf8');
const m=fs.readFileSync('history_hl_market_only_v18.js','utf8');
const g=fs.readFileSync('history_hl_sync_v7_guard.js','utf8');
for(const q of ["frontendOpenOrders","openOrders","historicalOrders","historicalStatusOpen","__CTL_HL_PENDING_REAL_V18__","clearinghouseState"]) if(!p.includes(q)) throw new Error('pending v18 contract missing '+q);
for(const q of ["mode==='pending'?pendingMetrics():directMetrics","TOTAL ENTRY","PROBABILITAS","RISK/REWARD","userFills-realized","active-open-orders-v18"]) if(!s.includes(q)) throw new Error('summary v18 contract missing '+q);
if(!m.includes("window._allPending=[]")||!m.includes("window._enginePositions=[]")) throw new Error('market-only guard missing engine suppression');
for(const q of ['history_hl_pending_v18.js','history_hl_market_only_v18.js','history_hl_summary_v18.js']) if(!g.includes(q)) throw new Error('guard missing '+q);
console.log('HISTORY_V18_REAL_MARKET_SEPARATION=PASS');
