(function(){
'use strict';
function install(){
  var old=window.__CTL_HL_MARKET_ONLY_V18__;if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}
  function ensure(){
    var st=window.__CTL_HISTORY_STABLE__;if(!st||st.version<10||typeof st.render!=='function')return false;
    if(!st.__ctlMarketOnlyV18Wrapped){
      var base=st.render;
      st.render=function(){
        if(st.mode!=='pending')return base();
        var a=window._allPending,b=window._sortedPending,c=window._enginePositions;
        try{window._allPending=[];window._sortedPending=[];window._enginePositions=[];return base();}
        finally{window._allPending=a;window._sortedPending=b;window._enginePositions=c;}
      };
      st.__ctlMarketOnlyV18Wrapped=true;
    }
    if(st.mode==='pending'&&Array.isArray(st.engine)&&st.engine.length){try{st.render();}catch(e){}}
    return true;
  }
  var s={ready:true,version:18,timer:setInterval(ensure,250),ensure:ensure};window.__CTL_HL_MARKET_ONLY_V18__=s;ensure();return true;
}
window.__ctlInstallHlMarketOnlyV18=install;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();