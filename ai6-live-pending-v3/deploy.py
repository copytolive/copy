#!/usr/bin/env python3
import hashlib, json, math, os, pathlib, re, shutil, subprocess, sys, tempfile, time, urllib.request

RID=os.environ.get("AI6_REQUEST_ID","ai6-live-pending-v1")
BOT=pathlib.Path("/home/opentrue-platform/backend/bot-trading/bot_trading_api.py")
WEB=pathlib.Path("/var/www/copytolive")
SRC_JS=WEB/"assets/js/CryptoMultiTFScreener-ai6-rt-v2.js"
DST_JS=WEB/"assets/js/CryptoMultiTFScreener-ai6-live-v1.js"
INDEX=WEB/"index.html"
BACK=pathlib.Path("/var/backups/copytolive-control")/RID

def shab(b): return hashlib.sha256(b).hexdigest()
def shaf(p): return shab(p.read_bytes())
def awrite(path,data):
    fd,tmp=tempfile.mkstemp(prefix=".ai6-",dir=str(path.parent))
    try:
        with os.fdopen(fd,"wb") as f:
            f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(tmp,0o644);os.replace(tmp,path)
    except Exception:
        try: os.unlink(tmp)
        except Exception: pass
        raise
def run(cmd,check=True):
    return subprocess.run(cmd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,check=check)

for p in (BOT,SRC_JS,INDEX):
    if not p.is_file(): raise SystemExit("missing "+str(p))

bot0=BOT.read_bytes();bot0sha=shab(bot0);bt=bot0.decode("utf-8")
direct_anchor='@app.route("/api/bot-trading/direct-open", methods=["POST"])'
ds=bt.find(direct_anchor);cs=bt.find("def close_trade_for_user",ds)
if ds<0 or cs<0: raise SystemExit("direct-open anchor missing")
direct_hash=shab(bt[ds:cs].encode())

# Remove any older AI6 pending implementation before re-inserting the
# current hardened block. Renko direct-open itself is outside these bounds.
legacy_begin=bt.find("# AI6_REAL_PENDING_V1_BEGIN")
if legacy_begin>=0:
    legacy_end=bt.find("# AI6_REAL_PENDING_V1_END",legacy_begin)
    if legacy_end<0: raise SystemExit("unterminated legacy AI6 pending block")
    legacy_nl=bt.find("\n",legacy_end)
    bt=bt[:legacy_begin]+bt[(legacy_nl+1 if legacy_nl>=0 else len(bt)):]
for marker in ("# AI6_REAL_PENDING_V2\n","# AI6_REAL_PENDING_V1\n"):
    oldpos=bt.find(marker)
    if oldpos>=0:
        oldanchor=bt.find(direct_anchor,oldpos)
        if oldanchor<0: raise SystemExit("AI6 pending block has no direct-open boundary")
        bt=bt[:oldpos]+bt[oldanchor:]
if "# AI6_SCREENER_PENDING_V1" in bt:
    raise SystemExit("legacy unbracketed AI6 screener pending block detected; manual reconciliation required")
