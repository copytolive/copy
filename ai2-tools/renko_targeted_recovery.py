import json,os,time,urllib.request,urllib.error,pathlib,sys
base="https://copytolive.com/api/charting/hyperliquid"
out_path=pathlib.Path(sys.argv[1])
aid=sys.argv[2]
out={"id":aid,"ok":False,"checks":{}}

def req(path,timeout=25):
    u=base+path
    t=time.time()
    try:
        q=urllib.request.Request(u,headers={"User-Agent":"CopyToLive-AI2-Recovery","Cache-Control":"no-cache"})
        with urllib.request.urlopen(q,timeout=timeout) as r:
            b=r.read()
            try:d=json.loads(b)
            except Exception:d={}
            return {"status":getattr(r,"status",200),"seconds":round(time.time()-t,3),"returned":len(d.get("candles") or []),"count":d.get("count"),"error":d.get("error","")}
    except urllib.error.HTTPError as e:
        return {"status":e.code,"seconds":round(time.time()-t,3),"returned":0,"error":str(e)}
    except Exception as e:
        return {"status":0,"seconds":round(time.time()-t,3),"returned":0,"error":str(e)}

for sym in ["NEO","SOL","GOLD","SILVER","WTIOIL","BRENTOIL"]:
    attempts=[]
    for n in range(1,11):
        x=req(f"/renko/{sym}?limit=400&smaPeriod=10&sma=10")
        x["n"]=n; attempts.append(x)
        if x["status"]==200 and x["returned"]>0: break
        time.sleep(min(8,n))
    out["checks"][sym]={"ok":attempts[-1]["status"]==200 and attempts[-1]["returned"]>0,"attempts":attempts}

for name,path in [("universe","/renko-universe"),("indicator","/indicator-catalog")]:
    attempts=[]
    for n in range(1,6):
        x=req(path);x["n"]=n;attempts.append(x)
        if x["status"]==200:break
        time.sleep(n)
    out["checks"][name]={"ok":attempts[-1]["status"]==200,"attempts":attempts}

out["ok"]=all(v["ok"] for v in out["checks"].values())
out_path.parent.mkdir(parents=True,exist_ok=True)
out_path.write_text(json.dumps(out,indent=2)+"\n")
print(json.dumps(out,indent=2))
