/* CopyToLive · RENKO SMA10 REAL HISTORY V6 · UI retired by V44 · 2026-09-02 */
(function(){
'use strict';
var ID='renkoSmaHistoryPanel';
function removePanel(doc){
  try{
    doc=doc||document;
    var el=doc.getElementById(ID);
    if(el)el.remove();
    var css=doc.getElementById('ctlV44RetireRenkoSmaHistory');
    if(!css){
      css=doc.createElement('style');
      css.id='ctlV44RetireRenkoSmaHistory';
      css.textContent='#'+ID+'{display:none!important;visibility:hidden!important;pointer-events:none!important}';
      (doc.head||doc.documentElement).appendChild(css);
    }
  }catch(e){}
}
function retire(){
  removePanel(document);
  try{if(window.parent&&window.parent!==window)removePanel(window.parent.document);}catch(e){}
}
window.COPYTOLIVE_RENKO_REAL_HISTORY_V6=true;
window.__CTL_RENKO_SMA_HISTORY_V6__={version:44,uiRetired:true,source:'v44-no-total-history-overlay',remove:retire};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',retire,{once:true});else retire();
setTimeout(retire,250);
setTimeout(retire,1200);
})();