if True:
    code=r'''
# AI6_REAL_PENDING_V2
# Crypto Screener -> native Hyperliquid pending trigger -> existing dashboard lifecycle.
_ai6_pending_thread=None
_ai6_pending_lock=threading.Lock()

def _ai6_schema():
    db=get_db()
    try:
        db.execute("""
        CREATE TABLE IF NOT EXISTS screener_pending_orders(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          wallet_address TEXT NOT NULL,
          signal_id TEXT NOT NULL,
          hl_coin TEXT NOT NULL,
          side TEXT NOT NULL,
          entry REAL NOT NULL,
          sl REAL NOT NULL,
          tp1 REAL NOT NULL,
          tp2 REAL,
          tp3 REAL,
          size REAL NOT NULL,
          risk_usdt REAL NOT NULL,
          estimated_risk_usdt REAL NOT NULL,
          estimated_notional_usdt REAL NOT NULL,
          entry_cloid TEXT NOT NULL,
          entry_oid TEXT,
          expires_at_ms INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          protection_status TEXT NOT NULL DEFAULT 'waiting_fill',
          error_details TEXT DEFAULT '',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(wallet_address,signal_id)
        )""")
        db.execute("CREATE INDEX IF NOT EXISTS idx_screener_pending_status_expiry ON screener_pending_orders(status,expires_at_ms)")
        db.commit()
    finally: db.close()

def _ai6_cloid(wallet,signal_id,leg):
    from hyperliquid.utils.types import Cloid
    h=hashlib.sha256((str(wallet).lower()+"|"+str(signal_id)+"|"+str(leg)).encode()).hexdigest()[:32]
    return Cloid.from_str("0x"+h)

def _ai6_round_px(px):
    px=float(px)
    if not math.isfinite(px) or px<=0: raise ValueError("invalid price")
    mag=math.floor(math.log10(abs(px)))
    return round(px,max(0,4-mag))

def _ai6_context(coin,wallet=None,api_key=None):
    from hyperliquid.info import Info
    from hyperliquid.utils import constants
    coin=str(coin or "").strip()
    if not coin or ":" in coin: raise ValueError("Crypto Screener hanya menerima main Hyperliquid perp")
    info=Info(constants.MAINNET_API_URL,skip_ws=True,perp_dexs=BUILDER_DEXES)
    asset=info.coin_to_asset.get(coin)
    if asset is None:
        try: asset=info.name_to_asset(coin)
        except Exception: asset=None
    if asset is None: raise ValueError("Hyperliquid coin tidak aktif: "+coin)
    mid=float((info.all_mids(dex="") or {}).get(coin,0) or 0)
    if not math.isfinite(mid) or mid<=0: raise ValueError("Hyperliquid mid unavailable: "+coin)
    ex=None
    if wallet and api_key:
        from hyperliquid.exchange import Exchange
        from eth_account import Account
        acc=Account.from_key(api_key)
        ex=Exchange(acc,constants.MAINNET_API_URL,account_address=wallet)
        ex.info=info
    return info,ex,asset,mid

def _ai6_plan(signal,risk_usdt,max_notional):
    side=str(signal.get("side") or "").upper()
    if side in ("BUY","LONG"): side="LONG"
    elif side in ("SELL","SHORT"): side="SHORT"
    else: raise ValueError("side harus LONG/SHORT")
    coin=str(signal.get("hl_coin") or signal.get("symbol") or "").strip()
    entry=float(signal.get("entry") or 0);sl=float(signal.get("sl") or 0);tp1=float(signal.get("tp1") or 0)
    tp2=float(signal.get("tp2")) if signal.get("tp2") not in (None,"") else None
    tp3=float(signal.get("tp3")) if signal.get("tp3") not in (None,"") else None
    expires=int(signal.get("expires_at_ms") or 0);now=int(time.time()*1000)
    if expires<=now: raise ValueError("signal expired")
    if not all(math.isfinite(x) and x>0 for x in (entry,sl,tp1)): raise ValueError("entry/sl/tp1 invalid")
    if side=="LONG":
        if not sl<entry<tp1: raise ValueError("LONG ladder invalid")
        if tp2 is not None and not tp2>tp1: raise ValueError("LONG TP2 invalid")
        if tp3 is not None and not tp3>(tp2 if tp2 is not None else tp1): raise ValueError("LONG TP3 invalid")
    else:
        if not tp1<entry<sl: raise ValueError("SHORT ladder invalid")
        if tp2 is not None and not tp2<tp1: raise ValueError("SHORT TP2 invalid")
        if tp3 is not None and not tp3<(tp2 if tp2 is not None else tp1): raise ValueError("SHORT TP3 invalid")
    risk=float(risk_usdt or 10);cap=float(max_notional or 1000)
    if risk<0.1 or risk>1000: raise ValueError("risk_usdt out of range")
    if cap<10 or cap>100000: raise ValueError("max_notional_usdt out of range")
    return dict(coin=coin,side=side,entry=entry,sl=sl,tp1=tp1,tp2=tp2,tp3=tp3,expires_at_ms=expires,risk_usdt=risk,max_notional_usdt=cap)

def _ai6_distance_guard(p,mid):
    if p["side"]=="LONG":
        if not p["entry"]>mid: raise ValueError("LONG entry sudah tersentuh/terlewat")
        distance=(p["entry"]-mid)/mid*100.0
    else:
        if not p["entry"]<mid: raise ValueError("SHORT entry sudah tersentuh/terlewat")
        distance=(mid-p["entry"])/mid*100.0
    if distance>8.0: raise ValueError("Entry terlalu jauh (>8%) dari harga Hyperliquid")
    return distance

def _ai6_size(info,asset,mid,p):
    dec=int(info.asset_to_sz_decimals.get(asset,4));step=10**(-dec) if dec>0 else 1.0
    dist=abs(p["entry"]-p["sl"])
    if dist<=0: raise ValueError("stop distance zero")
    raw=min(p["risk_usdt"]/dist,p["max_notional_usdt"]/p["entry"])
    size=math.floor(max(raw,0)/step)*step
    minsz=math.ceil((10.01/max(mid,1e-12))/step)*step
    size=max(size,minsz)
    if size*p["entry"]>p["max_notional_usdt"]+max(step*p["entry"],0.01): raise ValueError("minimum executable exceeds max_notional")
    size=round(size,dec)
    if dec==0: size=max(1,int(size))
    actual_risk=dist*size
    # Do not silently violate a user's risk target just to satisfy the venue's
    # minimum executable notional.
    if actual_risk>p["risk_usdt"]*1.10:
        raise ValueError("minimum executable size exceeds risk budget")
    return dict(size=size,sz_decimals=dec,estimated_risk_usdt=actual_risk,estimated_notional_usdt=p["entry"]*size)

def _ai6_state(resp):
    if not isinstance(resp,dict): return "unknown",None
    if str(resp.get("status","")).lower()=="unknownoid": return "unknown",None
    obj=resp.get("order") or {}
    if isinstance(obj,dict):
        st=str(obj.get("status") or resp.get("status") or "").lower()
        od=obj.get("order") if isinstance(obj.get("order"),dict) else obj
        return st,(od.get("oid") if isinstance(od,dict) else None)
    return str(resp.get("status") or "").lower(),None

def _ai6_exposure(info,wallet,coin):
    pos=pend=0;samep=sameo=False
    for dex in BUILDER_DEXES:
        try:
            for ap in (info.user_state(wallet,dex) or {}).get("assetPositions",[]) or []:
                p=ap.get("position",{}) or {};szi=float(p.get("szi") or 0)
                if szi:
                    pos+=1
                    if str(p.get("coin") or "")==coin: samep=True
        except Exception: pass
        try:
            for o in info.frontend_open_orders(wallet,dex) or []:
                if bool(o.get("reduceOnly")): continue
                pend+=1
                if str(o.get("coin") or "")==coin: sameo=True
        except Exception: pass
    return pos,pend,samep,sameo

def _ai6_submit(owner,api_key,signal,risk,cap,max_positions):
    p=_ai6_plan(signal,risk,cap);info,ex,asset,mid=_ai6_context(p["coin"],owner,api_key)
    distance_pct=_ai6_distance_guard(p,mid)
    z=_ai6_size(info,asset,mid,p);sid=str(signal.get("signal_id") or "").strip()
    if not sid: raise ValueError("signal_id required")
    cl=_ai6_cloid(owner,sid,"ENTRY")
    try:
        st,oid=_ai6_state(info.query_order_by_cloid(owner,cl))
        if st not in ("","unknown","unknownoid"):
            return dict(**p,**z,status=st,replayed=True,cloid=cl.to_raw(),orderId=str(oid or ""),mid=mid)
    except Exception: pass
    npos,npend,samep,sameo=_ai6_exposure(info,owner,p["coin"])
    if samep: raise ValueError("coin sudah punya posisi real")
    if sameo: raise ValueError("coin sudah punya pending entry real")
    if npos+npend>=max(1,int(max_positions or 1)): raise ValueError("max_positions tercapai")
    ep=_ai6_round_px(p["entry"])
    entry_buy=p["side"]=="LONG"; limit_px=ex._slippage_price(p["coin"],entry_buy,ex.DEFAULT_SLIPPAGE,ep)
    req={"coin":p["coin"],"is_buy":entry_buy,"sz":z["size"],"limit_px":limit_px,
         "order_type":{"trigger":{"triggerPx":ep,"isMarket":True,"tpsl":"sl"}},"reduce_only":False,"cloid":cl}
    result=ex.bulk_orders([req],grouping="na")
    sts=result.get("response",{}).get("data",{}).get("statuses",[]) if isinstance(result,dict) else []
    first=sts[0] if sts else None
    if isinstance(first,dict) and first.get("error"): raise RuntimeError("Hyperliquid pending rejected: "+str(first["error"]))
    state="pending";oid=""
    try:
        state,qo=_ai6_state(info.query_order_by_cloid(owner,cl));oid=str(qo or "")
    except Exception:
        if isinstance(first,dict): oid=str((first.get("resting") or {}).get("oid") or (first.get("filled") or {}).get("oid") or "")
    return dict(**p,**z,status=state or "pending",replayed=False,cloid=cl.to_raw(),orderId=oid,mid=mid)

def _ai6_split(info,coin,total,n):
    asset=info.coin_to_asset.get(coin);dec=int(info.asset_to_sz_decimals.get(asset,4));step=10**(-dec) if dec>0 else 1.0
    if n==3: weights=[.5,.3,.2]
    elif n==2: weights=[.6,.4]
    else: weights=[1.0]
    out=[];used=0
    for i,w in enumerate(weights):
        if i==len(weights)-1: x=round(total-used,dec)
        else: x=round(math.floor(total*w/step)*step,dec);used+=x
        if x<step: return [round(total,dec)]
        out.append(x)
    return out

def _ai6_position_size(info,owner,coin):
    try:
        for ap in (info.user_state(owner,"") or {}).get("assetPositions",[]) or []:
            p=ap.get("position",{}) or {}
            if str(p.get("coin") or "")==coin:
                return float(p.get("szi") or 0)
    except Exception:
        pass
    return 0.0

def _ai6_cancel_protection(ex,owner,signal_id,coin):
    # TP1/TP2/TP3 and SL are independent reduce-only triggers. Once the
    # broker position is flat, remove any surviving legs so dashboard Open
    # Orders cannot retain stale protection.
    for leg in ("TP1","TP2","TP3","SL"):
        try: ex.cancel_by_cloid(coin,_ai6_cloid(owner,signal_id,leg))
        except Exception: pass

def _ai6_protect(row):
    owner=str(row["wallet_address"]).lower();api=decrypt_key(row["api_private_key_encrypted"]);coin=str(row["hl_coin"])
    info,ex,asset,mid=_ai6_context(coin,owner,api)
    szi=_ai6_position_size(info,owner,coin)
    if not szi: return False
    side=str(row["side"]).upper()
    if side=="LONG" and szi<0: return False
    if side=="SHORT" and szi>0: return False
    qty=abs(szi);tps=[float(row["tp1"])]
    if row["tp2"] is not None: tps.append(float(row["tp2"]))
    if row["tp3"] is not None: tps.append(float(row["tp3"]))
    sizes=_ai6_split(info,coin,qty,len(tps));tps=tps[:len(sizes)];close_buy=side=="SHORT";orders=[]
    for i,(px,sz) in enumerate(zip(tps,sizes),1):
        cl=_ai6_cloid(owner,row["signal_id"],"TP"+str(i));exists=False
        try: exists=_ai6_state(info.query_order_by_cloid(owner,cl))[0] not in ("","unknown","unknownoid")
        except Exception: pass
        if not exists:
            q=_ai6_round_px(px);lim=ex._slippage_price(coin,close_buy,ex.DEFAULT_SLIPPAGE,q);orders.append({"coin":coin,"is_buy":close_buy,"sz":sz,"limit_px":lim,"order_type":{"trigger":{"triggerPx":q,"isMarket":True,"tpsl":"tp"}},"reduce_only":True,"cloid":cl})
    slcl=_ai6_cloid(owner,row["signal_id"],"SL");exists=False
    try: exists=_ai6_state(info.query_order_by_cloid(owner,slcl))[0] not in ("","unknown","unknownoid")
    except Exception: pass
    if not exists:
        q=_ai6_round_px(float(row["sl"]));lim=ex._slippage_price(coin,close_buy,ex.DEFAULT_SLIPPAGE,q);orders.append({"coin":coin,"is_buy":close_buy,"sz":qty,"limit_px":lim,"order_type":{"trigger":{"triggerPx":q,"isMarket":True,"tpsl":"sl"}},"reduce_only":True,"cloid":slcl})
    if orders:
        result=ex.bulk_orders(orders,grouping="na");sts=result.get("response",{}).get("data",{}).get("statuses",[]) if isinstance(result,dict) else []
        errs=[x.get("error") for x in sts if isinstance(x,dict) and x.get("error")]
        if errs: raise RuntimeError("protection rejected: "+" | ".join(map(str,errs)))
    return True

def _ai6_tick():
    _ai6_schema();now=int(time.time()*1000);db=get_db()
    try:
        rows=db.execute("""SELECT p.*,u.api_private_key_encrypted FROM screener_pending_orders p JOIN users u ON u.id=p.user_id WHERE p.status IN ('pending','open','triggered','filled','protecting','protected') ORDER BY p.id LIMIT 100""").fetchall()
    finally: db.close()
    for row in rows:
        try:
            owner=str(row["wallet_address"]).lower();api=decrypt_key(row["api_private_key_encrypted"]);info,ex,asset,mid=_ai6_context(row["hl_coin"],owner,api)
            cl=_ai6_cloid(owner,row["signal_id"],"ENTRY");st,oid=_ai6_state(info.query_order_by_cloid(owner,cl));st=(st or "").lower()
            if int(row["expires_at_ms"])<=now and st not in ("filled","triggered"):
                try: ex.cancel_by_cloid(row["hl_coin"],cl)
                except Exception: pass
                d=get_db();d.execute("UPDATE screener_pending_orders SET status='expired',protection_status='not_needed',updated_at=CURRENT_TIMESTAMP WHERE id=?",(row["id"],));d.commit();d.close();continue
            # A row only reaches protected after a real HL position was seen.
            # protected + now-flat therefore means the broker lifecycle closed.
            if row["status"]=="protected" and not _ai6_position_size(info,owner,row["hl_coin"]):
                _ai6_cancel_protection(ex,owner,row["signal_id"],row["hl_coin"])
                d=get_db();d.execute("UPDATE screener_pending_orders SET status='closed',protection_status='closed',entry_oid=coalesce(?,entry_oid),updated_at=CURRENT_TIMESTAMP WHERE id=?",(str(oid or "") or None,row["id"]));d.commit();d.close();continue
            if st in ("filled","triggered") or row["status"] in ("filled","triggered","protecting","protected"):
                ok=_ai6_protect(row);d=get_db();d.execute("UPDATE screener_pending_orders SET status=?,protection_status=?,entry_oid=coalesce(?,entry_oid),updated_at=CURRENT_TIMESTAMP WHERE id=?",("protected" if ok else "filled","active" if ok else "waiting_position",str(oid or "") or None,row["id"]));d.commit();d.close();continue
            if st in ("open","triggered","waitingfortrigger","pending"):
                d=get_db();d.execute("UPDATE screener_pending_orders SET status='pending',entry_oid=coalesce(?,entry_oid),updated_at=CURRENT_TIMESTAMP WHERE id=?",(str(oid or "") or None,row["id"]));d.commit();d.close();continue
            if st not in ("","unknown","unknownoid"):
                d=get_db();d.execute("UPDATE screener_pending_orders SET status=?,protection_status='not_needed',entry_oid=coalesce(?,entry_oid),updated_at=CURRENT_TIMESTAMP WHERE id=?",(st[:64],str(oid or "") or None,row["id"]));d.commit();d.close()
        except Exception as exc:
            try:
                d=get_db();d.execute("UPDATE screener_pending_orders SET error_details=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",(str(exc)[:1000],row["id"]));d.commit();d.close()
            except Exception: pass

def _ai6_loop():
    while True:
        try: _ai6_tick()
        except Exception as exc: logger.warning("AI6 pending monitor: %s",exc)
        time.sleep(7)

def _ai6_start():
    global _ai6_pending_thread
    with _ai6_pending_lock:
        if _ai6_pending_thread and _ai6_pending_thread.is_alive(): return
        _ai6_pending_thread=threading.Thread(target=_ai6_loop,name="ai6-hl-pending-monitor",daemon=True);_ai6_pending_thread.start()

@app.route("/api/bot-trading/pending-open/preview",methods=["POST"])
def ai6_pending_preview():
    data=request.json or {};signal=data.get("signal") or {}
    try:
        p=_ai6_plan(signal,data.get("risk_usdt",10),data.get("max_notional_usdt",1000));info,ex,asset,mid=_ai6_context(p["coin"])
        distance_pct=_ai6_distance_guard(p,mid)
        z=_ai6_size(info,asset,mid,p)
        return jsonify(dict(status="preview",venue="hyperliquid",orderType="STOP_MARKET",reduceOnly=False,currentMid=mid,distancePct=distance_pct,**p,**z))
    except Exception as exc: return jsonify({"status":"error","error":str(exc)}),400

@app.route("/api/bot-trading/pending-open",methods=["POST"])
def ai6_pending_open():
    data=request.json or {}
    if data.get("confirm") is not True: return jsonify({"status":"error","error":"confirm=true wajib untuk REAL pending order"}),400
    wallet=str(data.get("wallet") or "").strip().lower()
    if not wallet.startswith("0x") or len(wallet)!=42: return jsonify({"status":"error","error":"Wallet tidak valid atau belum login"}),400
    signal=dict(data.get("signal") or {});sid=str(signal.get("signal_id") or data.get("idempotency_key") or "").strip()
    if not sid: return jsonify({"status":"error","error":"signal_id required"}),400
    signal["signal_id"]=sid;_ai6_schema();_ai6_start();db=get_db()
    try:
        user=db.execute("""SELECT id,wallet_address,api_wallet_address,api_private_key_encrypted,status,subscription_status,trial_end,max_positions FROM users WHERE lower(wallet_address)=lower(?) OR lower(coalesce(api_wallet_address,''))=lower(?) LIMIT 1""",(wallet,wallet)).fetchone()
        if not user: return jsonify({"status":"error","error":"API key wallet belum tersimpan"}),404
        if user["status"]!="active": return jsonify({"status":"error","error":"Wallet belum aktif"}),403
        if user["subscription_status"] not in ("active","trial"): return jsonify({"status":"error","error":"Subscription wallet tidak aktif"}),403
        if user["subscription_status"]=="trial" and user["trial_end"]:
            try:
                if datetime.fromisoformat(user["trial_end"])<datetime.utcnow(): return jsonify({"status":"error","error":"Trial wallet sudah berakhir"}),403
            except Exception: pass
        owner=str(user["wallet_address"] or wallet).lower();old=db.execute("SELECT * FROM screener_pending_orders WHERE wallet_address=? AND signal_id=?",(owner,sid)).fetchone()
        if old: return jsonify({"status":old["status"],"replayed":True,"orderId":old["entry_oid"] or "","cloid":old["entry_cloid"],"signal_id":sid,"coin":old["hl_coin"]})
        api=decrypt_key(user["api_private_key_encrypted"]);res=_ai6_submit(owner,api,signal,data.get("risk_usdt",10),data.get("max_notional_usdt",1000),user["max_positions"])
        db.execute("""INSERT INTO screener_pending_orders(user_id,wallet_address,signal_id,hl_coin,side,entry,sl,tp1,tp2,tp3,size,risk_usdt,estimated_risk_usdt,estimated_notional_usdt,entry_cloid,entry_oid,expires_at_ms,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(user["id"],owner,sid,res["coin"],res["side"],res["entry"],res["sl"],res["tp1"],res.get("tp2"),res.get("tp3"),res["size"],res["risk_usdt"],res["estimated_risk_usdt"],res["estimated_notional_usdt"],res["cloid"],res.get("orderId",""),res["expires_at_ms"],"filled" if res.get("status")=="filled" else "pending"))
        db.execute("""INSERT INTO trades(user_id,wallet_address,symbol,side,size,price,order_id,status,error_details) VALUES(?,?,?,?,?,?,?,?,?)""",(user["id"],owner,res["coin"]+"/USD",res["side"],res["size"],res["entry"],res.get("orderId",""),"pending",("SCREENER_REAL_PENDING signal_id="+sid)[:1000]));db.commit()
        return jsonify({"status":"filled" if res.get("status")=="filled" else "pending","venue":"hyperliquid","real":True,"replayed":bool(res.get("replayed")),"signal_id":sid,"coin":res["coin"],"side":res["side"],"entry":res["entry"],"sl":res["sl"],"tp1":res["tp1"],"tp2":res.get("tp2"),"tp3":res.get("tp3"),"orderId":res.get("orderId",""),"cloid":res["cloid"],"executedSize":res["size"],"estimatedRiskUsdt":res["estimated_risk_usdt"],"estimatedNotionalUsdt":res["estimated_notional_usdt"],"expiresAtMs":res["expires_at_ms"]})
    except Exception as exc:
        db.rollback();logger.warning("AI6 real pending rejected wallet=%s signal=%s: %s",wallet[:10],sid,exc);return jsonify({"status":"error","error":str(exc)}),400
    finally: db.close()

@app.route("/api/bot-trading/pending-cancel",methods=["POST"])
def ai6_pending_cancel():
    data=request.json or {};wallet=str(data.get("wallet") or "").strip().lower();sid=str(data.get("signal_id") or "").strip()
    if not wallet or not sid: return jsonify({"status":"error","error":"wallet + signal_id required"}),400
    _ai6_schema();db=get_db()
    try:
        row=db.execute("""SELECT p.*,u.api_private_key_encrypted,u.wallet_address AS owner_wallet FROM screener_pending_orders p JOIN users u ON u.id=p.user_id WHERE (lower(u.wallet_address)=lower(?) OR lower(coalesce(u.api_wallet_address,''))=lower(?)) AND p.signal_id=? LIMIT 1""",(wallet,wallet,sid)).fetchone()
        if not row: return jsonify({"status":"error","error":"pending order not found"}),404
        owner=str(row["owner_wallet"]).lower();api=decrypt_key(row["api_private_key_encrypted"]);info,ex,asset,mid=_ai6_context(row["hl_coin"],owner,api);cl=_ai6_cloid(owner,sid,"ENTRY");result=ex.cancel_by_cloid(row["hl_coin"],cl);db.execute("UPDATE screener_pending_orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?",(row["id"],));db.commit();return jsonify({"status":"cancelled","signal_id":sid,"cloid":cl.to_raw(),"result":result})
    except Exception as exc: db.rollback();return jsonify({"status":"error","error":str(exc)}),400
    finally: db.close()

@app.route("/api/bot-trading/pending-status",methods=["GET"])
def ai6_pending_status():
    wallet=str(request.args.get("wallet") or "").strip().lower()
    if not wallet: return jsonify({"status":"error","error":"wallet required"}),400
    _ai6_schema();db=get_db()
    try:
        rows=db.execute("""SELECT signal_id,hl_coin,side,entry,sl,tp1,tp2,tp3,size,risk_usdt,estimated_risk_usdt,estimated_notional_usdt,entry_cloid,entry_oid,expires_at_ms,status,protection_status,error_details,created_at,updated_at FROM screener_pending_orders WHERE lower(wallet_address)=lower(?) ORDER BY id DESC LIMIT 100""",(wallet,)).fetchall();return jsonify({"status":"ok","orders":[dict(x) for x in rows]})
    finally: db.close()

'''
    for imp in ("hashlib","math","threading","time"):
        line="import "+imp+"\n"
        if line not in bt[:4000]: bt=line+bt
    # Remove a previous startup hook when refreshing V2, then add exactly one.
    bt=bt.replace("    _ai6_start()\n","")
    ds=bt.find(direct_anchor);bt=bt[:ds]+code+"\n"+bt[ds:]
    if "    subscription_mgr.start()\n" in bt:
        bt=bt.replace("    subscription_mgr.start()\n","    subscription_mgr.start()\n    _ai6_start()\n",1)

