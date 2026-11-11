/* Visual-layer helper only. Adds classes after render; never changes
   values, field IDs, formulas, or save/load behavior. Safe to omit. */
(function () {
  const HOLIDAYS = {};

  function colInfo(cells) {
    let c = 0;
    return Array.from(cells).map(function (el) {
      const span = Number(el.colSpan || 1) || 1;
      const start = c;
      c += span;
      return { el: el, start: start, end: c };
    });
  }

  
  function tagLineSections(table) {
    let current = null;
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      if (tr.classList.contains('line-sep')) {
        current = tr.classList.contains('l1') ? 'in-line-1'
          : tr.classList.contains('l2') ? 'in-line-2'
          : tr.classList.contains('l3') ? 'in-line-3'
          : null;
        return;
      }
      if (tr.className && /production-daily-/.test(tr.className)) {
        current = null;
        return;
      }
      if (current) tr.classList.add(current);
    });
    ['in-line-1','in-line-2','in-line-3'].forEach(function (cls) {
      const rows = Array.from(table.querySelectorAll('tbody tr.' + cls));
      if (rows.length) rows[rows.length - 1].classList.add('is-slab-end');
    });
    table.querySelectorAll('tr.line-sep.l1, tr.line-sep.l2, tr.line-sep.l3').forEach(function (tr) {
      tr.classList.add('is-slab-start');
    });
    const totals = Array.from(table.querySelectorAll('tbody tr[class*="production-daily-"]'));
    if (totals.length) {
      totals[0].classList.add('is-totals-start');
      totals[totals.length - 1].classList.add('is-totals-end');
    }
  }

  function tagTable(table, ym) {
    const headerRow = table.querySelector('thead tr.dayheader') || table.querySelector('thead tr');
    if (!headerRow) return;
    const heads = colInfo(headerRow.children);
    const ranges = [];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    heads.forEach(function (h, i) {
      if (i === 0) return;
      const d = parseInt(String(h.el.textContent).replace(/[^\d]/g, ''), 10);
      if (!d) return;
      const date = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, d);
      const dow = date.getDay();
      const iso = ym + '-' + String(d).padStart(2, '0');
      const cls = [];
      if (dow === 0 || dow === 6) cls.push('is-weekend');
      if (HOLIDAYS[iso]) cls.push('is-holiday');
      if (iso === today) cls.push('is-today');
      if (!cls.length) return;
      ranges.push({ start: h.start, end: h.end, cls: cls });
      cls.forEach(function (c) { h.el.classList.add(c); });
    });
    tagLineSections(table);
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      tagRowKind(tr);
      colInfo(tr.children).forEach(function (cell, i) {
        if (i === 0) return;
        ranges.forEach(function (r) {
          if (cell.start < r.end && cell.end > r.start) {
            r.cls.forEach(function (c) { cell.el.classList.add(c); });
          }
        });
        tagEmptyOrZero(cell.el);
      });
    });
  }

  function tagRowKind(tr) {
    const labelEl = tr.querySelector('th');
    const label = ((labelEl && labelEl.textContent) || '').replace(/\s+/g, ' ').trim();
    if (!label) return;
    if (/รับเข้าจริง|ราคาจริง|ใช้จริง|คงเหลือจริง|ผลจริง|ผลิตจริง|ของจริง/.test(label)) {
      tr.classList.add('is-actual-row');
    } else if (/เป้า|แผน |แผน$|เป้ารับ|เป้าราคา|P\/hr เป้า|เป้าแผ่น/.test(label)) {
      tr.classList.add('is-plan-row');
    }
  }

  function tagEmptyOrZero(el) {
    const control = el.querySelector && el.querySelector('input, select, textarea');
    if (control) {
      const v = String(control.value == null ? '' : control.value).trim();
      if (v === '') el.classList.add('is-empty-input');
      else if (/^0+(\.0+)?$/.test(v)) el.classList.add('is-zero-cell');
      return;
    }
    const t = String(el.textContent || '').replace(/,/g, '').trim();
    if (t === '' || t === '—' || t === '-' || t === '–') {
      el.classList.add('is-empty-input');
    } else if (/^0+(\.0+)?$/.test(t) || t === '0%' || t === '0.0%' || t === '0.00%') {
      el.classList.add('is-zero-cell');
    }
  }

  function tagAll() {
    const ym = (document.getElementById('monthPicker') || {}).value;
    if (!ym) return;
    document.querySelectorAll('table.preview-table, table.production-overview-grid').forEach(function (t) {
      tagTable(t, ym);
    });
    document.querySelectorAll('.daycard').forEach(function (card) {
      const num = card.querySelector('.dayhead .num, .num');
      const d = num ? parseInt(num.textContent, 10) : NaN;
      if (!d) return;
      const date = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, d);
      if (date.getDay() === 0 || date.getDay() === 6) card.classList.add('is-weekend');
    });
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      tagAll();
      pinLineLabels();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
  const main = document.getElementById('main');
  if (main) {
    new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  }
  function pinLineLabels() {
    document.querySelectorAll('table.preview-table, table.production-overview-grid').forEach(function (table) {
      const wrap = table.closest('.tablewrap');
      if (!wrap) return;
      if (!wrap.dataset.aafPinBound) {
        wrap.dataset.aafPinBound = '1';
        wrap.addEventListener('scroll', pinLineLabels, { passive: true });
      }
      const x = wrap.scrollLeft;
      const cs = getComputedStyle(wrap);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const view = Math.max(0, (wrap.clientWidth || 0) - padL - padR);
      const tableW = table.scrollWidth || 0;
      table.querySelectorAll('tr.line-sep th, tr.production-shipment-pending td, tr.production-shipment-pending th').forEach(function (el) {
        el.style.setProperty('padding-left', (x + 16) + 'px', 'important');
        // Keep full-width notes in the visible window when the grid is scrolled.
        const rightPad = Math.max(16, tableW - x - view + 8);
        el.style.setProperty('padding-right', rightPad + 'px', 'important');
      });
    });
  }

  document.querySelectorAll('.tablewrap').forEach(function (wrap) {
    wrap.addEventListener('scroll', pinLineLabels, { passive: true });
  });
  // keep pin in sync after rerenders
  setInterval(pinLineLabels, 400);

  setInterval(function () {
    const bar = document.getElementById('floatingDayHeader');
    if (!bar) return;
    const src = document.querySelector('table.preview-table thead tr');
    if (!src) return;
    const cloneThs = bar.querySelectorAll('th');
    const realThs = src.children;
    for (let i = 0; i < cloneThs.length && i < realThs.length; i++) {
      ['is-weekend', 'is-holiday', 'is-today', 'today-col-header'].forEach(function (c) {
        cloneThs[i].classList.toggle(c, realThs[i].classList.contains(c));
      });
    }
  }, 500);
})();
