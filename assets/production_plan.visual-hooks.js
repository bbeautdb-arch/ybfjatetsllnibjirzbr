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
        if (cell.el.querySelector && cell.el.querySelector('.stock-override')) {
          cell.el.classList.add('is-actual-cell');
        }
      });
    });
  }

  /* Mapping is documented in premium-D-fit/MAPPING.md.
     Actual = labels that the page itself marks as ของจริง / รับเข้าจริง / etc.
     Target/plan = labels with เป้า, Target, แผน, คาดการณ์, ประมาณ, or schedule inputs. */
  const ACTUAL_RE = /รับเข้าจริง|ราคาจริง|ใช้จริง|การใช้จริง|คงเหลือจริง|ผลจริง|ผลิตจริง|ของจริง|งบที่ใช้จริง|สะสมถึงตอนนี้|นับจริง/;
  const PLAN_RE = /เป้า|Target|target|แผนรับเข้า|ราคาแผน|แผนออก|คาดการณ์|เป้ารับ|เป้าราคา|P\/hr|Density มาตรฐาน|≈ มาตรฐาน|มาตรฐาน 2\.5|ประมาณการใช้|เบิกใช้|ผลผลิต 2\.5|ผลผลิตคาดการณ์|ประสิทธิภาพรวม|ชม\.ผลิต|^ความหนา$|^ขนาด$|เงินที่ต้องเตรียม|รวมงบ|รวมเป้า|ยิวการใช้ไม้/;

  function tagRowKind(tr) {
    const labelEl = tr.querySelector('th');
    const label = ((labelEl && labelEl.textContent) || '').replace(/\s+/g, ' ').trim();
    if (!label) return;
    tr.classList.remove('is-actual-row', 'is-plan-row');
    if (ACTUAL_RE.test(label)) {
      tr.classList.add('is-actual-row');
    } else if (PLAN_RE.test(label)) {
      tr.classList.add('is-plan-row');
      if (/≈ มาตรฐาน|มาตรฐาน 2\.5|ผลผลิต 2\.5 รวม/.test(label)) {
        tr.classList.add('is-plan-emphasis');
      }
    }
  }

  function tagCards() {
    document.querySelectorAll('.card').forEach(function (card) {
      const lab = (((card.querySelector('.label') || {}).textContent) || '').replace(/\s+/g, ' ').trim();
      if (!lab) return;
      card.classList.remove('is-actual-card', 'is-plan-card');
      if (ACTUAL_RE.test(lab) || /งบที่ใช้จริง|สะสมถึงตอนนี้/.test(lab)) {
        card.classList.add('is-actual-card');
      } else if (PLAN_RE.test(lab) || /เตรียม|รวมงบ|รวมเป้า|^Line [123]$|^LINE [123]$/.test(lab)) {
        card.classList.add('is-plan-card');
      }
    });
  }


  function tagLabeledFields() {
    document.querySelectorAll('label, .wood-cfg label, .cfg-grid label, [class*="wood"] label').forEach(function (lab) {
      const t = (lab.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (ACTUAL_RE.test(t)) lab.classList.add('is-actual-label');
      else if (PLAN_RE.test(t) || /Target|เป้า|เป้าหมาย/.test(t)) lab.classList.add('is-plan-label');
    });
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

  function ensureLegend() {
    if (document.querySelector('.aaf-value-legend')) return;
    const el = document.createElement('div');
    el.className = 'aaf-value-legend';
    el.setAttribute('role', 'note');
    el.innerHTML = '<span class="lg-chip lg-actual">ค่าจริง</span>' +
      '<span class="lg-chip lg-target">ค่าตามเป้า</span>';
    const host = document.querySelector('header .toolbar') || document.querySelector('header');
    if (host) host.appendChild(el);
    else document.body.appendChild(el);
  }

  function tagAll() {
    const ym = (document.getElementById('monthPicker') || {}).value;
    if (!ym) return;
    document.querySelectorAll('table.preview-table, table.production-overview-grid, table.std-table, table.size-table').forEach(function (t) {
      if (t.classList.contains('preview-table') || t.classList.contains('production-overview-grid')) {
        tagTable(t, ym);
      } else {
        t.querySelectorAll('tbody tr').forEach(tagRowKind);
      }
    });
    document.querySelectorAll('.daycard').forEach(function (card) {
      const num = card.querySelector('.dayhead .num, .num');
      const d = num ? parseInt(num.textContent, 10) : NaN;
      if (!d) return;
      const date = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, d);
      if (date.getDay() === 0 || date.getDay() === 6) card.classList.add('is-weekend');
    });
    tagCards();
    tagLabeledFields();
    ensureLegend();
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