ds2=bt.find(direct_anchor);cs2=bt.find("def close_trade_for_user",ds2)
if shab(bt[ds2:cs2].encode())!=direct_hash: raise SystemExit("Renko direct-open changed")
fd,tmp=tempfile.mkstemp(prefix=".ai6bot-",suffix=".py",dir=str(BOT.parent));os.close(fd);tp=pathlib.Path(tmp);tp.write_text(bt,"utf-8")
c=run([sys.executable,"-m","py_compile",str(tp)],False)
if c.returncode: raise SystemExit("bot compile "+c.stdout[-3000:])

js=SRC_JS.read_text("utf-8").replace("let O=Promise.resolve(),P=0;","",1)
helper=r'''
const AI6_REAL_PENDING_KEY="copytolive.cryptoScreener.autoRealPending";let ai6AutoRealQueueBusy=false;
function ai6ActiveWallet(){try{return(window.activeHyperliquidWallet&&window.activeHyperliquidWallet())||window._userWallet||""}catch(e){return window._userWallet||""}}
function ai6SignalId(row,signal){return String(signal.signal_id||row.signal_id||("hyperliquid:"+(row.hl_coin||row.symbol)+":"+signal.tf+":"+signal.side+":"+(signal.last_closed_at_ms||signal.expires_at_ms||Math.round(signal.entry*1e8))))}
async function ai6RealPendingSubmit(row,signal,opts){opts=opts||{};const wallet=ai6ActiveWallet();if(!wallet)throw new Error("Wallet belum terkoneksi. Klik Update API Key dulu.");const sid=ai6SignalId(row,signal),risk=10,payload={wallet:wallet,signal:{symbol:row.symbol,hl_coin:row.hl_coin||row.symbol,side:signal.side,entry:signal.entry,sl:signal.sl,tp1:signal.tp1,tp2:signal.tp2,tp3:signal.tp3,tf:signal.tf,confidence:signal.confidence,current_price:row.price_usd,signal_id:sid,expires_at_ms:signal.expires_at_ms},risk_usdt:risk,max_notional_usdt:1000,idempotency_key:sid,confirm:true};if(opts.interactive){const msg="REAL Hyperliquid pending order?\n\n"+payload.signal.hl_coin+" "+signal.side+"\nEntry "+signal.entry+"\nSL "+signal.sl+"\nTP1 "+signal.tp1+" (50%)\nTP2 "+(signal.tp2??"-")+" (30%)\nTP3 "+(signal.tp3??"-")+" (20%)\nRisk target $"+risk+"\n\nOrder ini memakai UANG-REAL dan akan muncul di dashboard PENDING ORDER.";if(!window.confirm(msg))throw new Error("Dibatalkan")}const res=await fetch("/api/bot-trading/pending-open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||data.detail||("HTTP "+res.status));try{window._rerenderPending&&window._rerenderPending();window.refreshPositionsBurst&&window.refreshPositionsBurst("crypto-screener-pending");window.dispatchEvent(new CustomEvent("copytolive:hl-pending-created",{detail:data}))}catch(e){}return data}
async function ai6AutoRealDispatch(rows,minConfidence){if(ai6AutoRealQueueBusy||!ai6ActiveWallet())return;ai6AutoRealQueueBusy=true;try{const c=(rows||[]).filter(function(row){return row&&row.signal&&Number(row.signal.confidence||0)>=Number(minConfidence||60)&&W(row.signal,row.price_usd).status==="pending"});for(const row of c){if(localStorage.getItem(AI6_REAL_PENDING_KEY)!=="1")break;try{await ai6RealPendingSubmit(row,row.signal,{interactive:false})}catch(e){}await new Promise(function(r){setTimeout(r,750)})}}finally{ai6AutoRealQueueBusy=false}}
'''
ta='const T=s.memo(function({row:s,onPickRow:n})';pos=js.find(ta)
if pos<0: raise SystemExit("frontend T anchor missing")
if "AI6_REAL_PENDING_KEY" not in js: js=js[:pos]+helper+js[pos:]
pu=js.find('fetch("/trading/execution/manual-deploy"')
if pu>=0:
    bs=js.rfind('t.jsx("button",{type:"button",onClick:async e=>',0,pu);nb=js.find(',t.jsx("button",{type:"button",onClick:e=>{e.stopPropagation(),r()}',pu)
    if bs<0 or nb<0: raise SystemExit("Paper button boundaries")
    btn='t.jsx("button",{type:"button",onClick:async e=>{if(e.stopPropagation(),"loading"!==p){m("loading"),b("");try{const n=await ai6RealPendingSubmit(s,l,{interactive:true});m("done"),b("HL Pending · "+(n.orderId||n.cloid||"ok"))}catch(n){m("error"),b(n&&n.message||"pending failed")}}},disabled:"loading"===p,className:"text-[9px] px-2 py-1 rounded font-bold",style:{background:"done"===p?"#0ECB81":"error"===p?"#F6465D":"#FFD700",color:"#0B0E11",border:"1px solid #2B3139",opacity:"loading"===p?.7:1,cursor:"loading"===p?"default":"pointer"},title:"REAL Hyperliquid stop-market pending entry · masuk ke dashboard PENDING ORDER",children:"loading"===p?"...":"done"===p?"✓ Pending HL":"error"===p?"✕ Retry":"⚡ REAL Pending"})'
    js=js[:bs]+btn+js[nb:]
