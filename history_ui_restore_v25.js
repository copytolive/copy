(function(){
'use strict';
var VERSION=25,POLL=500;
function important(el,k,v){if(el&&el.style)try{el.style.setProperty(k,v,'important');}catch(e){}}
function visible(el,display){if(!el)return;important(el,'display',display||'block');important(el,'visibility','visible');important(el,'opacity','1');el.removeAttribute('aria-hidden');}
function hide(el){if(!el)return;important(el,'display','none');el.setAttribute('aria-hidden','true');}
function textNodes(root){return root?root.querySelectorAll('div,span,h1,h2,h3,h4,h5,h6'):[];}
function exactTitle(root,text){var a=textNodes(root);for(var i=0;i<a.length;i++){if(String(a[i].textContent||'').trim()===text)return a[i];}return null;}
function stopV24(){var v=window.__CTL_UI_CLEANUP_V24__;if(!v)return;try{if(v.timer)clearInterval(v.timer);}catch(e){}try{if(v.observer)v.observer.disconnect();}catch(e){}v.timer=null;v.observer=null;v.disabledBy='v25-history-restore';}
function restoreHistoryShell(){
  var wp=document.querySelector('.workspace-performance');
  if(wp){visible(wp,'block');var sec=wp.querySelector(':scope > .section');if(sec){visible(sec,'flex');important(sec,'flex-direction','column');}}
  var historyBody=document.getElementById('historyBody');if(historyBody)visible(historyBody,'block');
  var panel=document.getElementById('backtestHistoryPanel');if(panel)visible(panel,'block');
  var filters=document.getElementById('historyTypeFilters');if(filters)visible(filters,'flex');
  var title=exactTitle(panel,'📋 Detailed Trade Log · ALL PAIRS');if(title){title.id='ctlDetailedTradeLogTitleV25';visible(title,'block');important(title,'animation','none');important(title,'transition','none');important(title,'transform','none');}
  var table=document.getElementById('historyTable');var empty=document.getElementById('emptyHistory');var tb=document.getElementById('historyTableBody');
  if(tb&&tb.querySelectorAll('tr').length){if(table)visible(table,'table');if(empty)hide(empty);}
}
function safeHideRenkoHistory(){
  var ids=['renkoSmaHistoryTable','renkoSmaHistoryEmpty','renkoSmaHistoryRows','renkoSmaHistorySummary'];
  for(var i=0;i<ids.length;i++)hide(document.getElementById(ids[i]));
  var root=document.querySelector('.workspace-performance')||document.body;
  var title=exactTitle(root,'🧱 RENKO SMA10 · LIVE HISTORY');
  if(title){
    hide(title);
    var p=title.parentElement,chosen=null,steps=0;
    while(p&&steps++<5){
      if(p.id==='historyBody'||p.id==='backtestHistoryPanel'||p.classList.contains('workspace-performance')||p.classList.contains('section'))break;
      var containsBacktest=!!(p.querySelector&&p.querySelector('#backtestHistoryPanel'));
      var containsRenko=!!(p.querySelector&&(p.querySelector('#renkoSmaHistoryTable')||p.querySelector('#renkoSmaHistoryEmpty')||p.querySelector('#renkoSmaHistorySummary')));
      if(containsRenko&&!containsBacktest)chosen=p;
      p=p.parentElement;
    }
    if(chosen)hide(chosen);
  }
}
function hideRetiredOnly(){
  hide(document.getElementById('rrMonitorBox'));
  safeHideRenkoHistory();
  if(document.body&&document.createTreeWalker){var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),node,guard=0;while((node=w.nextNode())&&guard++<16000){var s=String(node.nodeValue||'');if(s.indexOf('HL CACHE ACCOUNT')>=0)node.nodeValue=s.replace(/HL CACHE ACCOUNT[^\n]*/g,'').trim();}}
}
function ensurePendingOwner(){var st=window.__CTL_HISTORY_STABLE__;if(st&&st.mode==='pending'&&typeof st.render==='function'){var tb=document.getElementById('historyTableBody'),e=document.getElementById('emptyHistory'),t=document.getElementById('historyTable');var hasRows=tb&&tb.querySelectorAll('tr').length>0;var broken=hasRows&&((e&&getComputedStyle(e).display!=='none')||(t&&getComputedStyle(t).display==='none'));if(broken)try{st.render();}catch(_e){}}}
function install(){
  var old=window.__CTL_UI_RESTORE_V25__;if(old){try{if(old.timer)clearInterval(old.timer);}catch(e){}try{if(old.observer)old.observer.disconnect();}catch(e){}}
  stopV24();
  var state={ready:true,version:VERSION,source:'restore-performance-history+disable-v24-parent-hide+surgical-retired-hide',timer:null,observer:null,repairs:0};window.__CTL_UI_RESTORE_V25__=state;
  var busy=false;function apply(){if(busy)return;busy=true;try{stopV24();restoreHistoryShell();hideRetiredOnly();ensurePendingOwner();state.repairs++;}finally{busy=false;}}
  apply();state.timer=setInterval(apply,POLL);
  if(window.MutationObserver&&document.body){var queued=false;state.observer=new MutationObserver(function(ms){if(busy||queued)return;for(var i=0;i<ms.length;i++){var t=ms[i].target;if(!t)continue;if(t.id==='historyBody'||t.id==='backtestHistoryPanel'||t.id==='historyTableBody'||t.id==='emptyHistory'||t.id==='rrMonitorBox'||t.id==='renkoSmaHistoryTable'||(t.closest&&t.closest('.workspace-performance,#backtestHistoryPanel,#historyTableBody,#rrMonitorBox'))){queued=true;Promise.resolve().then(function(){queued=false;apply();});break;}}});state.observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','aria-hidden']});}
  return true;
}
window.__ctlInstallUiRestoreV25=install;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
