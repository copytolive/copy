#!/usr/bin/env python3
import hashlib,json,os,pathlib,shutil,subprocess,sys
DEPLOY=pathlib.Path(os.environ.get("AI6_DEPLOY_JSON","/tmp/ai6-live-pending-v3-deploy.json"))
BOT=pathlib.Path("/home/opentrue-platform/backend/bot-trading/bot_trading_api.py")
INDEX=pathlib.Path("/var/www/copytolive/index.html")
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
if not DEPLOY.is_file(): raise SystemExit("deploy receipt missing")
d=json.loads(DEPLOY.read_text())
back=pathlib.Path(str(d.get("backup") or ""))
if not back.is_dir(): raise SystemExit("backup directory missing")
bb=back/"backend/bot-trading/bot_trading_api.py"; bi=back/"web/index.html"
if not bb.is_file() or not bi.is_file(): raise SystemExit("backup files missing")
# Never overwrite another lane's newer production changes.
if d.get("bot_new_sha256") and BOT.is_file() and sha(BOT)!=d["bot_new_sha256"]:
    raise SystemExit("rollback refused: backend changed after AI6 deploy")
if d.get("index_new_sha256") and INDEX.is_file() and sha(INDEX)!=d["index_new_sha256"]:
    raise SystemExit("rollback refused: index changed after AI6 deploy")
shutil.copy2(bb,BOT);shutil.copy2(bi,INDEX)
unit=str(d.get("service") or "")
if unit:
    cp=subprocess.run(["systemctl","restart",unit],capture_output=True,text=True)
    if cp.returncode: raise SystemExit("files restored but restart failed: "+(cp.stderr or cp.stdout)[-1500:])
print(json.dumps({"ok":True,"rolled_back":True,"bot_sha256":sha(BOT),"index_sha256":sha(INDEX),"service":unit},separators=(",",":")))