state='[ie,oe]=e.useState(null),ce=e.useRef(null)'
if state in js and "setAi6AutoReal" not in js: js=js.replace(state,'[ie,oe]=e.useState(null),[ai6AutoReal,setAi6AutoReal]=e.useState(()=>{try{return localStorage.getItem(AI6_REAL_PENDING_KEY)==="1"}catch(e){return false}}),ce=e.useRef(null)',1)
load='r(n),C("hyperliquid"),m(null)'
if load in js and "ai6AutoRealDispatch(s,B)" not in js: js=js.replace(load,load+',(()=>{try{return localStorage.getItem(AI6_REAL_PENDING_KEY)==="1"}catch(e){return false}})()&&ai6AutoRealDispatch(s,B)',1)
hla='title:"Hyperliquid perpetuals only",children:"HL ONLY"})'
if hla in js and "AUTO REAL ON" not in js:
    ab=',t.jsx("button",{type:"button",onClick:()=>{if(ai6AutoReal){try{localStorage.removeItem(AI6_REAL_PENDING_KEY)}catch(e){}setAi6AutoReal(false)}else{const w=ai6ActiveWallet();if(!w){window.alert("Wallet belum terkoneksi. Klik Update API Key dulu.");return}if(!window.confirm("AKTIFKAN AUTO REAL PENDING?\\n\\nSetiap signal Crypto Screener yang masih PENDING dan lolos confidence aktif akan dikirim sebagai pending order UANG-REAL ke Hyperliquid.\\n\\nBackend membatasi duplicate, existing exposure, max positions, expiry, risk $10 dan max notional $1000."))return;try{localStorage.setItem(AI6_REAL_PENDING_KEY,"1")}catch(e){}setAi6AutoReal(true),l&&ai6AutoRealDispatch(l.rows,B)}},className:"px-3 py-1.5 text-[10px] font-black rounded-full",style:{background:ai6AutoReal?"#F6465D":"#181A1F",color:ai6AutoReal?"#fff":"#848E9C",border:ai6AutoReal?"1px solid #F6465D":"1px solid #2B3139"},title:"OFF default · AUTO REAL membuat native pending order Hyperliquid untuk signal valid",children:ai6AutoReal?"⚡ AUTO REAL ON":"AUTO REAL OFF"})'
    js=js.replace(hla,hla+ab,1)
