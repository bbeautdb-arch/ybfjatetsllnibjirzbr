/* Visual-only fail-safe add-on for the Line 1/2/3 plan grid (grid-modern).
   Tightens labels, badges the LINE header, tints weekend/holiday/today
   columns, mutes SD/stopped days, and marks เป้า vs จริง (met / behind)
   with an optional slim progress bar under รวมวัน.
   v2: per-thickness stacked sub-cells (hours, 2.5-eq, P/hr), lane tags in the
   day header, clearer row labels, and a MutationObserver so the layout is
   re-applied after any re-render (edit, add/remove lane, data refresh).
   Does not change field IDs, formulas, planData, inputs, or save behaviour.
   Inputs are only MOVED (never cloned/recreated) so their onchange handlers keep working.
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
    'ความหนา': 'ความหนา (มม.)',
    'ขนาด': 'ขนาด / โหมด',
    'เป้าแผ่นผลิต': 'เป้าแผ่นผลิต',
    '≈ มาตรฐาน 2.5mm': 'เทียบ 2.5 มม.',
    'P/hr เป้า': 'P/hr',
    'ชม.ผลิต': 'ชม.ผลิต',
    'หมายเหตุ': 'หมายเหตุ'
  };

  function shortenKey(raw) {
    var t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (SHORT[t]) return SHORT[t];
    if (t.indexOf('≈ มาตรฐาน 2.5') === 0 || t.indexOf('มาตรฐาน 2.5') !== -1) return 'เทียบ 2.5 มม.';
    if (t.indexOf('เป้าแผ่น') === 0) return 'เป้าแผ่นผลิต';
    if (t.indexOf('P/hr') === 0) return 'P/hr';
    if (t.indexOf('ชม.') === 0) return 'ชม.ผลิต';
    if (t.indexOf('ความหนา') === 0) return 'ความหนา (มม.)';
    if (t.indexOf('หมายเหตุ') === 0) return 'หมายเหตุ';
    if (t.indexOf('ขนาด') === 0) return 'ขนาด / โหมด';
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


  /* ---------- v2: stacked per-thickness sub-cells + lane tags ---------- */
  function txt(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function div(cls) { var d = document.createElement('div'); d.className = cls; return d; }
  function span(cls, text) { var e = document.createElement('span'); e.className = cls; if (text != null) e.textContent = text; return e; }

  function enhanceLaneTags() {
    document.querySelectorAll('table.production-overview-grid thead th[colspan]').forEach(function (th) {
      var n = Number(th.getAttribute('colspan')) || 1;
      var tag = th.querySelector('.gm2-lanes');
      if (n < 2) { if (tag) tag.remove(); return; }
      var label = n + ' ความหนา';
      if (tag) { if (tag.textContent !== label) tag.textContent = label; return; }
      tag = span('gm2-lanes', label);
      tag.title = 'วันนี้มี ' + n + ' ช่องความหนา/รอบ';
      var ctl = th.querySelector('.day-ctl');
      th.insertBefore(tag, ctl || null);
    });
  }

  function enhanceMetricGridModes() {
    document.querySelectorAll('.mail-metric-grid').forEach(function (grid) {
      var rows = grid.querySelectorAll('.mail-metric-label:not(.mail-metric-total)').length;
      var td = grid.closest ? grid.closest('td') : null;
      var span1 = !td || (Number(td.getAttribute('colspan')) || 1) === 1;
      grid.classList.toggle('gm2-solo', rows <= 1);
      grid.classList.toggle('gm2-single', rows <= 1 && span1);
    });
  }

  function splitPresses() {
    document.querySelectorAll('small.mail-inline-presses').forEach(function (s) {
      if (s.querySelector('.gm2-pl')) return;
      var t = txt(s);
      var parts = t.split(' · ');
      if (parts.length < 2) return;
      s.textContent = '';
      s.appendChild(span('gm2-pl', parts[0]));
      s.appendChild(span('gm2-pv', parts.slice(1).join(' · ')));
    });
  }

  function labelPairs() {
    document.querySelectorAll('table.production-overview-grid tr[data-mail-plan-metric="qty"] > td, table.production-overview-grid tr[data-mail-plan-metric="phr"] > td').forEach(function (td) {
      var multi = (Number(td.getAttribute('colspan')) || 1) > 1;
      td.querySelectorAll('.mail-inline-pair').forEach(function (pair) {
        var has = pair.querySelector(':scope > .gm2-tl');
        if (multi && !has) { var l = span('gm2-tl', 'รวมวัน'); pair.insertBefore(l, pair.firstChild); }
        else if (!multi && has) has.remove();
      });
    });
  }

  function dayGroups(row) {
    var groups = [], cur = null;
    Array.prototype.forEach.call(row.children, function (c) {
      if (c.tagName !== 'TD') return;
      if (!cur || c.classList.contains('day-start')) { cur = []; groups.push(cur); }
      cur.push(c);
    });
    return groups;
  }

  function actualHoursByThickness(line, day) {
    // Display only: sums the reported running hours already present in the mail-actual record.
    try {
      if (typeof productionMailActualRecord !== 'function') return null;
      var rec = productionMailActualRecord(line, day);
      if (!rec || !Array.isArray(rec.runs) || !rec.runs.length) return null;
      var map = {};
      var ok = false;
      rec.runs.forEach(function (r) {
        var t = r && r.thickness != null ? Number(r.thickness) : NaN;
        var h = r && typeof r.runningHours === 'number' ? r.runningHours : null;
        if (!Number.isFinite(t) || h == null) return;
        map[String(t)] = (map[String(t)] || 0) + h;
        ok = true;
      });
      return ok ? map : null;
    } catch (e) { return null; }
  }

  function fmt2(n) {
    if (typeof mailNumber === 'function') return mailNumber(n);
    return Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }

  function buildHoursStack(group) {
    var first = group[0];
    if (!first || first.getAttribute('data-gm2-hours')) return;
    var lanes = group.map(function (td) {
      return {
        td: td,
        label: td.querySelector('.mail-metric-run-label'),
        input: td.querySelector('input.pv-hr'),
        slot: td.querySelector('[data-mail-inline-metric="hours"]'),
        total: td.querySelector('.mail-hours-day-total')
      };
    });
    if (!lanes.some(function (l) { return l.input; })) return;
    var multi = group.length > 1;
    var slot = null, totalEl = null;
    lanes.forEach(function (l) { if (l.slot && !slot) slot = l.slot; if (l.total && !totalEl) totalEl = l.total; });
    var line = slot && slot.dataset ? slot.dataset.mailInlineLine : null;
    var day = slot && slot.dataset ? Number(slot.dataset.mailInlineDay) : NaN;
    var byT = (line && Number.isFinite(day)) ? actualHoursByThickness(line, day) : null;

    // total goal text (plan hours for the whole day)
    var goalText = '';
    if (totalEl) {
      var g = totalEl.querySelector('.mail-metric-goal');
      if (g) goalText = txt(g);
      else {
        var raw = '';
        totalEl.childNodes.forEach(function (n) { if (n.nodeType === 3) raw += n.textContent; });
        var m = raw.replace(/\s+/g, ' ').trim().match(/^รวมวัน\s+(.+?)\s*\/?\s*$/);
        if (m) goalText = m[1].trim();
      }
    }
    if (!goalText && multi) {
      var sum = 0, any = false;
      lanes.forEach(function (l) { if (l.input && l.input.value !== '' && Number.isFinite(Number(l.input.value))) { sum += Number(l.input.value); any = true; } });
      goalText = any ? String(Math.round(sum * 100) / 100) : '—';
    }

    var stack = div('gm2-hrs' + (multi ? '' : ' gm2-single'));
    if (multi) {
      var hh = div('gm2-hr gm2-hh');
      hh.appendChild(span('')); hh.appendChild(span('', 'เป้า'));  hh.appendChild(span('', 'จริง'));
      stack.appendChild(hh);
    }
    var seen = {};
    lanes.forEach(function (l, i) {
      var row = div('gm2-hr');
      var lab = l.label || span('mail-metric-run-label gm2-empty', '—');
      lab.classList.add('gm2-hl');
      row.appendChild(lab);
      var p = span('gm2-hp');
      if (l.input) p.appendChild(l.input);
      row.appendChild(p);
      var a = span('gm2-ha');
      if (!multi) {
        if (slot) a.appendChild(slot); else { a.textContent = '—'; a.classList.add('gm2-empty'); }
      } else {
        var key = l.label ? String(parseFloat(txt(l.label))) : null;
        var val = (byT && key && key !== 'NaN' && !seen[key] && byT[key] != null) ? byT[key] : null;
        if (key) seen[key] = true;
        if (val != null) { a.textContent = fmt2(val); a.title = 'ชั่วโมงเดินจริงของความหนานี้ (รวมจากรายงานรายชั่วโมง)'; }
        else { a.textContent = '—'; a.classList.add('gm2-empty'); }
      }
      row.appendChild(a);
      stack.appendChild(row);
    });
    if (multi) {
      var tr = div('gm2-hr gm2-htot');
      tr.appendChild(span('gm2-hl', 'รวมวัน'));
      tr.appendChild(span('gm2-hp', goalText || '—'));
      var ta = span('gm2-ha');
      if (slot) ta.appendChild(slot); else { ta.textContent = '—'; ta.classList.add('gm2-empty'); }
      tr.appendChild(ta);
      stack.appendChild(tr);
    }
    // swap content: inputs/labels/slot were moved; drop the leftovers
    var span2 = 0;
    group.forEach(function (td) { span2 += Number(td.getAttribute('colspan')) || 1; });
    first.textContent = '';
    first.appendChild(stack);
    first.setAttribute('data-gm2-hours', '1');
    if (multi) {
      first.setAttribute('colspan', String(span2));
      first.classList.add('day-end');
      for (var k = 1; k < group.length; k++) if (group[k].parentNode) group[k].parentNode.removeChild(group[k]);
    }
  }

  function enhanceHoursStacks() {
    document.querySelectorAll('table.production-overview-grid tr[data-mail-plan-metric="hours"]').forEach(function (row) {
      dayGroups(row).forEach(function (g, di) { try { if (g.length > 1) buildHoursCols(g, row, di); else buildHoursStack(g); } catch (e) { if (console && console.warn) console.warn('gm2 hours skipped', e); } });
    });
  }



  /* ---------- line-detail-v3: per-thickness columns for multi-lane days ----------
     Days with 2+ lanes keep the original header (no "N ความหนา" tag). The detail rows
     (ขนาด, เทียบ 2.5, P/hr, ชม.ผลิต, หมายเหตุ) share N equal sub-columns, one per lane, with a
     divider drawn through every row. A value sits in the column of its thickness; the thickness
     label text inside the cell is removed (the ความหนา row on top is the column header).
     Display only: nodes are moved, never cloned; inputs/handlers/ids are untouched. */
  function removeLaneTags() {
    document.querySelectorAll('table.production-overview-grid .gm2-lanes').forEach(function (e) { e.remove(); });
  }
  function gm3n(t) { var n = parseFloat(String(t == null ? '' : t).replace(/,/g, '')); return isFinite(n) ? n : NaN; }
  function gm3cols(n) { var d = div('gm3-cols'); d.style.setProperty('--n', String(n)); return d; }
  function gm3mark(td, n) { td.classList.add('gm3-cell'); td.style.setProperty('--n', String(n)); td.setAttribute('data-gm3', '1'); }
  function gm3assign(keys, thk) {
    // keys: array of numeric keys (NaN allowed) -> lane index (first unassigned lane with equal thickness) or -1
    var used = {};
    return keys.map(function (k) {
      if (!isFinite(k)) return -1;
      for (var i = 0; i < thk.length; i++) if (!used[i] && thk[i] === k) { used[i] = true; return i; }
      return -1;
    });
  }
  function gm3laneCells(row, di, n) {
    var g = dayGroups(row)[di];
    if (!g || g.length !== n) return;
    g.forEach(function (td, i) {
      td.classList.add('gm3-lane');
      td.classList.toggle('gm3-notlast', i < n - 1);
      td.style.setProperty('--n', String(n));
    });
  }
  function gm3sync(td, ref, build) {
    // (re)build the mirrored columns each pass; the app may rewrite the source nodes in place.
    // v4: the day total stays on top, the per-thickness columns are placed UNDER it (ref = the total node).
    var old = td.querySelectorAll(':scope > .gm3-cols, :scope > .gm3-orph, :scope > .gm4-extra');
    for (var i = 0; i < old.length; i++) old[i].remove();
    var made = build(), prev = ref;
    made.forEach(function (el) { prev.after(el); prev = el; });
  }
  /* ---------- line-detail-v4 helpers (read-only use of existing page functions) ---------- */
  function gm4num(v) {
    if (v == null || !isFinite(v)) return null;
    try { if (typeof mailNumber === 'function') return mailNumber(v); } catch (e) { /* fall through */ }
    return Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }
  function gm4ctx(td) {
    var s = td.querySelector('[data-mail-inline-line][data-mail-inline-day]');
    if (!s || !s.dataset) return null;
    var day = Number(s.dataset.mailInlineDay);
    return s.dataset.mailInlineLine && isFinite(day) ? { line: s.dataset.mailInlineLine, day: day } : null;
  }
  function gm4pair(plan, act, ptitle, atitle) {
    var d = div('gm3-sub gm4-pair');
    var a = span('gm4-p' + (plan == null ? ' gm3-empty' : ''), plan == null ? '—' : plan);
    var b = span('gm4-a' + (act == null ? ' gm3-empty' : ''), act == null ? '—' : act);
    if (ptitle) a.title = ptitle; if (atitle) b.title = atitle;
    d.appendChild(a); d.appendChild(span('gm4-s', '/')); d.appendChild(b);
    return d;
  }
  function gm4cell(text, cls, title) {
    var d = div('gm3-sub gm4-one' + (cls ? ' ' + cls : '')); d.textContent = text;
    if (title) d.title = title; return d;
  }
  // plan sheets of lane i = sum of the page's own size breakdown (same function as the small count under the size)
  function gm4planSheets(ctx, laneIdx) {
    try {
      var runs = (typeof planData !== 'undefined' && planData[ctx.line + '_' + ctx.day]) || [];
      var run = runs[laneIdx];
      if (!run || typeof calcRunSizeBreakdown !== 'function') return null;
      var br = calcRunSizeBreakdown(ctx.line, run);
      var parts = br && (br.parts || br);
      if (!Array.isArray(parts) || !parts.length) return null;
      var t = 0, ok = false;
      parts.forEach(function (x) { if (x && isFinite(x.count)) { t += x.count; ok = true; } });
      return ok ? t : null;
    } catch (e) { return null; }
  }
  function gm4planStd(ctx, laneIdx) {
    try {
      var runs = (typeof planData !== 'undefined' && planData[ctx.line + '_' + ctx.day]) || [];
      var run = runs[laneIdx];
      if (!run || typeof calcRun !== 'function') return null;
      var c = calcRun(ctx.line, run);
      return c && isFinite(c.stdphr) && c.stdphr > 0 ? c.stdphr : null;
    } catch (e) { return null; }
  }
  function gm4actualByThk(ctx) {
    var out = { qty: {}, ok: false };
    try {
      var rec = typeof productionMailActualRecord === 'function' ? productionMailActualRecord(ctx.line, ctx.day) : null;
      if (rec && Array.isArray(rec.byThickness)) rec.byThickness.forEach(function (x) {
        var t = x && x.thickness != null ? Number(x.thickness) : NaN;
        if (isFinite(t) && isFinite(x.qty)) { out.qty[String(t)] = x.qty; out.ok = true; }
      });
    } catch (e) { /* none */ }
    return out;
  }
  function gm4press(ctx) {
    var m = {};
    try {
      if (typeof productionActualPressGroups === 'function') productionActualPressGroups(ctx.line, ctx.day).forEach(function (g) {
        if (g.thickness != null && isFinite(g.presses)) m[String(Number(g.thickness))] = g.presses;
      });
    } catch (e) { /* none */ }
    return m;
  }
  function gm4qty(td, n, thk, ctx) {
    var pair = td.querySelector('.mail-inline-pair');
    if (!pair || !ctx) return;
    var tl = pair.querySelector('.gm2-tl'); if (tl) tl.textContent = 'รวม';
    var act = gm4actualByThk(ctx), used = {};
    gm3sync(td, pair, function () {
      var cols = gm3cols(n), cnt = gm3cols(n);
      thk.forEach(function (t, i) {
        var plan = gm4planSheets(ctx, i), key = String(t), a = null;
        if (isFinite(t) && !used[key] && act.qty[key] != null) a = act.qty[key];
        if (isFinite(t)) used[key] = true;
        cols.appendChild(gm4pair(plan == null ? null : gm4num(plan), a == null ? null : gm4num(a),
          'แผ่นตามแผนของความหนานี้ (ผลรวมจากแยกขนาดของแผน)', 'แผ่นที่ผลิตจริงของความหนานี้ (ตามรายงาน)'));
      });
      return [cols];
    });
    gm3mark(td, n);
  }
  function gm4variance(ctx, n) {
    var box = div('gm4-extra gm4-var');
    var v = null, plan = null, title = '';
    try {
      v = typeof productionActualVariance === 'function' ? productionActualVariance(ctx.line, ctx.day) : null;
      plan = typeof productionActualLinePlan === 'function' ? productionActualLinePlan(ctx.line, ctx.day) : null;
      if (v == null) {
        var r = typeof productionMailActualRecord === 'function' ? productionMailActualRecord(ctx.line, ctx.day) : null;
        title = r && r.status === 'partial' ? 'รายงานยังไม่ครบ · ไม่เทียบเต็มวัน' : (r && typeof productionActualComplete === 'function' && productionActualComplete(r)) ? 'แผนยังไม่ครบ' : 'รอผลจริงครบวัน';
      }
    } catch (e) { v = null; }
    var cap = span('gm4-cap', 'จริง − แผน');
    var cells = div('gm4-var-cells');
    if (v == null) {
      var d = gm4cell('—', 'gm3-empty', title || 'ยังไม่มีค่าเทียบ'); d.style.gridColumn = '1 / -1';
      cells.appendChild(d);
    } else {
      var neg = v < 0, zero = Math.abs(v) < 0.005;
      var c1 = gm4cell((v > 0 ? '+' : '') + gm4num(v), neg ? 'actual-negative gm4-neg' : 'actual-positive gm4-pos', 'ผลจริง (เทียบ 2.5) − แผนเต็มของ Line');
      var c2 = gm4cell(zero ? 'ตามเป้า' : neg ? 'ตกเป้า' : 'เกินเป้า', 'gm4-status ' + (neg ? 'gm4-neg' : 'gm4-pos'), 'สถานะจากเครื่องหมายของค่าเทียบ');
      var pct = (plan && plan > 0) ? Math.abs(v) / plan * 100 : null;
      var c3 = gm4cell(pct == null ? '—' : pct.toFixed(2) + '%', 'gm4-pct ' + (neg ? 'gm4-neg' : 'gm4-pos'), 'ส่วนต่าง ÷ แผนเต็มของ Line');
      cells.appendChild(c1); cells.appendChild(c2); cells.appendChild(c3);
    }
    box.appendChild(cap); box.appendChild(cells);
    return box;
  }
  function gm3eq25(td, n, thk, ctx) {
    var grid = td.querySelector('.mail-metric-grid');
    if (!grid) return;
    var kids = Array.prototype.slice.call(grid.children), rows = [], i = 0;
    while (i < kids.length) {
      var c = kids[i];
      if (c.classList.contains('mail-metric-head') || c.classList.contains('mail-metric-total') || !c.classList.contains('mail-metric-label')) { i++; continue; }
      if (i + 2 < kids.length) rows.push({ label: c, goal: kids[i + 1], actual: kids[i + 2] });
      i += 3;
    }
    grid.classList.add('gm3-total');
    gm3sync(td, grid, function () {
      var out = [];
      if (!rows.length) return out;
      var map = gm3assign(rows.map(function (r) { return gm3n(txt(r.label)); }), thk);
      var cols = gm3cols(n), subs = [], orph = null;
      for (var k = 0; k < n; k++) { var sub = div('gm3-sub'); subs.push(sub); cols.appendChild(sub); }
      rows.forEach(function (r, ri) {
        var g = r.goal.cloneNode(true), a = r.actual.cloneNode(true);
        if (map[ri] >= 0) { subs[map[ri]].appendChild(g); subs[map[ri]].appendChild(a); }
        else {
          if (!orph) orph = div('gm3-orph');
          var o = div('gm3-orph-row'); o.appendChild(span('gm3-ol', txt(r.label))); o.appendChild(g); o.appendChild(a); orph.appendChild(o);
        }
      });
      out.push(cols); if (orph) out.push(orph);
      if (ctx) out.push(gm4variance(ctx, n));
      return out;
    });
    gm3mark(td, n);
  }
  function gm3phr(td, n, thk, ctx) {
    var pair = td.querySelector('.mail-inline-pair');
    if (!pair) return;
    var smalls = Array.prototype.slice.call(td.querySelectorAll('small.mail-inline-presses')).filter(function (s) { return !s.closest('.gm3-cols, .gm3-orph'); });
    var press = ctx ? gm4press(ctx) : {};
    var hrs = ctx ? actualHoursByThickness(ctx.line, ctx.day) : null;
    gm3sync(td, pair, function () {
      var out = [];
      // row 1: P/hr plan (page's STD table via calcRun) / actual (เพรส ÷ ชม.จริง of that thickness)
      var r1 = gm3cols(n), used = {};
      thk.forEach(function (t, i) {
        var key = String(t), plan = ctx ? gm4planStd(ctx, i) : null, act = null;
        if (isFinite(t) && !used[key] && press[key] != null && hrs && hrs[key] > 0) act = press[key] / hrs[key];
        if (isFinite(t)) used[key] = true;
        r1.appendChild(gm4pair(plan == null ? null : gm4num(plan), act == null ? null : gm4num(act),
          'P/hr ตามตารางมาตรฐาน (STD) ของความหนา+Line', 'เพรสรวมตามรายงาน ÷ ชั่วโมงเดินจริงของความหนานี้'));
      });
      out.push(r1);
      // row 2: เพรส per thickness (existing value from the page, copied as text)
      if (smalls.length) {
        var labels = smalls.map(function (s) { var l = s.querySelector('.gm2-pl'); return l ? txt(l) : ''; });
        var map = gm3assign(labels.map(gm3n), thk);
        var cols = gm3cols(n), subs = [], orph = null;
        for (var k = 0; k < n; k++) { var sub = div('gm3-sub gm3-sub-v'); subs.push(sub); cols.appendChild(sub); }
        smalls.forEach(function (s, si) {
          var v = s.querySelector('.gm2-pv');
          var val = v ? txt(v) : txt(s);
          if (map[si] >= 0) subs[map[si]].appendChild(span('gm2-pv', val));
          else {
            if (!orph) orph = div('gm3-orph');
            var o = div('gm3-orph-row'); o.appendChild(span('gm3-ol', labels[si])); o.appendChild(span('gm2-pv', val)); orph.appendChild(o);
          }
        });
        out.push(cols); if (orph) out.push(orph);
      }
      return out;
    });
    gm3mark(td, n);
  }
  function enhanceDetailColumns() {
    document.querySelectorAll('table.production-overview-grid').forEach(function (table) {
      var lines = {};
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        var m = /(?:^|\s)in-line-(\d)(?:\s|$)/.exec(tr.className);
        if (m) (lines[m[1]] = lines[m[1]] || []).push(tr);
      });
      Object.keys(lines).forEach(function (ln) {
        var rows = lines[ln];
        var thkRow = rows.filter(function (tr) { return tr.querySelector('td input.pv-thk'); })[0];
        if (!thkRow) return;
        var tg = dayGroups(thkRow);
        tg.forEach(function (g, di) {
          var n = g.length;
          if (n < 2) return;
          var thk = g.map(function (td) { var i = td.querySelector('input.pv-thk'); return gm3n(i ? i.value : ''); });
          var ctx = null;
          rows.forEach(function (tr) {
            if (ctx) return;
            var gg = dayGroups(tr)[di];
            if (gg) gg.forEach(function (td) { if (!ctx) ctx = gm4ctx(td); });
          });
          rows.forEach(function (tr) {
            try {
              var metric = tr.getAttribute('data-mail-plan-metric');
              if (metric === 'eq25' || metric === 'phr' || metric === 'qty') {
                var grp = dayGroups(tr)[di];
                if (!grp || grp.length !== 1) return;
                if (metric === 'eq25') gm3eq25(grp[0], n, thk, ctx); else if (metric === 'qty') gm4qty(grp[0], n, thk, ctx); else gm3phr(grp[0], n, thk, ctx);
              } else if (!metric && (tr.classList.contains('bd-row') || tr.querySelector('td input.pv-thk, td input.pv-size, td input.pv-note'))) {
                gm3laneCells(tr, di, n);
              }
            } catch (e) { if (console && console.warn) console.warn('gm3 row skipped', e); }
          });
        });
      });
    });
  }
  function buildHoursCols(group, row, di) {
    var first = group[0], n = group.length;
    if (!first || first.getAttribute('data-gm2-hours')) return;
    var inputs = group.map(function (td) { return td.querySelector('input.pv-hr'); });
    if (!inputs.some(function (x) { return x; })) return;
    var totalEl = null, slot = null;
    group.forEach(function (td) {
      if (!totalEl) totalEl = td.querySelector('.mail-hours-day-total');
    });
    slot = totalEl ? totalEl.querySelector('[data-mail-inline-metric="hours"]') : null;
    var line = slot && slot.dataset ? slot.dataset.mailInlineLine : null;
    var day = slot && slot.dataset ? Number(slot.dataset.mailInlineDay) : NaN;
    var byT = (line && Number.isFinite(day)) ? actualHoursByThickness(line, day) : null;
    var thkRow = null, thkG = null;
    try {
      var m = /(?:^|\s)(in-line-\d)(?:\s|$)/.exec(row.className);
      if (m && row.parentNode) {
        thkRow = Array.prototype.filter.call(row.parentNode.children, function (tr) { return tr.classList.contains(m[1]) && tr.querySelector('td input.pv-thk'); })[0];
        thkG = thkRow ? dayGroups(thkRow)[di] : null;
      }
    } catch (e) { thkG = null; }
    var cols = gm3cols(n), seen = {};
    group.forEach(function (td, i) {
      var sub = div('gm3-sub gm3-sub-h');
      var lab = td.querySelector('.mail-metric-run-label');
      var ti = thkG && thkG.length === n ? thkG[i].querySelector('input.pv-thk') : null;
      var key = ti ? String(gm3n(ti.value)) : (lab ? String(gm3n(txt(lab))) : null);
      if (inputs[i]) { var p = span('gm3-hp'); p.appendChild(inputs[i]); sub.appendChild(p); }
      var a = span('gm3-ha');
      var val = (byT && key && key !== 'NaN' && !seen[key] && byT[key] != null) ? byT[key] : null;
      if (key) seen[key] = true;
      if (val != null) { a.textContent = fmt2(val); a.title = 'ชั่วโมงเดินจริงของความหนานี้ (รวมจากรายงานรายชั่วโมง)'; }
      else { a.textContent = '—'; a.classList.add('gm3-empty'); }
      sub.appendChild(a);
      cols.appendChild(sub);
    });
    var spanSum = 0;
    group.forEach(function (td) { spanSum += Number(td.getAttribute('colspan')) || 1; });
    first.textContent = '';
    first.appendChild(cols);
    if (totalEl) { totalEl.classList.add('gm3-day-total'); first.appendChild(totalEl); }
    first.setAttribute('data-gm2-hours', '1');
    first.setAttribute('colspan', String(spanSum));
    first.classList.add('day-end');
    gm3mark(first, n);
    for (var k = 1; k < group.length; k++) if (group[k].parentNode) group[k].parentNode.removeChild(group[k]);
  }

  /* ---- raw-material-v1: per-supplier receipt sub-rows under "ไม้ยูคาลิปตัส รับเข้า" ----
     Display only. Reads the page's EXISTING runtime variable productionMaterialsReference
     (the read-only Excel evidence the backend already serves to admin/purchase roles). Supplier
     names come from that runtime payload only; nothing is hardcoded here. Never touches planData,
     materialData, procurementActual, supplierEntries, inputs, or any save path, and the numbers are
     NOT added into the รับเข้า row, stock, or accounting. If the payload is missing, the rows are
     simply not drawn. */
  var rmOpen = true;
  function rmData() {
    try {
      if (typeof productionMaterialsReference === 'undefined') return null;
      var p = productionMaterialsReference;
      if (!p || !p.available || !Array.isArray(p.suppliers) || !Array.isArray(p.records)) return null;
      if (typeof currentMonth !== 'undefined' && p.month !== currentMonth) return null;
      return p;
    } catch (e) { return null; }
  }
  function rmNum(v) {
    return (typeof v === 'number' && isFinite(v)) ? v.toLocaleString('th-TH', { maximumFractionDigits: 2 }) : null;
  }
  function rmEl(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function rmClear(table) {
    var old = table.querySelectorAll('tr.rm-sup');
    for (var i = 0; i < old.length; i++) if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
  }
  function rmPair(plan, act) {
    var box = rmEl('span', 'rm-pair');
    var a = rmNum(plan), b = rmNum(act);
    box.appendChild(rmEl('span', 'rm-plan' + (a == null ? ' rm-na' : ''), a == null ? '—' : a));
    box.appendChild(rmEl('i', 'rm-div', '/'));
    box.appendChild(rmEl('span', 'rm-act' + (b == null ? ' rm-na' : ''), b == null ? '—' : b));
    return box;
  }
  function enhanceRawMaterial() {
    var table = document.querySelector('table.production-overview-grid');
    if (!table) return;
    var parent = table.querySelector('tr[data-material-inline-row="yuca-received"]');
    var p = rmData();
    if (!parent || !p) { rmClear(table); return; }
    var tds = parent.querySelectorAll('td[data-material-inline-day]');
    if (!tds.length) { rmClear(table); return; }

    // day -> supplierId -> {plan, act}, valid records only (rows with date issues stay out)
    var sup = {}, byDay = {}, haveDay = {}, minD = 99, maxD = 0;
    var yuca = p.suppliers.filter(function (s) { return s.category === 'yuca'; });
    p.records.forEach(function (r) {
      if (r.category !== 'yuca' || (r.issues && r.issues.length) || typeof r.date !== 'string') return;
      var day = Number(r.date.slice(8, 10));
      if (!day || r.date.slice(0, 7) !== p.month) return;
      var hasPlan = typeof r.plannedTons === 'number', hasAct = typeof r.actualTons === 'number';
      if (!hasPlan && !hasAct) return;
      (byDay[day] = byDay[day] || {})[r.supplierId] = { plan: hasPlan ? r.plannedTons : null, act: hasAct ? r.actualTons : null };
      sup[r.supplierId] = true; haveDay[day] = true;
      if (day < minD) minD = day; if (day > maxD) maxD = day;
    });
    var list = yuca.filter(function (s) { return sup[s.id]; })
      .sort(function (a, b) { return (a.sourceRow || 0) - (b.sourceRow || 0); });
    if (!list.length) { rmClear(table); return; }

    var dupDay = {}, otherIssues = [], issueCount = 0;
    (p.issues || []).forEach(function (i) {
      if (i.category !== 'yuca') return;
      issueCount += 1;
      if (i.code === 'duplicate-date' && i.date) dupDay[Number(String(i.date).slice(8, 10))] = i.message || 'วันที่ซ้ำในไฟล์';
      else otherIssues.push((i.cell || '') + ' ' + (i.message || ''));
    });

    var sig = [p.month, list.length, p.records.length, tds.length, rmOpen ? 1 : 0].join('|');
    var next = parent.nextElementSibling;
    if (next && next.classList.contains('rm-sup-head') && next.getAttribute('data-rm-sig') === sig) return;
    rmClear(table);

    var frag = document.createDocumentFragment();
    var head = rmEl('tr', 'rm-sup rm-sup-head');
    head.setAttribute('data-rm-sig', sig);
    var hth = rmEl('th', 'rm-sup-th');
    hth.setAttribute('scope', 'row');
    var btn = rmEl('button', 'rm-toggle', (rmOpen ? '▾ ' : '▸ ') + 'ผู้ส่ง ' + list.length + ' ราย');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', rmOpen ? 'true' : 'false');
    btn.title = 'แยกตามผู้ส่งจากไฟล์ Excel (อ้างอิง ไม่รวมเข้ายอดรับเข้า)';
    hth.appendChild(btn);
    hth.appendChild(rmEl('small', null, 'ตามไฟล์ Excel'));
    head.appendChild(hth);
    var hcell = rmEl('td', 'rm-sup-note');
    var span = 0;
    for (var q = 0; q < tds.length; q++) span += Number(tds[q].getAttribute('colspan')) || 1;
    hcell.setAttribute('colspan', String(Math.max(1, span)));
    hcell.textContent = 'ข้อมูลอ้างอิงจากไฟล์ Excel (ตัน) · ยังไม่รวมเข้ายอดรับเข้าและสต๊อก' + (issueCount ? ' · ตรวจวันที่ในไฟล์ ' + issueCount + ' จุด' : '');
    if (issueCount) hcell.title = Object.keys(dupDay).map(function (d) { return 'วันที่ ' + d + ': ' + dupDay[d]; }).concat(otherIssues).join('\n');
    head.appendChild(hcell);
    frag.appendChild(head);

    function mk(kind) { var tr = rmEl('tr', 'rm-sup rm-sup-' + kind + (rmOpen ? '' : ' rm-hide')); return tr; }
    function cellFor(src) {
      var td = rmEl('td', 'rm-sup-td ' + (src.className || ''));
      td.setAttribute('colspan', src.getAttribute('colspan') || '1');
      td.removeAttribute('data-material-inline-day');
      return td;
    }
    var totPlan = {}, totAct = {};
    list.forEach(function (s) {
      var tr = mk('row');
      var th = rmEl('th', 'rm-sup-th', String(s.name == null ? '' : s.name).trim());
      th.setAttribute('scope', 'row');
      th.title = th.textContent;
      tr.appendChild(th);
      for (var i = 0; i < tds.length; i++) {
        var day = Number(tds[i].getAttribute('data-material-inline-day'));
        var td = cellFor(tds[i]);
        var rec = byDay[day] && byDay[day][s.id];
        if (rec) {
          td.appendChild(rmPair(rec.plan, rec.act));
          if (rec.plan != null) totPlan[day] = (totPlan[day] || 0) + rec.plan;
          if (rec.act != null) totAct[day] = (totAct[day] || 0) + rec.act;
        } else td.appendChild(rmEl('span', 'rm-empty', ''));
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    });

    var tot = mk('total');
    var tth = rmEl('th', 'rm-sup-th', 'รวมตามไฟล์');
    tth.setAttribute('scope', 'row');
    tot.appendChild(tth);
    for (var j = 0; j < tds.length; j++) {
      var d2 = Number(tds[j].getAttribute('data-material-inline-day'));
      var tc = cellFor(tds[j]);
      if (haveDay[d2]) tc.appendChild(rmPair(totPlan[d2] != null ? totPlan[d2] : null, totAct[d2] != null ? totAct[d2] : null));
      else if (dupDay[d2]) { var w = rmEl('span', 'rm-gap', 'วันที่ซ้ำในไฟล์'); w.title = dupDay[d2]; tc.appendChild(w); }
      else if (d2 > minD && d2 < maxD) tc.appendChild(rmEl('span', 'rm-gap', 'ไม่มีในไฟล์'));
      else tc.appendChild(rmEl('span', 'rm-empty', ''));
      tot.appendChild(tc);
    }
    frag.appendChild(tot);

    btn.addEventListener('click', function () {
      rmOpen = !rmOpen;
      btn.setAttribute('aria-expanded', rmOpen ? 'true' : 'false');
      btn.textContent = (rmOpen ? '▾ ' : '▸ ') + 'ผู้ส่ง ' + list.length + ' ราย';
      head.setAttribute('data-rm-sig', [p.month, list.length, p.records.length, tds.length, rmOpen ? 1 : 0].join('|'));
      var rows = table.querySelectorAll('tr.rm-sup-row, tr.rm-sup-total');
      for (var k = 0; k < rows.length; k++) rows[k].classList.toggle('rm-hide', !rmOpen);
    });
    parent.parentNode.insertBefore(frag, parent.nextSibling);
  }

  function enhanceV2() {
    try {
      removeLaneTags();
      enhanceMetricGridModes();
      splitPresses();
      labelPairs();
      enhanceDetailColumns();
      enhanceHoursStacks();
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('grid-modern v2 skipped', err);
    }
  }

  function enhance() {
    try {
      enhanceLineBadges();
      enhanceRowLabels();
      enhanceColumns();
      enhanceStopped();
      enhanceMetrics();
      enhanceV2();
      try { enhanceRawMaterial(); } catch (e2) { if (typeof console !== 'undefined' && console.warn) console.warn('raw-material skipped', e2); }
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


  /* Re-apply after any re-render of #main (edit, +/- lane, data refresh). Disconnects while
     working so our own DOM changes never retrigger it. */
  var gmObs = null, gmTimer = null;
  function gmRun() {
    try {
      if (gmObs) gmObs.disconnect();
      if (typeof enhancePlanGridMetricRows === 'function') { try { enhancePlanGridMetricRows(); } catch (e) {} }
      enhance();
    } catch (e) {}
    gmAttach();
  }
  function gmAttach() {
    try {
      var main = document.getElementById('main');
      if (!main || typeof MutationObserver === 'undefined') return;
      if (!gmObs) gmObs = new MutationObserver(function () {
        clearTimeout(gmTimer);
        gmTimer = setTimeout(gmRun, 60);
      });
      gmObs.observe(main, { childList: true, subtree: true });
    } catch (e) {}
  }

  function boot() {
    hook();
    gmAttach();
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
