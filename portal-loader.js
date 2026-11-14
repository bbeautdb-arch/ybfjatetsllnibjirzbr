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
   if(page==='history_database'&&identity.user.role==='sales'){location.replace('sales_analytics.html');return;}
   const response=await fetch(base+'/page?name='+encodeURIComponent(page),{...options,signal:AbortSignal.timeout(30000)});
   if(!response.ok){const e=await response.json();throw Error(e.error||'โหลดข้อมูลไม่สำเร็จ');}
   let html=await response.text();
   if(page==='production_plan'){
     const root=new URL('.', location.href);
     const cssHref=new URL('assets/production_plan.premium.css?v=f5ce13a5aaf2', root).href;
     const hookSrc=new URL('assets/production_plan.visual-hooks.js', root).href;
     const fcSrc=new URL('assets/production_plan.forecast.js?v=16b95b91aa60', root).href;
     const fcTag='<script src="'+fcSrc+'" data-aaf-forecast="js"></script>';
     const claritySrc=new URL('assets/production_plan.grid-clarity.js?v=a2b578da0efd', root).href;
     const clarityTag='<script src="'+claritySrc+'" data-aaf-grid="clarity"></script>';
     const modernSrc=new URL('assets/production_plan.grid-modern.js?v=752fc32ee9e7', root).href;
     const modernTag='<script src="'+modernSrc+'" data-aaf-grid="modern"></script>';
     const mixedSrc=new URL('assets/production_plan.mixed-layout.js?v=bef1b4652ac5', root).href;
     const mixedTag='<script src="'+mixedSrc+'" data-aaf-grid="mixed-layout"></script>';
     const loadingSrc=new URL('assets/production_plan.loading-layout.js?v=c41a2edebcd0', root).href;
     const loadingTag='<script src="'+loadingSrc+'" data-aaf-grid="loading-layout"></script>';
     const colorSrc=new URL('assets/production_plan.actual-colors.js?v=428506d057ec', root).href;
     const colorTag='<script src="'+colorSrc+'" data-aaf-grid="actual-colors"></script>';
     const viewportSrc=new URL('assets/production_plan.viewport.js?v=6e77c244087c', root).href;
     const viewportTag='<script src="'+viewportSrc+'" data-aaf-grid="viewport"></script>';
     const cssTag='<link rel="stylesheet" href="'+cssHref+'" data-aaf-premium-c-depth="css">';
     const hookTag='<script src="'+hookSrc+'" data-aaf-premium-c-depth="hooks"></script>';
     if(html.indexOf('data-aaf-premium-c-depth')===-1){
       if(/<\/head>/i.test(html)) html=html.replace(/<\/head>/i, cssTag+'\n</head>');
       if(/<\/body>/i.test(html)) html=html.replace(/<\/body>/i, hookTag+'\n'+fcTag+'\n'+clarityTag+'\n'+modernTag+'\n'+mixedTag+'\n'+loadingTag+'\n'+colorTag+'\n'+viewportTag+'\n</body>');
     }
   }
   document.open();document.write(html);document.close();
 }catch(error){status.textContent=error.message+' · ลองรีเฟรชหน้านี้อีกครั้ง';}
})();