for bad in ("/trading/execution/manual-deploy","Deployed (paper)"):
    if bad in js: raise SystemExit("legacy Paper remains: "+bad)
for need in ("/api/bot-trading/pending-open","AUTO REAL ON","REAL Pending","TP1 2R","TP2 3R"):
    if need not in js: raise SystemExit("frontend marker missing "+need)
fd,jtmp=tempfile.mkstemp(prefix=".ai6js-",suffix=".js",dir=str(DST_JS.parent));os.close(fd);jp=pathlib.Path(jtmp);jp.write_text(js,"utf-8")
n=run(["node","--check",str(jp)],False)
if n.returncode: raise SystemExit("frontend syntax "+n.stdout[-3000:])

# Preflight shared-shell lifecycle before any production write.
_pre_html=INDEX.read_text("utf-8")
_pre_scripts=re.findall(r'<script[^>]+type="module"[^>]+src="([^"]+)"',_pre_html) or re.findall(r'<script[^>]+src="([^"]+)"[^>]+type="module"',_pre_html)
_pre_mains=[x for x in _pre_scripts if x.startswith("/assets/js/") and "index-" in x]
if len(_pre_mains)!=1: raise SystemExit("preflight active main not unique "+repr(_pre_mains))
_pre_mp=WEB/_pre_mains[0].split("?",1)[0].lstrip("/")
_pre_mt=_pre_mp.read_text("utf-8")
if "frontendOpenOrders" not in _pre_mt or "_hlRealPending" not in _pre_mt: raise SystemExit("preflight dashboard pending lifecycle markers missing")
_pre_deps=sorted(set(re.findall(r'CryptoMultiTFScreener-[A-Za-z0-9_.-]+\\.js',_pre_mt)))
if not _pre_deps: raise SystemExit("preflight screener dependency missing")

