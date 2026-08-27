(function(){
'use strict';
var VERSION=25;
function imp(el,k,v){if(el&&el.style)try{el.style.setProperty(k,v,'important');}catch(e){}}
function install(){
  var old=window.__CTL_HISTORY_PANEL_RESTORE_V25__;
  if(old){try{if(old.observer)old.observer.disconnect();}catch(e){}try{if(old.timer)clearInterval(old.timer);}catch(e){}}
  var state={ready:true,version:VERSION,source:'restore-history-panel-after-layout-regression',observer:null,timer:null,repairs:0};
  window.__CTL_HISTORY_PANEL_RESTORE_V25__=state;
  function ensure(){
    var panel=document.getElementById('backtestHistoryPanel');
    if(!panel)return false;
    imp(panel,'display','block');
    imp(panel,'visibility','visible');
    imp(panel,'opacity','1');
    imp(panel,'height','auto');
    imp(panel,'max-height','none');
    imp(panel,'overflow','visible');
    imp(panel,'animation','none');
    imp(panel,'transition','none');
    var parent=panel.parentElement;
    if(parent){imp(parent,'display','block');imp(parent,'visibility','visible');imp(parent,'opacity','1');imp(parent,'height','auto');imp(parent,'max-height','none');imp(parent,'overflow','visible');}
    var body=document.getElementById('historyBody');
    if(body){imp(body,'display','block');imp(body,'visibility','visible');imp(body,'opacity','1');imp(body,'height','auto');imp(body,'max-height','none');imp(body,'overflow','visible');}
    return true;
  }
  ensure();
  state.timer=setInterval(function(){if(ensure())state.repairs++;},1000);
  if(window.MutationObserver&&document.body){
    state.observer=new MutationObserver(function(ms){
      for(var i=0;i<ms.length;i++){
        var t=ms[i].target;
        if(!t)continue;
        if(t.id==='backtestHistoryPanel'||t.id==='historyBody'||(t.closest&&t.closest('#backtestHistoryPanel,#historyBody'))){ensure();return;}
      }
    });
    state.observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['style','class','hidden'],childList:true});
  }
  return true;
}
window.__ctlInstallHistoryPanelRestoreV25=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
