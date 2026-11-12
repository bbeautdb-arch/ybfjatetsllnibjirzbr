/* Visual-only fail-safe add-on for the production plan grid.
   Tidies 2.5-eq and hours cells into downward rows:
   thickness label | เป้า (target) | จริง (actual).
   Does not change field IDs, formulas, planData, or save behaviour.
   If expected anchors or helpers are missing, the original markup is left as-is.
   Same loading pattern as production_plan.forecast.js — not applied unless included. */
(function () {
  'use strict';

  if (window.__AAF_GRID_CLARITY_HOOKED__) return;
  window.__AAF_GRID_CLARITY_HOOKED__ = true;

  var dash = '—';

  function ready(fn) {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn);
  }

  function hasFn(name) {
    try { return typeof window[name] === 'function' || typeof eval(name) === 'function'; }
    catch (e) { return false; }
  }

  function fmt(n) {
    if (typeof mailNumber === 'function') return mailNumber(n);
    if (typeof n !== 'number' || !Number.isFinite(n)) return dash;
    return n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }

  function skipRun(run) {
    return (run.hours == null || String(run.hours).trim() === '') &&
      (run.thickness == null || String(run.thickness).trim() === '');
  }

  function planByThickness(line, day) {
    var map = new Map();
    var runs;
    try { runs = (planData[line + '_' + day] || []); }
    catch (e) { return []; }
    for (var i = 0; i < runs.length; i++) {
      var run = runs[i];
      if (skipRun(run)) continue;
      var hours = Number(run.hours);
      var thickness = Number(run.thickness);
      if ((typeof run.hours === 'number' || (typeof run.hours === 'string' && run.hours.trim() !== '')) && hours === 0) continue;
      if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(thickness) || thickness <= 0) continue;
      var parts;
      try { parts = calcRunSizeBreakdown(line, run); }
      catch (e) { continue; }
      if (!parts || !parts.length) continue;
      var eq = 0;
      for (var p = 0; p < parts.length; p++) {
        var part = parts[p];
        eq += Number(part.count) * (Number(part.w) * Number(part.l) / (1.22 * 2.44)) * thickness / 2.5;
      }
      if (!Number.isFinite(eq) || eq < 0) continue;
      var key = String(thickness);
      var g = map.get(key) || { thickness: thickness, eq25: 0, hours: 0 };
      g.eq25 += eq;
      g.hours += hours;
      map.set(key, g);
    }
    return Array.from(map.values()).sort(function (a, b) { return a.thickness - b.thickness; });
  }

  function actualByThickness(line, day) {
    if (typeof productionMailActualRecord !== 'function') return [];
    var rec;
    try { rec = productionMailActualRecord(line, day); }
    catch (e) { return []; }
    var list = rec && Array.isArray(rec.byThickness) ? rec.byThickness : [];
    return list.map(function (t) {
      return {
        thickness: t && t.thickness != null && t.thickness !== '' ? Number(t.thickness) : null,
        eq25: t && typeof t.eq25 === 'number' ? t.eq25 : null,
        qty: t && typeof t.qty === 'number' ? t.qty : null,
        hours: t && typeof t.hours === 'number' ? t.hours : (t && typeof t.runningHours === 'number' ? t.runningHours : null)
      };
    });
  }

  function mergeThickness(planRows, actualRows) {
    var map = new Map();
    function keyOf(t) { return t == null || t === '' || (typeof t === 'number' && !Number.isFinite(t)) ? 'unknown' : String(t); }
    planRows.forEach(function (r) {
      map.set(keyOf(r.thickness), { thickness: r.thickness, planEq: r.eq25, planHours: r.hours, actualEq: null, actualHours: null });
    });
    actualRows.forEach(function (r) {
      var k = keyOf(r.thickness);
      var g = map.get(k) || { thickness: r.thickness, planEq: null, planHours: null, actualEq: null, actualHours: null };
      g.actualEq = r.eq25;
      g.actualHours = r.hours;
      map.set(k, g);
    });
    return Array.from(map.values()).sort(function (a, b) {
      var at = typeof a.thickness === 'number' && Number.isFinite(a.thickness) ? a.thickness : Infinity;
      var bt = typeof b.thickness === 'number' && Number.isFinite(b.thickness) ? b.thickness : Infinity;
      return at - bt;
    });
  }

  function lineFromRow(row) {
    var title = row && row.parentElement && row.parentElement.querySelector('th.line-title-cell, .line-title-sticky, th[colspan]');
    // Walk backward over previous rows to find the line title.
    var tr = row;
    while (tr) {
      var sticky = tr.querySelector && tr.querySelector('.line-title-sticky, th.line-title-cell');
      if (sticky) {
        var text = (sticky.textContent || '').replace(/\s+/g, ' ').trim();
        if (/^Line\s*[123]$/i.test(text) || /^L[123]$/i.test(text)) return text.replace(/^L(\d)$/i, 'Line $1');
        if (text.indexOf('Line') === 0) return text.split(' ')[0] + ' ' + text.split(' ')[1];
      }
      var th = tr.querySelector && tr.querySelector('th[colspan]');
      if (th) {
        var t = (th.textContent || '').replace(/\s+/g, ' ').trim();
        var m = t.match(/Line\s*[123]/i);
        if (m) return m[0].replace(/\s+/g, ' ').replace(/line\s*/i, 'Line ');
      }
      tr = tr.previousElementSibling;
    }
    return null;
  }

  function cellLineDay(td, row) {
    var slot = td.querySelector('[data-mail-inline-line][data-mail-inline-day]');
    if (slot && slot.dataset.mailInlineLine && slot.dataset.mailInlineDay) {
      return { line: slot.dataset.mailInlineLine, day: Number(slot.dataset.mailInlineDay) };
    }
    var line = lineFromRow(row);
    // Day from column index among this row's tds using colspan / day-start.
    var day = 0;
    var cells = Array.prototype.slice.call(row.querySelectorAll('td'));
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].classList.contains('day-start') || i === 0) day += 1;
      if (cells[i] === td) break;
    }
    if (!line || !day) return null;
    return { line: line, day: day };
  }

  function headRow() {
    var h = document.createElement('span');
    h.className = 'mail-metric-head';
    var a = document.createElement('span'); a.className = 'mail-metric-head'; a.textContent = 'เป้า';
    var b = document.createElement('span'); b.className = 'mail-metric-head'; b.textContent = 'จริง';
    return [h, a, b];
  }

  function addCells(grid, label, goalText, actualNodeOrText, extraClass) {
    var l = document.createElement('span');
    l.className = 'mail-metric-label' + (extraClass ? ' ' + extraClass : '');
    l.textContent = label;
    var g = document.createElement('span');
    g.className = 'mail-metric-goal' + (extraClass ? ' ' + extraClass : '');
    g.textContent = goalText == null || goalText === '' ? dash : goalText;
    var a;
    if (actualNodeOrText && actualNodeOrText.nodeType) {
      a = document.createElement('span');
      a.className = 'mail-metric-actual' + (extraClass ? ' ' + extraClass : '');
      a.appendChild(actualNodeOrText);
    } else {
      a = document.createElement('span');
      a.className = 'mail-metric-actual' + (extraClass ? ' ' + extraClass : '');
      a.textContent = actualNodeOrText == null || actualNodeOrText === '' ? dash : actualNodeOrText;
    }
    grid.appendChild(l); grid.appendChild(g); grid.appendChild(a);
  }

  function enhanceEq25Cell(td, line, day) {
    if (td.querySelector('.mail-metric-grid')) return;
    var pair = td.querySelector('.mail-inline-pair');
    if (!pair) return;
    var goal = pair.querySelector('.mail-inline-goal');
    var slot = pair.querySelector('[data-mail-inline-metric], [data-mail-inline-line]');
    var actualBtn = slot ? (slot.querySelector('button, .mail-inline-actual, b') || slot) : null;
    var planRows = planByThickness(line, day);
    var actualRows = actualByThickness(line, day);
    var rows = mergeThickness(planRows, actualRows);
    if (!rows.length && !goal) return;

    var grid = document.createElement('span');
    grid.className = 'mail-metric-grid';
    grid.setAttribute('data-mail-metric-enhanced', 'eq25');
    grid.setAttribute('aria-label', 'เป้าตั้ง / เดินจริงได้');
    headRow().forEach(function (n) { grid.appendChild(n); });

    var goalText = goal ? goal.textContent.trim() : dash;
    var actualNode = actualBtn ? actualBtn.cloneNode(true) : document.createTextNode(dash);
    addCells(grid, 'รวมวัน', goalText || dash, actualNode, 'mail-metric-total');

    rows.forEach(function (r) {
      var label = (r.thickness == null || (typeof r.thickness === 'number' && !Number.isFinite(r.thickness)))
        ? 'รอระบุความหนา'
        : (fmt(r.thickness) + ' มม.');
      addCells(grid, label, r.planEq == null ? dash : fmt(r.planEq), r.actualEq == null ? dash : fmt(r.actualEq));
    });

    // Keep the original pair in the DOM but unshown, so refresh hooks and
    // dialogs that look up [data-mail-inline-line] still have a living node.
    var wrap = document.createElement('span');
    wrap.className = 'mail-metric-source-wrap';
    wrap.hidden = true;
    wrap.setAttribute('aria-hidden', 'true');
    pair.setAttribute('data-mail-metric-source', 'true');
    td.insertBefore(wrap, pair);
    wrap.appendChild(pair);
    td.insertBefore(grid, wrap);
  }

  function enhanceHoursDayTotal(small) {
    if (!small || small.getAttribute('data-mail-metric-enhanced') === 'hours-total') return;
    if (small.querySelector('.mail-metric-label')) return;
    var slot = small.querySelector('[data-mail-inline-line], [data-mail-inline-metric]');
    var text = '';
    small.childNodes.forEach(function (n) {
      if (n === slot) return;
      if (n.nodeType === 3) text += n.textContent;
    });
    // "รวมวัน 17 / "
    var m = text.replace(/\s+/g, ' ').trim().match(/^รวมวัน\s+(.+?)\s*\/?\s*$/);
    if (!m) return;
    small.setAttribute('data-mail-metric-enhanced', 'hours-total');
    var label = document.createElement('span'); label.className = 'mail-metric-label'; label.textContent = 'รวมวัน';
    var goal = document.createElement('span'); goal.className = 'mail-metric-goal'; goal.textContent = m[1].trim();
    var slash = document.createElement('span'); slash.className = 'mail-inline-slash'; slash.setAttribute('aria-hidden', 'true'); slash.textContent = '/';
    Array.prototype.slice.call(small.childNodes).forEach(function (n) {
      if (n !== slot) small.removeChild(n);
    });
    small.insertBefore(slash, slot || null);
    small.insertBefore(goal, slash);
    small.insertBefore(label, goal);
  }

  function thicknessForRun(line, day, runIndex) {
    var runs;
    try { runs = planData[line + '_' + day] || []; }
    catch (e) { return null; }
    var run = runs[runIndex];
    if (!run) return null;
    var t = Number(run.thickness);
    return Number.isFinite(t) && t > 0 ? t : null;
  }

  function enhanceHoursRow(row) {
    var cells = Array.prototype.slice.call(row.querySelectorAll('td'));
    var day = 0, runInDay = -1;
    var line = lineFromRow(row);
    for (var i = 0; i < cells.length; i++) {
      var td = cells[i];
      if (td.classList.contains('day-start') || i === 0) { day += 1; runInDay = 0; }
      else runInDay += 1;
      enhanceHoursDayTotal(td.querySelector('.mail-hours-day-total'));
      if (td.querySelector('.mail-metric-run-label')) continue;
      var info = cellLineDay(td, row) || (line && day ? { line: line, day: day } : null);
      if (!info) continue;
      var thk = thicknessForRun(info.line, info.day, runInDay);
      if (thk == null) continue;
      var lab = document.createElement('span');
      lab.className = 'mail-metric-run-label';
      lab.textContent = fmt(thk) + ' มม.';
      td.insertBefore(lab, td.firstChild);
    }
  }

  function enhance() {
    try {
      if (typeof planData === 'undefined' || typeof calcRunSizeBreakdown !== 'function') return;
      document.querySelectorAll('tr[data-mail-plan-metric="eq25"] td').forEach(function (td) {
        var row = td.parentElement;
        var info = cellLineDay(td, row);
        if (!info) return;
        enhanceEq25Cell(td, info.line, info.day);
      });
      document.querySelectorAll('tr[data-mail-plan-metric="hours"]').forEach(enhanceHoursRow);
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('grid-clarity skipped', err);
    }
  }

  window.enhancePlanGridMetricRows = enhance;

  function hookRefresh() {
    try {
      if (typeof refreshProductionMailActual === 'function' && !refreshProductionMailActual.__aafGridClarity) {
        var orig = refreshProductionMailActual;
        var wrapped = function () {
          var ret = orig.apply(this, arguments);
          try { enhance(); } catch (e) {}
          return ret;
        };
        wrapped.__aafGridClarity = true;
        refreshProductionMailActual = wrapped;
      }
    } catch (e) {}
  }

  ready(function () {
    hookRefresh();
    enhance();
    var n = 0;
    var t = setInterval(function () {
      hookRefresh();
      enhance();
      n += 1;
      if (n >= 40) clearInterval(t);
    }, 250);
  });
})();