(BACK/"backend/bot-trading").mkdir(parents=True,exist_ok=True);(BACK/"web/assets/js").mkdir(parents=True,exist_ok=True);(BACK/"web").mkdir(parents=True,exist_ok=True)
shutil.copy2(BOT,BACK/"backend/bot-trading/bot_trading_api.py");shutil.copy2(INDEX,BACK/"web/index.html")
if DST_JS.exists(): shutil.copy2(DST_JS,BACK/"web/assets/js/CryptoMultiTFScreener-ai6-live-v1.js")
awrite(BOT,bt.encode());awrite(DST_JS,js.encode());tp.unlink(missing_ok=True);jp.unlink(missing_ok=True)
run([sys.executable,"-m","py_compile",str(BOT)]);run(["node","--check",str(DST_JS)])

idx0=INDEX.read_bytes();idx0sha=shab(idx0);html=idx0.decode("utf-8")
scripts=re.findall(r'<script[^>]+type="module"[^>]+src="([^"]+)"',html) or re.findall(r'<script[^>]+src="([^"]+)"[^>]+type="module"',html)
mus=[x for x in scripts if x.startswith("/assets/js/") and "index-" in x]
if len(mus)!=1: raise SystemExit("active main not unique "+repr(mus))
mu=mus[0];mr=mu.split("?",1)[0].lstrip("/");mp=WEB/mr;mt=mp.read_text("utf-8")
if "frontendOpenOrders" not in mt or "_hlRealPending" not in mt: raise SystemExit("existing dashboard pending lifecycle markers missing")
deps=sorted(set(re.findall(r'CryptoMultiTFScreener-[A-Za-z0-9_.-]+\.js',mt)))
if not deps: raise SystemExit("screener dependency missing")
patched=mt
for dep in deps: patched=patched.replace(dep,DST_JS.name)
msha=shab(mt.encode());nr="assets/js/index-ai6-livepending-"+msha[:12]+".js";np=WEB/nr;awrite(np,patched.encode());run(["node","--check",str(np)])
nsha=shaf(np);nu="/"+nr+"?v="+RID+"-"+nsha[:8];needle='src="'+mu+'"'
if html.count(needle)!=1: raise SystemExit("index src anchor")
newhtml=html.replace(needle,'src="'+nu+'"',1).encode()
if shaf(INDEX)!=idx0sha: shutil.copy2(BACK/"backend/bot-trading/bot_trading_api.py",BOT); raise SystemExit("index changed concurrently; backend file rolled back")
awrite(INDEX,newhtml)

