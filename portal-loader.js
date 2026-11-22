(async()=>{
 const page=document.currentScript?.dataset.page||document.querySelector('script[data-page]')?.dataset.page;
 const status=document.getElementById('portal-status');
 try{
   const session=JSON.parse(sessionStorage.getItem('aaf_user')||'null');
   const token=session?.stockSessionToken||session?.gradeBridgeSessionToken||session?.bridgeSessionToken;
   if(!token){location.replace('login.html?reauth=1');return;}
   const base='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/portal';
   const options={cache:'no-store',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)};
   const check=await fetch(base+'/session',options);const identity=await check.json();
   if(!check.ok||!identity.ok){if(check.status===401){sessionStorage.removeItem('aaf_user');location.replace('login.html?reauth=1');return;}throw Error(identity.error||'ตรวจสิทธิ์ไม่สำเร็จ');}
   sessionStorage.setItem('aaf_user',JSON.stringify({...session,...identity.user}));
   if(identity.user.role==='purchase_material'&&page!=='purchase_material'){location.replace('purchase_material.html');return;}
   if(page==='history_database'&&identity.user.role==='sales'){location.replace('sales_analytics.html');return;}
   const response=await fetch(base+'/page?name='+encodeURIComponent(page),{...options,signal:AbortSignal.timeout(30000)});
   if(!response.ok){const e=await response.json();throw Error(e.error||'โหลดข้อมูลไม่สำเร็จ');}
   let html=await response.text();
   if(page==='production_plan'&&identity.user.role!=='purchase_material'){
     const root=new URL('.', location.href);
     const assets=[
       {file:'assets/production_plan.premium.css',v:'972ba3ea1164',attr:'data-aaf-premium-c-depth="css"',kind:'link'},
       {file:'assets/production_plan.paint.js',v:'c62acef3ffd3',attr:'data-aaf-grid="paint"',kind:'script'},
       {file:'assets/production_plan.visual-hooks.js',v:'93caa23de6ee',attr:'data-aaf-premium-c-depth="hooks"',kind:'script'},
       {file:'assets/production_plan.forecast.js',v:'16b95b91aa60',attr:'data-aaf-forecast="js"',kind:'script'},
       {file:'assets/production_plan.grid-clarity.js',v:'1bfff063a7b8',attr:'data-aaf-grid="clarity"',kind:'script'},
       {file:'assets/production_plan.grid-modern.js',v:'12be29247b82',attr:'data-aaf-grid="modern"',kind:'script'},
       {file:'assets/production_plan.mixed-layout.js',v:'fc3bbf60c4ce',attr:'data-aaf-grid="mixed-layout"',kind:'script'},
       {file:'assets/production_plan.loading-layout.js',v:'e4b9b7f96597',attr:'data-aaf-grid="loading-layout"',kind:'script'},
       {file:'assets/production_plan.actual-colors.js',v:'69e5e7025df4',attr:'data-aaf-grid="actual-colors"',kind:'script'},
       {file:'assets/production_plan.eq25-size.js',v:'f0c8a3123f06',attr:'data-aaf-grid="eq25-size"',kind:'script'},
       {file:'assets/production_plan.viewport.js',v:'285cc851df7a',attr:'data-aaf-grid="viewport"',kind:'script'}
     ];
     const pathOf=a=>a.file+(a.v?('?v='+a.v):'');
     const hrefOf=a=>new URL(pathOf(a), root).href;
     const tagOf=a=>a.kind==='link'
       ? '<link rel="stylesheet" href="'+hrefOf(a)+'" '+a.attr+'>'
       : '<script src="'+hrefOf(a)+'" '+a.attr+'></script>';
     // Refresh any already-baked add-on ?v= tokens to the current files.
     assets.forEach(a=>{
       if(!a.v)return;
       const esc=a.file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
       const re=new RegExp('('+esc+'\\?v=)[^"\\' + "'&#\\s]+",'g');
       html=html.replace(re,'$1'+a.v);
     });
     const missing=assets.filter(a=>html.indexOf(a.file)===-1);
     const cssMissing=missing.filter(a=>a.kind==='link');
     const jsMissing=missing.filter(a=>a.kind==='script');
     if(cssMissing.length&&/<\/head>/i.test(html)) html=html.replace(/<\/head>/i, cssMissing.map(tagOf).join('\n')+'\n</head>');
     if(jsMissing.length){
       const block=jsMissing.map(tagOf).join('\n')+'\n';
       if(/<\/body>/i.test(html)) html=html.replace(/<\/body>/i, block+'</body>');
       else html+=block;
     }
   }
   document.open();document.write(html);document.close();
 }catch(error){status.textContent=error.message+' · ลองรีเฟรชหน้านี้อีกครั้ง';}
})();
