/* Visual-only fail-safe add-on for the Line 1/2/3 plan grid (grid-modern).
   Tightens labels, badges the LINE header, tints weekend/holiday/today
   columns, mutes SD/stopped days, and marks เป้า vs จริง (met / behind)
   with an optional slim progress bar under รวมวัน.
   Does not change field IDs, formulas, planData, inputs, or save behaviour.
   If expected anchors are missing, the original markup is left as-is. */
(function () {
  'use strict';
  if (window.__AAF_GRID_MODERN_HOOKED__) return;
  window.__AAF_GRID_MODERN_HOOKED__ = true;
  var css = '.mail-inline-actual.gm-behind,.gm-behind.mail-inline-actual,.gm-behind .mail-inline-actual,.gm-behind .mail-inline-drilldown,.mail-metric-actual.gm-behind,.mail-metric-actual.gm-behind .mail-inline-drilldown,.mail-metric-actual.gm-behind b{color:#8a4a3a!important;background:#f4e6e2!important;box-shadow:inset 0 0 0 1px rgba(138,74,58,.28)!important;font-weight:700!important}'
    + '.mail-inline-actual.gm-met,.gm-met.mail-inline-actual,.gm-met .mail-inline-actual,.gm-met .mail-inline-drilldown,.mail-metric-actual.gm-met,.mail-metric-actual.gm-met .mail-inline-drilldown,.mail-metric-actual.gm-met b{color:#2f6a45!important;background:#e7f3eb!important;box-shadow:inset 0 0 0 1px rgba(47,106,69,.28)!important;font-weight:700!important}';
  var st=document.createElement('style');
  st.setAttribute('data-aaf-grid-modern','css');
  st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  var SHORT = {
    'ความหนา': 'หนา',
    'ขนาด': 'ขนาด',
    'เป้าแผ่นผลิต': 'เป้าแผ่น',
    '≈ มาตรฐาน 2.5mm': 'เทียบ 2.5',
    'P/hr เป้า': 'P/hr',
    'ชม.ผลิต': 'ชม.',
    'หมายเหตุ': 'หมายเหตุ'
  };

  function shortenKey(raw) {
    var t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (SHORT[t]) return SHORT[t];
    if (t.indexOf('≈ มาตรฐาน 2.5') === 0 || t.indexOf('มาตรฐาน 2.5') !== -1) return 'เทียบ 2.5';
    if (t.indexOf('เป้าแผ่น') === 0) return 'เป้าแผ่น';
    if (t.indexOf('P/hr') === 0) return 'P/hr';
    if (t.indexOf('ชม.') === 0) return 'ชม.';
    if (t.indexOf('ความหนา') === 0) return 'หนา';
    if (t.indexOf('หมายเหตุ') === 0) return 'หมายเหตุ';
    if (t.indexOf('ขนาด') === 0) return 'ขนาด';
    return null;
  }

  function parseNum(text) {
    if (text == null) return null;
    var s = String(text).replace(/\s+/g, ' ').trim();
    if (!s || s === '—' || s === '-' || s === '–') return null;
    var cleaned = s.replace(/,/g, '').replace(/[^\d.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    var n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function enhanceLineBadges() {
    document.querySelectorAll('table.production-overview-grid tr.line-sep.l1 th, table.production-overview-grid tr.line-sep.l2 th, table.production-overview-grid tr.line-sep.l3 th').forEach(function (th) {
      if (th.querySelector('.line-badge, .line-title-sticky')) return;
      var text = (th.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^Line\s*[123]$/i.test(text)) return;
      var badge = document.createElement('span');
      badge.className = 'line-badge line-title-sticky';
      var dot = document.createElement('i');
      dot.className = 'line-badge-dot';
      dot.setAttribute('aria-hidden', 'true');
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode(text));
      th.textContent = '';
      th.classList.add('line-title-cell');
      th.appendChild(badge);
    });
  }

  function enhanceRowLabels() {
    document.querySelectorAll('table.production-overview-grid tbody th:not([colspan])').forEach(function (th) {
      if (th.classList.contains('rowlabel-corner')) return;
      if (th.querySelector('.gm-row-label')) return;
      var legend = th.querySelector('.mail-inline-legend, small');
      var rawParts = [];
      th.childNodes.forEach(function (n) {
        if (n === legend) return;
        if (n.nodeType === 3) rawParts.push(n.textContent);
        else if (n.nodeType === 1 && !n.classList.contains('mail-inline-legend')) rawParts.push(n.textContent);
      });
      var raw = rawParts.join(' ').replace(/\s+/g, ' ').trim();
      var short = shortenKey(raw);
      if (!short) return;
      var label = document.createElement('span');
      label.className = 'gm-row-label';
      label.textContent = short;
      label.title = raw;
      // Keep the original text in a visually hidden node for accessibility.
      var sr = document.createElement('span');
      sr.className = 'gm-row-label-full';
      sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
      sr.textContent = raw;
      var keep = [];
      th.childNodes.forEach(function (n) { if (n === legend) keep.push(n); });
      th.textContent = '';
      th.appendChild(label);
      th.appendChild(sr);
      keep.forEach(function (n) { th.appendChild(n); });
    });
  }

  function headDayMeta(table) {
    var out = [];
    table.querySelectorAll('thead th').forEach(function (th, i) {
      if (i === 0 || th.classList.contains('rowlabel-corner')) return;
      out.push({
        weekend: !!th.querySelector('.production-calendar-weekend'),
        holiday: !!th.querySelector('.production-calendar-red-day'),
        today: th.classList.contains('today-col-header')
      });
    });
    return out;
  }

  function enhanceColumns() {
    var table = document.querySelector('table.production-overview-grid');
    if (!table) return;
    var meta = headDayMeta(table);
    table.querySelectorAll('thead th').forEach(function (th, i) {
      if (i === 0 || th.classList.contains('rowlabel-corner')) return;
      var m = meta[i - 1] || meta[0];
      // thead th index among day headers:
    });
    var dayHeads = [];
    table.querySelectorAll('thead th').forEach(function (th, i) {
      if (i === 0 || th.classList.contains('rowlabel-corner')) return;
      dayHeads.push(th);
    });
    dayHeads.forEach(function (th, i) {
      var m = meta[i];
      if (!m) return;
      if (m.weekend) th.classList.add('gm-weekend');
      if (m.holiday) th.classList.add('gm-holiday');
      if (m.today) th.classList.add('gm-today');
    });
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      if (tr.classList.contains('line-sep')) return;
      var day = 0;
      Array.prototype.forEach.call(tr.children, function (cell, i) {
        if (i === 0 && cell.tagName === 'TH' && !cell.getAttribute('colspan')) return;
        if (cell.classList.contains('day-start') || day === 0) day += 1;
        var m = meta[day - 1];
        if (!m) return;
        if (m.weekend) cell.classList.add('gm-weekend');
        if (m.holiday) cell.classList.add('gm-holiday');
        if (m.today) cell.classList.add('gm-today');
      });
    });
  }

  function noteIsStopped(cell) {
    var input = cell && cell.querySelector && cell.querySelector('input.pv-note, textarea.pv-note');
    var text = input ? input.value : (cell ? cell.textContent : '');
    return /SD|หยุด|ยืนเครื่อง|shutdown/i.test(String(text || ''));
  }

  function enhanceStopped() {
    var table = document.querySelector('table.production-overview-grid');
    if (!table) return;
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    var i = 0;
    while (i < rows.length) {
      var tr = rows[i];
      if (!tr.classList.contains('line-sep') || !/l[123]/.test(tr.className)) { i += 1; continue; }
      var section = [];
      var noteRow = null;
      var j = i + 1;
      while (j < rows.length && !rows[j].classList.contains('line-sep')) {
        section.push(rows[j]);
        var lab = rows[j].querySelector('th');
        var labText = lab ? (lab.getAttribute('title') || lab.textContent || '') : '';
        if (/หมายเหตุ/.test(labText)) noteRow = rows[j];
        j += 1;
      }
      var stoppedDays = {};
      if (noteRow) {
        var day = 0;
        Array.prototype.forEach.call(noteRow.children, function (cell, k) {
          if (k === 0 && cell.tagName === 'TH' && !cell.getAttribute('colspan')) return;
          if (cell.classList.contains('day-start') || day === 0) day += 1;
          if (noteIsStopped(cell)) stoppedDays[day] = true;
        });
      }
      section.forEach(function (row) {
        var day = 0;
        Array.prototype.forEach.call(row.children, function (cell, k) {
          if (k === 0 && cell.tagName === 'TH' && !cell.getAttribute('colspan')) return;
          if (cell.classList.contains('day-start') || day === 0) day += 1;
          if (stoppedDays[day]) cell.classList.add('gm-stopped');
        });
      });
      i = j;
    }
  }

  function markPair(goalEl, actualEl, host) {
    if (!goalEl || !actualEl) return null;
    var goal = parseNum(goalEl.textContent);
    var actual = parseNum(actualEl.textContent);
    if (goal == null || actual == null) return null;
    var cls = actual + 1e-9 >= goal ? 'gm-met' : 'gm-behind';
    actualEl.classList.add(cls);
    if (host) host.classList.add(cls);
    var drill = actualEl.querySelector && actualEl.querySelector('.mail-inline-drilldown, b, button');
    if (drill) drill.classList.add(cls);
    return { goal: goal, actual: actual, cls: cls, ratio: goal > 0 ? Math.max(0, Math.min(1, actual / goal)) : null };
  }

  function enhanceMetrics() {
    document.querySelectorAll('.mail-metric-grid').forEach(function (grid) {
      var totals = grid.querySelectorAll('.mail-metric-total');
      var goalEl = null, actualEl = null;
      totals.forEach(function (el) {
        if (el.classList.contains('mail-metric-goal')) goalEl = el;
        if (el.classList.contains('mail-metric-actual')) actualEl = el;
      });
      var res = markPair(goalEl, actualEl, grid.querySelector('.mail-metric-actual, .mail-metric-total.mail-metric-actual'));
      // Per-thickness rows (skip header + total)
      var cells = Array.prototype.slice.call(grid.children);
      for (var i = 0; i + 2 < cells.length; i += 3) {
        if (cells[i].classList.contains('mail-metric-head')) continue;
        if (cells[i].classList.contains('mail-metric-total')) continue;
        markPair(cells[i + 1], cells[i + 2], cells[i + 2]);
      }
      if (res && res.ratio != null && !grid.querySelector('.gm-progress')) {
        var bar = document.createElement('span');
        bar.className = 'gm-progress ' + (res.cls === 'gm-behind' ? 'is-behind' : 'is-met');
        bar.setAttribute('aria-hidden', 'true');
        var fill = document.createElement('i');
        fill.style.width = Math.round(res.ratio * 1000) / 10 + '%';
        bar.appendChild(fill);
        grid.appendChild(bar);
      }
    });
    document.querySelectorAll('.mail-inline-pair:not([hidden]):not([data-mail-metric-source])').forEach(function (pair) {
      if (pair.closest && pair.closest('.mail-metric-source-wrap')) return;
      markPair(pair.querySelector('.mail-inline-goal'), pair.querySelector('.mail-inline-actual, [data-mail-inline-metric]'), pair);
    });
  }

  function enhance() {
    try {
      enhanceLineBadges();
      enhanceRowLabels();
      enhanceColumns();
      enhanceStopped();
      enhanceMetrics();
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('grid-modern skipped', err);
    }
  }

  window.enhancePlanGridModern = enhance;

  function hook() {
    try {
      if (typeof refreshProductionMailActual === 'function' && !refreshProductionMailActual.__aafGridModern) {
        var orig = refreshProductionMailActual;
        var wrapped = function () {
          var ret = orig.apply(this, arguments);
          try { enhance(); } catch (e) {}
          return ret;
        };
        wrapped.__aafGridModern = true;
        refreshProductionMailActual = wrapped;
      }
    } catch (e) {}
  }

  function boot() {
    hook();
    // Run after grid-clarity if it is present, so เป้า|จริง rows exist first.
    if (typeof enhancePlanGridMetricRows === 'function') {
      try { enhancePlanGridMetricRows(); } catch (e) {}
    }
    enhance();
    var n = 0;
    var t = setInterval(function () {
      hook();
      enhance();
      n += 1;
      if (n >= 40) clearInterval(t);
    }, 250);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