ss=run(["bash","-lc","ss -ltnp 2>/dev/null | grep ':11175 ' || true"]).stdout;m=re.search(r'pid=(\d+)',ss)
if not m: shutil.copy2(BACK/"backend/bot-trading/bot_trading_api.py",BOT);shutil.copy2(BACK/"web/index.html",INDEX);raise SystemExit("cannot identify port 11175 pid; backend+index rolled back")
pid=m.group(1);cg=pathlib.Path("/proc/"+pid+"/cgroup").read_text("utf-8",errors="ignore");units=re.findall(r'/([^/\n]+\.service)',cg);unit=units[-1] if units else ""
if not unit: shutil.copy2(BACK/"backend/bot-trading/bot_trading_api.py",BOT);shutil.copy2(BACK/"web/index.html",INDEX);raise SystemExit("port 11175 not systemd-managed; backend+index rolled back")
rr=run(["systemctl","restart",unit],False)
if rr.returncode: shutil.copy2(BACK/"backend/bot-trading/bot_trading_api.py",BOT);shutil.copy2(BACK/"web/index.html",INDEX);run(["systemctl","restart",unit],False);raise SystemExit("restart failed; backend+index rolled back "+rr.stdout[-2000:])
health=None
for _ in range(30):
    try:
        with urllib.request.urlopen("http://127.0.0.1:11175/api/bot-trading/health",timeout=2) as resp:
            health=json.loads(resp.read().decode())
            if resp.status==200: break
    except Exception: time.sleep(1)
else:
    shutil.copy2(BACK/"backend/bot-trading/bot_trading_api.py",BOT);shutil.copy2(BACK/"web/index.html",INDEX);run(["systemctl","restart",unit],False);raise SystemExit("health failed; rolled back")
fin=BOT.read_text("utf-8");a=fin.find(direct_anchor);b=fin.find("def close_trade_for_user",a);dh=shab(fin[a:b].encode())
if dh!=direct_hash: raise SystemExit("post-deploy Renko direct-open changed")
print(json.dumps({"ok":True,"acceptance":"DEPLOYED","bot_old_sha256":bot0sha,"bot_new_sha256":shaf(BOT),"direct_open_hash_before":direct_hash,"direct_open_hash_after":dh,"frontend_live_sha256":shaf(DST_JS),"active_main_before":mu,"active_main_after":nu,"active_main_sha256":nsha,"index_old_sha256":idx0sha,"index_new_sha256":shaf(INDEX),"dashboard_lifecycle_preserved":True,"service":unit,"health":health,"backup":str(BACK)},separators=(",",":")))
