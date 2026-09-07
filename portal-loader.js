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
   const html=await response.text();document.open();document.write(html);document.close();
 }catch(error){status.textContent=error.message+' · ลองรีเฟรชหน้านี้อีกครั้ง';}
})();
