/* Navigation boundary only. Server permissions remain the data authority.
   Load synchronously before page scripts; never clear another workflow's data. */
(() => {
  'use strict';
  function enforcePurchasingPage() {
    let user = null;
    try { user = JSON.parse(sessionStorage.getItem('aaf_user') || 'null'); } catch { return; }
    if (user?.role !== 'purchase_material') return;
    // Hide any parser/BFCache content while navigation commits. This changes no
    // plan, receipt, supplier, stock, shared-link session or owner draft value.
    document.documentElement.style.setProperty('display', 'none', 'important');
    window.location.replace('purchase_material.html');
  }
  enforcePurchasingPage();
  window.addEventListener('pageshow', enforcePurchasingPage);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) enforcePurchasingPage();
  });
})();
