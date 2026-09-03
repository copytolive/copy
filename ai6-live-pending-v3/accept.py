#!/usr/bin/env python3
import hashlib, json, pathlib, re, sqlite3, subprocess, sys, time, urllib.error, urllib.request

WEB=pathlib.Path("/var/www/copytolive")
BOT=pathlib.Path("/home/opentrue-platform/backend/bot-trading/bot_trading_api.py")
BROOT=BOT.parent
INDEX=WEB/"index.html"
DEPLOY=pathlib.Path("/tmp/ai6-live-pending-v3-deploy.json")

def post(url,obj,timeout=45):
    req=urllib.request.Request(url,data=json.dumps(obj).encode(),method="POST",
        headers={"Content-Type":"application/json","Accept":"application/json","User-Agent":"AI6-live-pending-v3-accept"})
    try:
        with urllib.request.urlopen(req,timeout=timeout) as r:
            raw=r.read().decode(); return int(r.status),json.loads(raw or "{}")
    except urllib.error.HTTPError as e:
        raw=e.read().decode()
        try: body=json.loads(raw or "{}")
        except Exception: body={"raw":raw[:1000]}
        return int(e.code),body

def get(url,timeout=45):
    req=urllib.request.Request(url,headers={"Cache-Control":"no-cache","User-Agent":"AI6-live-pending-v3-accept"})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return int(r.status),r.read(),dict(r.headers)

def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()

