/* Run before third-party assets: keep a shared-link session separate from owner login. */
(() => {
  'use strict';
  const key='aaf_stock_sales_link_v1';
  const pattern=/^aafsl\.[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/;
  let sharedToken=null;
  try{sharedToken=sessionStorage.getItem(key);}catch{}
  function consume(){
    if(!location.hash.startsWith('#stock-link='))return false;
    const candidate=location.hash.slice('#stock-link='.length);
    sharedToken=pattern.test(candidate)?candidate:'invalid';
    // Remove the bearer fragment before any external script executes.
    history.replaceState(null,'',location.pathname+location.search);
    try{sessionStorage.setItem(key,sharedToken);}catch{}
    return true;
  }
  consume();
  window.addEventListener('hashchange',()=>{if(consume())location.reload();});
  const isShared=()=>sharedToken!==null;
  window.AAFStockAccess=Object.freeze({
    isShared,
    token(){
      if(isShared())return pattern.test(sharedToken)?sharedToken:'aafsl.invalid';
      try{const s=JSON.parse(sessionStorage.getItem('aaf_user'));return s?.stockSessionToken||s?.gradeBridgeSessionToken||s?.bridgeSessionToken||'';}catch{return '';}
    },
    exit(){try{sessionStorage.removeItem(key);}catch{}sharedToken=null;location.replace(location.pathname+'?view=sales');},
  });
})();