R={"ok":False,"acceptance":"FAIL","errors":[],"checks":{}}
try:
    deploy=json.loads(DEPLOY.read_text()) if DEPLOY.is_file() else {}
    R["checks"]["deploy_receipt"]={
        "ok":deploy.get("ok"),"direct_open_unchanged":deploy.get("direct_open_hash_before")==deploy.get("direct_open_hash_after"),
        "dashboard_lifecycle_preserved":deploy.get("dashboard_lifecycle_preserved"),"service":deploy.get("service"),
        "backup":deploy.get("backup")
    }
    if not deploy.get("ok"): raise RuntimeError("deploy receipt not ok")
    if deploy.get("direct_open_hash_before")!=deploy.get("direct_open_hash_after"): raise RuntimeError("Renko direct-open changed")
    if deploy.get("dashboard_lifecycle_preserved") is not True: raise RuntimeError("dashboard lifecycle receipt false")

    # Real Hyperliquid market input, but acceptance is preview/guard only.
    code,mids=post("https://api.hyperliquid.xyz/info",{"type":"allMids"})
    if code!=200 or not mids.get("ADA"): raise RuntimeError("Hyperliquid ADA mid unavailable")
    mid=float(mids["ADA"]); entry=mid*1.01; sl=entry*0.99; risk=entry-sl
    signal={
        "symbol":"ADA","hl_coin":"ADA","side":"LONG","entry":entry,"sl":sl,
        "tp1":entry+2*risk,"tp2":entry+3*risk,"tp3":entry+4*risk,
        "tf":"H1","confidence":80,"current_price":mid,
        "signal_id":"ai6-safe-preview-"+str(int(time.time())),
        "expires_at_ms":int(time.time()*1000)+4*60*60*1000
    }
    pcode,preview=post("http://127.0.0.1:11175/api/bot-trading/pending-open/preview",
                       {"signal":signal,"risk_usdt":10,"max_notional_usdt":1000})
    R["checks"]["local_preview"]={"http":pcode,"status":preview.get("status"),"venue":preview.get("venue"),
        "orderType":preview.get("orderType"),"reduceOnly":preview.get("reduceOnly"),"coin":preview.get("coin"),
        "size":preview.get("size"),"risk":preview.get("estimated_risk_usdt"),
        "notional":preview.get("estimated_notional_usdt"),"distancePct":preview.get("distancePct")}
    if pcode!=200 or preview.get("status")!="preview" or preview.get("venue")!="hyperliquid": raise RuntimeError("local preview contract")
    if preview.get("orderType")!="STOP_MARKET" or preview.get("reduceOnly") is not False: raise RuntimeError("pending order semantics")
    if not (0<float(preview.get("distancePct") or 0)<=8): raise RuntimeError("distance gate")
    if not (0<float(preview.get("estimated_risk_usdt") or 0)<=11): raise RuntimeError("risk sizing")
    if not (10<=float(preview.get("estimated_notional_usdt") or 0)<=1000.1): raise RuntimeError("notional sizing")

    dummy="0x"+"0"*40
    gcode,guard=post("http://127.0.0.1:11175/api/bot-trading/pending-open",
        {"wallet":dummy,"signal":signal,"risk_usdt":10,"max_notional_usdt":1000,"confirm":False})
    R["checks"]["real_submit_guard"]={"http":gcode,"error":guard.get("error")}
    if gcode!=400 or "confirm=true" not in str(guard.get("error","")): raise RuntimeError("real confirm guard missing")

    # Backend rejects stale and too-far setups through preview, with no signing.
    stale=dict(signal);stale["entry"]=mid*.999;stale["sl"]=stale["entry"]*.99;rr=stale["entry"]-stale["sl"]
    stale["tp1"]=stale["entry"]+2*rr;stale["tp2"]=stale["entry"]+3*rr;stale["tp3"]=stale["entry"]+4*rr
    scode,_=post("http://127.0.0.1:11175/api/bot-trading/pending-open/preview",{"signal":stale,"risk_usdt":10,"max_notional_usdt":1000})
    far=dict(signal);far["entry"]=mid*1.081;far["sl"]=far["entry"]*.99;rr=far["entry"]-far["sl"]
    far["tp1"]=far["entry"]+2*rr;far["tp2"]=far["entry"]+3*rr;far["tp3"]=far["entry"]+4*rr
    fcode,_=post("http://127.0.0.1:11175/api/bot-trading/pending-open/preview",{"signal":far,"risk_usdt":10,"max_notional_usdt":1000})
    R["checks"]["backend_gates"]={"stale_http":scode,"too_far_http":fcode}
    if scode not in (400,409) or fcode not in (400,409): raise RuntimeError("stale/distance backend gate")

    # If a registered wallet exists, prove the acceptance did not change its
    # actual Hyperliquid frontendOpenOrders set.
    registered=None
    for dbp in BROOT.rglob("*.db"):
        try:
            con=sqlite3.connect(str(dbp));con.row_factory=sqlite3.Row
            row=con.execute("SELECT wallet_address FROM users WHERE status='active' AND api_private_key_encrypted IS NOT NULL AND api_private_key_encrypted<>'' ORDER BY id LIMIT 1").fetchone()
            con.close()
            if row: registered=str(row["wallet_address"]);break
        except Exception: pass
    if registered:
        _,before=post("https://api.hyperliquid.xyz/info",{"type":"frontendOpenOrders","user":registered})
        # repeat only preview and confirm=false; both must be non-mutating
        post("http://127.0.0.1:11175/api/bot-trading/pending-open/preview",{"signal":signal,"risk_usdt":10,"max_notional_usdt":1000})
        post("http://127.0.0.1:11175/api/bot-trading/pending-open",{"wallet":registered,"signal":signal,"confirm":False})
        _,after=post("https://api.hyperliquid.xyz/info",{"type":"frontendOpenOrders","user":registered})
        def keys(rows):
            return sorted((str(x.get("coin")),str(x.get("oid")),str(x.get("cloid") or "")) for x in (rows or []))
        R["checks"]["zero_real_order_acceptance"]={"registered_wallet_present":True,"open_orders_unchanged":keys(before)==keys(after),"count_before":len(before or []),"count_after":len(after or [])}
        if keys(before)!=keys(after): raise RuntimeError("acceptance mutated real Hyperliquid orders")
    else:
        R["checks"]["zero_real_order_acceptance"]={"registered_wallet_present":False,"open_orders_unchanged":"not_applicable"}

    btxt=BOT.read_text("utf-8",errors="ignore")
    static={
        "pending_route":'@app.route("/api/bot-trading/pending-open",methods=["POST"])' in btxt,
        "preview_route":'@app.route("/api/bot-trading/pending-open/preview",methods=["POST"])' in btxt,
        "cancel_route":'@app.route("/api/bot-trading/pending-cancel",methods=["POST"])' in btxt,
        "status_route":'@app.route("/api/bot-trading/pending-status",methods=["GET"])' in btxt,
        "deterministic_cloid":"query_order_by_cloid" in btxt and "_ai6_cloid" in btxt,
        "broker_pending_source":"frontend_open_orders" in btxt,
        "expiry_cancel":"expires_at_ms" in btxt and "cancel_by_cloid" in btxt,
        "multi_tp":"TP1" in btxt and "TP2" in btxt and "TP3" in btxt,
        "reduce_only_protection":'"reduce_only":True' in btxt,
        "independent_protection":'ex.bulk_orders(orders,grouping="na")' in btxt,
        "closed_reconcile":"status='closed'" in btxt and "_ai6_cancel_protection" in btxt,
        "exact_coin_case":'strip().upper()\n    entry=float(signal.get("entry")' not in btxt,
    }
    R["checks"]["backend_static"]=static
    if not all(static.values()): raise RuntimeError("backend static "+json.dumps(static))
    py=str(BROOT/"venv/bin/python")
    pc=subprocess.run([py,"-m","py_compile",str(BOT)],capture_output=True,text=True)
    if pc.returncode: raise RuntimeError("backend py_compile "+(pc.stderr or pc.stdout)[-1000:])

    html=INDEX.read_text("utf-8",errors="ignore")
    m=(re.search(r'<script[^>]+type="module"[^>]+src="([^"]+)"',html) or re.search(r'<script[^>]+src="([^"]+)"[^>]+type="module"',html))
    if not m: raise RuntimeError("active main missing")
    active=m.group(1); rel=active.split("?",1)[0].lstrip("/"); mp=WEB/rel
    mt=mp.read_text("utf-8",errors="ignore")
    chunk=WEB/"assets/js/CryptoMultiTFScreener-ai6-live-v1.js"
    if not chunk.is_file(): raise RuntimeError("live screener chunk missing")
    js=chunk.read_text("utf-8",errors="ignore")
    front={
        "active_main_cachebusted":"index-ai6-livepending-" in active,
        "active_main_live_chunk":"CryptoMultiTFScreener-ai6-live-v1.js" in mt,
        "dashboard_frontendOpenOrders":"frontendOpenOrders" in mt,
        "dashboard_real_pending":"_hlRealPending" in mt,
        "live_endpoint":"/api/bot-trading/pending-open" in js,
        "auto_off_default":"AUTO REAL OFF" in js,
        "auto_on":"AUTO REAL ON" in js,
        "real_label":"REAL Pending" in js,
        "wallet_bridge":"activeHyperliquidWallet" in js and "_userWallet" in js,
        "paper_removed":"/trading/execution/manual-deploy" not in js,
    }
    R["checks"]["frontend_static"]=front
    if not all(front.values()): raise RuntimeError("frontend static "+json.dumps(front))
    for p in (mp,chunk):
        nc=subprocess.run(["node","--check",str(p)],capture_output=True,text=True)
        if nc.returncode: raise RuntimeError("node syntax "+str(p)+" "+(nc.stderr or nc.stdout)[-1000:])

    # Public origin must expose the same route and cache-busted asset.
    pcode,pub=post("https://copytolive.com/api/bot-trading/pending-open/preview",
        {"signal":signal,"risk_usdt":10,"max_notional_usdt":1000})
    if pcode!=200 or pub.get("venue")!="hyperliquid" or pub.get("orderType")!="STOP_MARKET":
        raise RuntimeError("public preview route failed")
    public_active=""
    for _ in range(12):
        _,raw,_=get("https://copytolive.com/?ai6_live_pending="+str(time.time_ns()))
        ph=raw.decode("utf-8",errors="ignore")
        mm=(re.search(r'<script[^>]+type="module"[^>]+src="([^"]+)"',ph) or re.search(r'<script[^>]+src="([^"]+)"[^>]+type="module"',ph))
        public_active=mm.group(1) if mm else ""
        if "index-ai6-livepending-" in public_active: break
        time.sleep(2)
    R["checks"]["public"]={"preview_http":pcode,"active_main":public_active}
    if "index-ai6-livepending-" not in public_active: raise RuntimeError("public cache-busted main not visible")

    R["ok"]=True;R["acceptance"]="PASS";R["real_order_submitted_during_acceptance"]=False
except Exception as e:
    R["errors"].append(repr(e))
print(json.dumps(R,indent=2,sort_keys=True))
if not R["ok"]: raise SystemExit(3)
