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
        if (!pair.querySelector(':scope > [data-mail-inline-line]')) return;
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
  function gm3mark(td, n) { td.classList.add('gm3-cell'); td.style.setProperty('--n', String(n)); td.setAttribute('data-gm3', '1'); td.setAttribute('data-gm5-pass', String(gm5pass)); }
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
  /* ---------- v5: idempotent injection ----------
     Every node this add-on injects into a metric cell carries data-gm5. Before a cell is rebuilt ALL of them are
     removed from the cell at ANY depth (v4 only looked at direct children, so a block that had been inserted next to a
     nested node was never found again and one more copy was added on every pass). New blocks are always inserted at the
     cell's top level, right after the top-level child that holds the day total; the other original children are hidden
     with data-gm5-hide (JS) on top of the CSS rules, so a re-rendered original can never show through. */
  var GM5 = '[data-gm5], .gm3-cols, .gm3-orph, .gm4-extra';
  var gm5pass = 0;
  function gm5top(td, node) {
    while (node && node.parentNode !== td) node = node.parentNode;
    return node && node.parentNode === td ? node : null;
  }
  function gm5clean(td) {
    var old = td.querySelectorAll(GM5), i;
    for (i = 0; i < old.length; i++) if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    var h = td.querySelectorAll('[data-gm5-hide], [data-gm5-keep]');
    for (i = 0; i < h.length; i++) { h[i].removeAttribute('data-gm5-hide'); h[i].removeAttribute('data-gm5-keep'); }
  }
  function gm5hide(td, keep) {
    keep.setAttribute('data-gm5-keep', '1');
    var c, i;
    for (c = td.firstElementChild; c; c = c.nextElementSibling) {
      if (c === keep || c.hasAttribute('data-gm5') || c.classList.contains('mail-metric-source-wrap')) continue;
      c.setAttribute('data-gm5-hide', '1');
    }
    var inner = keep.querySelectorAll('.mail-inline-metric-stack > :not(.mail-inline-actual), small:not(.mail-hours-day-total)');
    for (i = 0; i < inner.length; i++) if (!inner[i].closest('.mail-inline-actual')) inner[i].setAttribute('data-gm5-hide', '1');
    if (keep.classList.contains('mail-metric-grid')) {
      for (c = keep.firstElementChild; c; c = c.nextElementSibling) if (!c.classList.contains('mail-metric-total')) c.setAttribute('data-gm5-hide', '1');
    }
    gm6hideStacks(td, keep);
  }
  /* v6: markup-agnostic fallback. A per-thickness stack line is recognised by its "2.5 มม." label leaf; the whole line (or the
     whole stack when it sits in its own wrapper) is hidden unless it holds the day-total slot or one of our own nodes. */
  var GM6_LAB = /^\s*\d+(?:[.,]\d+)?\s*มม\.?\s*$/;
  function gm6hideStacks(td, keep) {
    var all = td.querySelectorAll('*'), i, el, n, p;
    for (i = 0; i < all.length; i++) {
      el = all[i];
      if (el.children.length || !GM6_LAB.test(el.textContent || '')) continue;
      if (el.closest('[data-gm5]') || el.closest('.mail-inline-actual')) continue;
      n = el;
      while ((p = n.parentElement) && p !== td && p !== keep && !p.querySelector('[data-mail-inline-line]')) n = p;
      if (!n || n === td || n === keep || n.hasAttribute('data-gm5') || n.querySelector('[data-gm5]') || n.querySelector('[data-mail-inline-line]')) continue;
      n.setAttribute('data-gm5-hide', '1');
    }
  }
  function gm3sync(td, ref, build) {
    gm5clean(td);
    var top = gm5top(td, ref);
    if (!top) return;
    var made = build(), prev = top;
    made.forEach(function (el) { el.setAttribute('data-gm5', '1'); td.insertBefore(el, prev.nextSibling); prev = el; });
    gm5hide(td, top);
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
    var slot = td.querySelector('[data-mail-inline-line][data-mail-inline-metric]');
    var pair = (slot && gm5top(td, slot)) || td.querySelector('.mail-inline-pair');
    if (!pair || !ctx) return;
    var tl = td.querySelector('.gm2-tl'); if (tl) tl.textContent = 'รวม';
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
    if (v != null && !isFinite(v)) v = null;                       // audit fix: never print NaN/Infinity
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
    var slot = td.querySelector('[data-mail-inline-line][data-mail-inline-metric]');
    var pair = (slot && gm5top(td, slot)) || td.querySelector('.mail-inline-pair');
    if (!pair) return;
    var smalls = Array.prototype.slice.call(td.querySelectorAll('small.mail-inline-presses')).filter(function (s) { return !s.closest(GM5); });
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
    gm5pass += 1;
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
    // v5: any metric cell that was not (re)built in this pass loses stale injected blocks and the multi-lane marks
    document.querySelectorAll('table.production-overview-grid tr[data-mail-plan-metric="qty"] > td, table.production-overview-grid tr[data-mail-plan-metric="eq25"] > td, table.production-overview-grid tr[data-mail-plan-metric="phr"] > td').forEach(function (td) {
      if (td.getAttribute('data-gm5-pass') === String(gm5pass)) return;
      gm5clean(td);
      if (td.classList.contains('gm3-cell') || td.hasAttribute('data-gm3')) { td.classList.remove('gm3-cell'); td.removeAttribute('data-gm3'); td.style.removeProperty('--n'); }
      td.removeAttribute('data-gm5-pass');
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

  /* ---- supplier-rows-v2: per-supplier ledger rows under "รับเข้า" (ยูคา / เชื้อเพลิง) ----
     Source = the SUPPLIER ledger already in the page (supplierEntries[day].yuca|fuel with
     planTons/planPrice/actualTons/actualPrice). No Excel reference is read. Each day cell has
     3 number inputs: เป้า (planTons) | รับจริง (actualTons) | ราคา (planPrice or actualPrice, see svPriceField).
     Inputs only edit the in-memory ledger DRAFT and call the page's own markDirtySupplier(day);
     saving stays on the existing "บันทึกข้อมูล" button (expectedRevision/expectedRuns/PLAN_RECORD_CONFLICT
     handling is the page's). Nothing is written to MATERIAL / PURCHASE / procurementActual / stock;
     the รับเข้า row is not changed. Existing entry objects are edited in place (unknown fields kept);
     a new entry is created only when a number is typed into an empty cell. */
  var svOpen = true, svPending = { yuca: [], fuel: [] }, svMonth = null, svAddOpen = {};
  var SV_CATS = [{ cat: 'yuca', row: 'yuca-received', label: 'ไม้ยูคา' }, { cat: 'fuel', row: 'fuel-received', label: 'ไม้เชื้อเพลิง' }];
  function svEl(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svNorm(n) { return String(n == null ? '' : n).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function svNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function svFmt(v, d) { return v == null ? '' : v.toLocaleString('th-TH', { maximumFractionDigits: d == null ? 2 : d }); }
  function svPad(d) { return (d < 10 ? '0' : '') + d; }
  function svToday() { try { return typeof bangkokDate === 'function' ? bangkokDate() : ''; } catch (e) { return ''; } }
  function svCan() { try { return typeof materialsCanActual === 'function' && !!materialsCanActual(); } catch (e) { return false; } }
  function svList(day, cat) {
    try { var d = supplierEntries[day]; return d && Array.isArray(d[cat]) ? d[cat] : []; } catch (e) { return []; }
  }
  // Which ledger price field the single ราคา input edits for one supplier-day (explicit rule, shown in the title):
  //   day <= today AND the entry already has รับจริง (or is marked arrived)  -> actualPrice
  //   otherwise                                                              -> planPrice
  function svPriceField(entry, isFuture) {
    if (!isFuture && entry && (svNum(entry.actualTons) != null || entry.status === 'arrived')) return 'actualPrice';
    return 'planPrice';
  }
  function svRows(cat, nd) {
    // supplier rows = names in the ledger of this month (first-seen order) + names typed with "+" but not yet given a number
    var keys = [], seen = {}, blank = false;
    for (var d = 1; d <= nd; d++) svList(d, cat).forEach(function (e) {
      var k = svNorm(e && e.name);
      if (!k) { blank = true; return; }
      if (!seen[k]) { seen[k] = { key: k, name: String(e.name).replace(/\s+/g, ' ').trim() }; keys.push(seen[k]); }
    });
    svPending[cat].forEach(function (nm) { var k = svNorm(nm); if (k && !seen[k]) { seen[k] = { key: k, name: nm }; keys.push(seen[k]); } });
    if (blank) keys.push({ key: '', name: '(ไม่ระบุชื่อ)', blank: true });
    return keys;
  }
  function svDayStats(cat, day, isFuture) {
    var s = { plan: 0, act: 0, costPlan: 0, costAct: 0, hasPlan: false, hasAct: false, hasCostPlan: false, hasCostAct: false, missPlan: 0, missAct: 0 };
    svList(day, cat).forEach(function (e) {
      var pt = svNum(e.planTons), pp = svNum(e.planPrice), at = svNum(e.actualTons), ap = svNum(e.actualPrice);
      if (pt != null) { s.plan += pt; s.hasPlan = true; if (pp != null) { s.costPlan += pt * pp; s.hasCostPlan = true; } else if (pt > 0) s.missPlan++; }
      if (at != null) { s.act += at; s.hasAct = true; if (ap != null) { s.costAct += at * ap; s.hasCostAct = true; } else if (at > 0) s.missAct++; }
    });
    return s;
  }
  function svSig(nd) {
    var topv = []; try { SV_CATS.forEach(function (c) { for (var d0 = 1; d0 <= nd; d0++) { var tt = svTopNow(c.cat, d0); if (svSums(c.cat, d0).n) topv.push(c.cat + d0 + ':' + tt.plan + '/' + tt.act); } }); } catch (e) { /* ok */ }
    var parts = [topv.join(','), typeof currentMonth !== 'undefined' ? currentMonth : '', svOpen ? 1 : 0, svCan() ? 1 : 0, svToday()];
    try { parts.push(Array.from(dirtySupplier).sort().join(',')); } catch (e) { parts.push('?'); }
    SV_CATS.forEach(function (c) {
      var t = [];
      for (var d = 1; d <= nd; d++) { var l = svList(d, c.cat); if (l.length) t.push(d + ':' + JSON.stringify(l.map(function (e) { return [e.name, e.planTons, e.planPrice, e.actualTons, e.actualPrice, e.status]; }))); }
      parts.push(t.join(';')); parts.push(svPending[c.cat].join('|'));
    });
    return parts.join('#');
  }
  function svClear(table) {
    var old = table.querySelectorAll('tr.rm-sup, datalist.sv-dl');
    for (var i = 0; i < old.length; i++) if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
  }
  function svRowEntries(cat, day, key) {
    return svList(day, cat).filter(function (e) { return svNorm(e && e.name) === key; });
  }
  function svValid(field, raw) {
    if (raw === '' || raw == null) return { ok: true, v: null };
    var n = Number(raw);
    if (!isFinite(n) || n < 0 || n > 1e12) return { ok: false };
    return { ok: true, v: n };
  }

  /* ---- top รับเข้า row = supplier total (Dark man's order: ให้ยอดรับเข้าข้างบน คือยอดรวมข้างล่าง) ----
     REPLACE, never add: for a day that has supplier entries, the day's receipt plan (materialData[day][cat+'Received'],
     MATERIAL ledger) = Σ planTons and the day's actual receipt (procurementActual[day][cat+'ActualReceived'], the page's
     existing actual-receipt record) = Σ actualTons. Uses exactly the state + dirty marks the page's own handlers
     (updateMaterial / updateMaterialsActual) use, so it is saved by the existing บันทึกข้อมูล + PLAN_RECORD_CONFLICT path.
     A blank stays blank (no supplier actual -> nothing written, never 0). Days without supplier entries are untouched.
     Never touches stock-mail imports or bookings. SV_SYNC_ACTUAL=false turns the actual half off. */
  var SV_SYNC_ACTUAL = true, svLast = {}, svRenderTimer = null, svRenderTries = 0;
  function svR2(v) { return Math.round(v * 100) / 100; }
  function svSums(cat, day) {
    var list = svList(day, cat), o = { n: list.length, planHas: false, plan: 0, actHas: false, act: 0 };
    list.forEach(function (e) {
      var p = svNum(e && e.planTons), a = svNum(e && e.actualTons);
      if (p != null) { o.planHas = true; o.plan += p; }
      if (a != null) { o.actHas = true; o.act += a; }
    });
    o.plan = svR2(o.plan); o.act = svR2(o.act);
    return o;
  }
  function svTopNow(cat, day) {
    var m = null, a = null;
    try { m = svNum(materialData[day] && materialData[day][cat + 'Received']); } catch (e) { /* none */ }
    try { a = svNum(procurementActual[day] && procurementActual[day][cat + 'ActualReceived']); } catch (e2) { /* none */ }
    return { plan: m, act: a };
  }
  function svSyncDay(cat, day) {
    var s = svSums(cat, day);
    if (!s.n) return false;                                   // no supplier entries -> manual รับเข้า stays
    var changed = false, cur = svTopNow(cat, day), key = cat + day;
    svLast[key] = svLast[key] || {};
    var isFuture = (typeof currentMonth !== 'undefined' ? currentMonth + '-' + svPad(day) : '') > svToday();
    try {
      if (typeof IS_ADMIN !== 'undefined' && IS_ADMIN && s.planHas && (cur.plan == null || Math.abs(cur.plan - s.plan) > 0.0049)) {
        materialData[day] = materialData[day] || {};
        materialData[day][cat + 'Received'] = s.plan;         // replace (same write as updateMaterial, without the re-render)
        markDirtyMaterial(day); changed = true;
      }
      if (s.planHas) svLast[key].plan = s.plan;
      if (SV_SYNC_ACTUAL && svCan() && !isFuture) {
        if (s.actHas && (cur.act == null || Math.abs(cur.act - s.act) > 0.0049)) {
          procurementActual[day] = Object.assign({}, procurementActual[day] || {}, (function () { var o = {}; o[cat + 'ActualReceived'] = s.act; return o; })());
          markDirtyPurchase(day); changed = true;             // replace (same write as updateMaterialsActual)
        } else if (!s.actHas && cur.act != null && svLast[key].act != null && Math.abs(cur.act - svLast[key].act) < 0.0049) {
          procurementActual[day] = Object.assign({}, procurementActual[day] || {}, (function () { var o = {}; o[cat + 'ActualReceived'] = null; return o; })());
          markDirtyPurchase(day); changed = true;             // supplier actuals were cleared -> clear only what we had written
        }
        if (s.actHas) svLast[key].act = s.act; else svLast[key].act = null;
      }
    } catch (e3) { if (console && console.warn) console.warn('supplier->รับเข้า sync skipped', e3); }
    return changed;
  }
  function svTopCell(cat, day) {
    return document.querySelector('table.production-overview-grid tr[data-material-inline-row="' + cat + '-received"] td[data-material-inline-day="' + day + '"]');
  }
  function svPatchTop(cat, day) {
    var td = svTopCell(cat, day); if (!td) return;
    var cur = svTopNow(cat, day), inp = td.querySelector('input.materials-inline-input'), act = td.querySelector('span.materials-inline-actual');
    if (inp && document.activeElement !== inp) inp.value = cur.plan == null ? '' : cur.plan;
    if (act && cur.act != null) act.textContent = svFmt(cur.act);
  }
  function svLockTop(nd) {
    SV_CATS.forEach(function (c) {
      for (var d = 1; d <= nd; d++) {
        var td = svTopCell(c.cat, d); if (!td) continue;
        var managed = svSums(c.cat, d).n > 0, inp = td.querySelector('input.materials-inline-input');
        if (!inp) continue;
        inp.readOnly = managed; inp.classList.toggle('sv-locked', managed);
        if (managed) inp.title = 'ยอดนี้มาจากผลรวมผู้ส่งด้านล่าง · แก้ที่แถวผู้ส่ง'; else if (inp.title && inp.title.indexOf('ผู้ส่งด้านล่าง') >= 0) inp.removeAttribute('title');
      }
    });
  }
  function svScheduleRender() {
    // the page's own handlers re-render right away; we wait until he stops typing in the supplier rows
    clearTimeout(svRenderTimer); svRenderTries = 0;
    var tick = function () {
      var ae = document.activeElement;
      var busy = ae && ae !== document.body && ae.tagName === 'INPUT';
      if (busy && svRenderTries++ < 40) { svRenderTimer = setTimeout(tick, 1200); return; }
      if (!busy && typeof renderAll === 'function') { try { renderAll(); } catch (e) { /* page handles */ } }
    };
    svRenderTimer = setTimeout(tick, 1200);
  }
  function svMismatch(cat, day) {
    var s = svSums(cat, day); if (!s.n) return null;
    var cur = svTopNow(cat, day), isFuture = (typeof currentMonth !== 'undefined' ? currentMonth + '-' + svPad(day) : '') > svToday();
    var pm = s.planHas && (cur.plan == null || Math.abs(cur.plan - s.plan) > 0.0049);
    var am = SV_SYNC_ACTUAL && !isFuture && s.actHas && (cur.act == null || Math.abs(cur.act - s.act) > 0.0049);
    return (pm || am) ? { pm: pm, am: am, cur: cur, s: s } : null;
  }

  var svTimers = {};
  function svCommit(ctx, input, field, immediate) {
    // ctx: {cat, day, key, name, nd}
    var tkey = ctx.cat + ctx.day + '|' + ctx.key + '|' + field;
    var editMonth = typeof currentMonth !== 'undefined' ? currentMonth : '';
    clearTimeout(svTimers[tkey]);
    var run = function () {
      try {
        // audit fix: the edit belongs to the month it was typed in; if the month changed while the debounce was pending, drop it
        if ((typeof currentMonth !== 'undefined' ? currentMonth : '') !== editMonth || (typeof loadedMonth !== 'undefined' && loadedMonth !== editMonth)) return;
        if (!svCan()) { input.classList.add('sv-bad'); input.title = 'ยังบันทึกร่างไม่ได้ในขณะนี้ (รอโหลด/กำลังบันทึก)'; return; }
        var isFuture = (typeof currentMonth !== 'undefined' ? currentMonth + '-' + svPad(ctx.day) : '') > svToday();
        var target = field;
        var list = svList(ctx.day, ctx.cat);
        var matches = svRowEntries(ctx.cat, ctx.day, ctx.key);
        if (matches.length > 1) return;
        var entry = matches[0] || null;
        if (field === 'price') target = svPriceField(entry, isFuture);
        if ((target === 'actualTons' || target === 'actualPrice') && isFuture) { input.classList.add('sv-bad'); input.value = ''; return; }
        var res = svValid(target, input.value.trim());
        if (!res.ok) { input.classList.add('sv-bad'); input.title = 'กรอกตัวเลขตั้งแต่ 0 ขึ้นไป'; return; }
        input.classList.remove('sv-bad');
        if (!entry) {
          if (res.v == null) return;                      // nothing typed into an empty cell -> create nothing
          if (ctx.name.length > 300 || /[<>\u0000-\u001f]/.test(ctx.name)) { input.classList.add('sv-bad'); input.title = 'ชื่อผู้ส่งไม่ถูกต้อง'; return; }
          if (list.length >= 200) { alert('วันเดียวกันเพิ่มได้ไม่เกิน 200 รายการต่อวัตถุดิบ'); input.value = ''; return; }
          supplierEntries[ctx.day] = supplierEntries[ctx.day] || { yuca: [], fuel: [] };
          if (!Array.isArray(supplierEntries[ctx.day][ctx.cat])) supplierEntries[ctx.day][ctx.cat] = [];
          entry = { name: ctx.name, planTons: null, planPrice: null, status: 'plan', actualTons: null, actualPrice: null };
          supplierEntries[ctx.day][ctx.cat].push(entry);
        }
        if (entry[target] === res.v) { svRefresh(ctx); return; }
        entry[target] = res.v;
        // รับจริง drives the "arrived" mark (same rule the one-time migration uses); never invented from plan values
        if (target === 'actualTons') {
          if (res.v != null && entry.status !== 'arrived') entry.status = 'arrived';
          else if (res.v == null && entry.actualPrice == null && entry.status === 'arrived') entry.status = 'plan';
        }
        markDirtySupplier(ctx.day);
        var topChanged = svSyncDay(ctx.cat, ctx.day);
        svRefresh(ctx);
        svPatchTop(ctx.cat, ctx.day);
        if (topChanged) svScheduleRender();
      } catch (e) { if (console && console.warn) console.warn('supplier-rows skipped', e); }
    };
    if (immediate) run(); else svTimers[tkey] = setTimeout(run, 450);
  }
  function svRefresh(ctx) {
    // update totals + price-field hint in place (no rebuild, so focus is never lost)
    var table = document.querySelector('table.production-overview-grid');
    if (!table) return;
    var isFuture = (typeof currentMonth !== 'undefined' ? currentMonth + '-' + svPad(ctx.day) : '') > svToday();
    var cell = table.querySelector('td.sv-td[data-sv-cat="' + ctx.cat + '"][data-sv-day="' + ctx.day + '"][data-sv-key="' + ctx.key.replace(/"/g, '') + '"]');
    if (cell) {
      var entry = svRowEntries(ctx.cat, ctx.day, ctx.key)[0] || null;
      var pin = cell.querySelector('input.sv-price');
      if (pin && entry && document.activeElement !== pin) svPaintPrice(pin, entry, isFuture);
      var pt = cell.querySelector('input.sv-plan'), at = cell.querySelector('input.sv-act');
      if (entry && at && document.activeElement !== at) at.value = entry.actualTons == null ? '' : (Math.round(entry.actualTons * 1000) / 1000);
      if (entry && pt && document.activeElement !== pt) pt.value = entry.planTons == null ? '' : (Math.round(entry.planTons * 1000) / 1000);
      cell.classList.toggle('sv-dirty', true);
    }
    svPaintTotals(table, ctx.cat, ctx.day, isFuture);
    var head = table.querySelector('tr.rm-sup-head[data-sv-cat="' + ctx.cat + '"]');
    if (head) head.setAttribute('data-rm-sig', svSig(ctx.nd));
    table.querySelectorAll('tr.rm-sup-head').forEach(function (h) { h.setAttribute('data-rm-sig', svSig(ctx.nd)); });
  }
  function svPaintPrice(pin, entry, isFuture) {
    var f = svPriceField(entry, isFuture);
    var main = svNum(entry[f]), alt = svNum(entry.planPrice);
    pin.value = main == null ? '' : (Math.round(main * 1000) / 1000);
    pin.placeholder = (f === 'actualPrice' && alt != null) ? String(alt) : '—';
    pin.setAttribute('data-sv-field', f);
    pin.title = f === 'actualPrice' ? 'ราคาจริง บาท/ตัน (ช่อง actualPrice) · ใช้กับ รับจริง · ตัวเทาคือราคาเป้า' : 'ราคาเป้า บาท/ตัน (ช่อง planPrice) · เมื่อกรอก รับจริง ช่องนี้จะเป็นราคาจริง';
    pin.classList.toggle('sv-is-actual', f === 'actualPrice');
  }
  function svPaintTotals(table, cat, day, isFuture) {
    var s = svDayStats(cat, day, isFuture);
    var q = table.querySelector('td.sv-tot[data-sv-cat="' + cat + '"][data-sv-day="' + day + '"][data-sv-k="qty"]');
    var c = table.querySelector('td.sv-tot[data-sv-cat="' + cat + '"][data-sv-day="' + day + '"][data-sv-k="cost"]');
    function set(td, vals) {
      if (!td) return;
      var sp = td.querySelectorAll('.sv-tc');
      vals.forEach(function (v, i) { if (sp[i]) { sp[i].textContent = v.t; sp[i].title = v.title || ''; sp[i].classList.toggle('rm-na', !!v.na); } });
    }
    set(q, [{ t: s.hasPlan ? svFmt(s.plan) : '', na: !s.hasPlan }, { t: s.hasAct ? svFmt(s.act) : '', na: !s.hasAct }, { t: '' }]);
    var mm = svMismatch(cat, day);
    if (q) { q.classList.toggle('sv-mismatch', !!mm); q.title = mm ? 'รับเข้าด้านบน ' + (mm.cur.plan == null ? '—' : svFmt(mm.cur.plan)) + ' / ' + (mm.cur.act == null ? '—' : svFmt(mm.cur.act)) + ' ต่างจากผลรวมผู้ส่ง · กด “ปรับรับเข้าตามผู้ส่ง” ที่หัวแถว' : 'ผลรวมผู้ส่ง = ยอดรับเข้าด้านบนของวันนี้'; }
    var miss = isFuture ? s.missPlan : s.missAct;
    set(c, [
      { t: s.hasCostPlan ? svFmt(Math.round(s.costPlan), 0) : '', title: 'เป้า: Σ ตันเป้า × ราคาเป้า' + (s.missPlan ? ' · ยังไม่มีราคา ' + s.missPlan + ' ราย' : '') },
      { t: s.hasCostAct ? svFmt(Math.round(s.costAct), 0) : '', title: 'จริง: Σ รับจริง × ราคาจริง (ไม่ใช้ราคาเป้าแทน)' + (s.missAct ? ' · ยังไม่มีราคาจริง ' + s.missAct + ' ราย' : '') },
      { t: miss ? 'รอราคา ' + miss : '', title: 'จำนวนรายการที่มีตันแต่ยังไม่มีราคา' }
    ]);
  }
  function svAddName(cat, raw, nd) {
    var nm = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!nm) return null;
    if (nm.length > 300 || /[<>\u0000-\u001f]/.test(nm)) { alert('ชื่อผู้ส่งไม่ถูกต้อง'); return null; }
    var k = svNorm(nm);
    var exist = svRows(cat, nd).filter(function (r) { return r.key === k; })[0];
    if (!exist) svPending[cat].push(nm);
    return k;
  }
  function svBuild(table, c, parent, tds, nd) {
    var cat = c.cat, can = svCan(), today = svToday();
    var rows = svRows(cat, nd), frag = document.createDocumentFragment();
    var months = typeof currentMonth !== 'undefined' ? currentMonth : '';
    function cellFor(src, extra) {
      var td = svEl('td', 'rm-sup-td sv-td ' + (src.className || '') + (extra ? ' ' + extra : ''));
      td.setAttribute('colspan', src.getAttribute('colspan') || '1');
      td.removeAttribute('data-material-inline-day');
      td.setAttribute('data-sv-day', src.getAttribute('data-material-inline-day'));
      td.setAttribute('data-sv-cat', cat);
      return td;
    }
    function mk(kind) { var tr = svEl('tr', 'rm-sup sv-row rm-sup-' + kind + (svOpen ? '' : ' rm-hide')); tr.setAttribute('data-sv-cat', cat); return tr; }
    var sig = svSig(nd);
    // head row: toggle + note
    var head = svEl('tr', 'rm-sup rm-sup-head'); head.setAttribute('data-rm-sig', sig); head.setAttribute('data-sv-cat', cat);
    var hth = svEl('th', 'rm-sup-th'); hth.setAttribute('scope', 'row');
    var btn = svEl('button', 'rm-toggle', (svOpen ? '▾ ' : '▸ ') + 'ผู้ส่ง ' + rows.filter(function (r) { return !r.blank; }).length + ' ราย');
    btn.type = 'button'; btn.setAttribute('aria-expanded', svOpen ? 'true' : 'false');
    btn.title = 'แยกตามผู้ส่งจากบัญชีนัดรับ (ledger SUPPLIER) · ' + c.label;
    hth.appendChild(btn); hth.appendChild(svEl('small', null, c.label + ' · ตามบัญชีนัดรับ'));
    head.appendChild(hth);
    var span = 0; for (var q = 0; q < tds.length; q++) span += Number(tds[q].getAttribute('colspan')) || 1;
    var hn = svEl('td', 'rm-sup-note'); hn.setAttribute('colspan', String(Math.max(1, span)));
    hn.textContent = 'แก้ได้: เป้า (ตัน) · รับจริง (ตัน) · ราคา (บาท/ตัน) ต่อวัน → เป็นร่าง กด “บันทึกข้อมูล” เอง · ไม่เปลี่ยนยอดรับเข้า/สต๊อก';
    var mmDays = []; for (var q2 = 0; q2 < tds.length; q2++) { var dq = Number(tds[q2].getAttribute('data-material-inline-day')); if (svMismatch(cat, dq)) mmDays.push(dq); }
    if (mmDays.length && can) {
      var sb = svEl('button', 'sv-syncall', 'ปรับรับเข้าตามผู้ส่ง ' + mmDays.length + ' วัน'); sb.type = 'button';
      sb.title = 'แทนที่ค่ารับเข้าของวันที่ผลรวมผู้ส่งไม่ตรง (วันที่ ' + mmDays.join(', ') + ') ด้วยผลรวมผู้ส่ง · เป็นร่าง ต้องกด “บันทึกข้อมูล”';
      sb.addEventListener('click', function () {
        if (!confirm('แทนที่ยอดรับเข้า ' + c.label + ' ของวันที่ ' + mmDays.join(', ') + ' ด้วยผลรวมผู้ส่ง? (เป็นร่าง ยังไม่บันทึกจนกด “บันทึกข้อมูล”)')) return;
        var any = false; mmDays.forEach(function (dd) { if (svSyncDay(cat, dd)) any = true; });
        if (any) { svRun(true); svScheduleRender(); }
      });
      hn.appendChild(document.createTextNode(' ')); hn.appendChild(sb);
    }
    head.appendChild(hn); frag.appendChild(head);

    // column header row: เป้า / รับจริง / ราคา above every day
    var hdr = mk('hdr'); var hh = svEl('th', 'rm-sup-th sv-hdr-th', ''); hh.setAttribute('scope', 'row'); hdr.appendChild(hh);
    for (var i = 0; i < tds.length; i++) {
      var hc = cellFor(tds[i], 'sv-hdr');
      ['เป้า', 'รับจริง', 'ราคา'].forEach(function (t) { hc.appendChild(svEl('span', 'sv-h', t)); });
      hdr.appendChild(hc);
    }
    frag.appendChild(hdr);

    // supplier rows
    rows.forEach(function (r) {
      var tr = mk('row'); tr.setAttribute('data-sv-key', r.key);
      var th = svEl('th', 'rm-sup-th', r.name); th.setAttribute('scope', 'row'); th.title = r.name; tr.appendChild(th);
      for (var j0 = 0; j0 < tds.length; j0++) (function (j) {
        var day = Number(tds[j].getAttribute('data-material-inline-day'));
        var td = cellFor(tds[j]); td.setAttribute('data-sv-key', r.key);
        var isFuture = (months + '-' + svPad(day)) > today;
        var ms = r.blank ? svList(day, cat).filter(function (e) { return !svNorm(e && e.name); }) : svRowEntries(cat, day, r.key);
        var ctx = { cat: cat, day: day, key: r.key, name: r.name, nd: nd };
        var dup = ms.length > 1, entry = ms.length === 1 ? ms[0] : null;
        var ro = !can || r.blank || dup;
        var box = svEl('div', 'sv-cell');
        function mkIn(cls, label, val, disabled, field) {
          var inp = svEl('input', 'sv-in ' + cls); inp.type = 'number'; inp.min = '0'; inp.step = 'any'; inp.setAttribute('inputmode', 'decimal');
          inp.setAttribute('aria-label', c.label + ' ' + r.name + ' ' + label + ' วันที่ ' + day);
          inp.value = val == null ? '' : (Math.round(val * 1000) / 1000); inp.placeholder = '—'; inp.disabled = !!disabled; inp.setAttribute('data-sv-f', field);
          if (!disabled) {
            inp.addEventListener('input', function () { svCommit(ctx, inp, field, false); });
            inp.addEventListener('change', function () { svCommit(ctx, inp, field, true); });
            inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } });
          }
          return inp;
        }
        var pIn = mkIn('sv-plan', 'เป้า (ตัน)', entry && svNum(entry.planTons), ro, 'planTons');
        pIn.title = 'เป้า / นัดรับ (ตัน) · planTons';
        var aDis = ro || isFuture;
        var aIn = mkIn('sv-act', 'รับจริง (ตัน)', entry && svNum(entry.actualTons), aDis, 'actualTons');
        aIn.title = isFuture ? 'ยังไม่ถึงวัน · กรอกรับจริงไม่ได้' : 'รับจริง (ตัน) · actualTons';
        var prIn = mkIn('sv-price', 'ราคา (บาท/ตัน)', null, ro, 'price');
        if (entry) svPaintPrice(prIn, entry, isFuture); else { prIn.title = 'ราคา บาท/ตัน (กรอกเป้าหรือรับจริงก่อนหรือพร้อมกันได้)'; }
        box.appendChild(pIn); box.appendChild(aIn); box.appendChild(prIn);
        if (dup) { td.classList.add('sv-dup'); td.title = 'ชื่อนี้ซ้ำ ' + ms.length + ' รายการในวันเดียวกัน · แสดงอย่างเดียว ไม่รวม/ไม่แก้ (ตรวจในร่างนัดรับ)'; }
        if (!can && ms.length) td.classList.add('sv-ro');
        td.appendChild(box); tr.appendChild(td);
      })(j0);
      frag.appendChild(tr);
    });

    // "+" row (very bottom of the list)
    var add = mk('add'); var ath = svEl('th', 'rm-sup-th sv-add-th'); ath.setAttribute('scope', 'row');
    var dl = svEl('datalist', 'sv-dl'); dl.id = 'svNames_' + cat;
    var names = {}; rows.forEach(function (r) { if (!r.blank) names[r.name] = 1; });
    Object.keys(names).forEach(function (n) { var o = document.createElement('option'); o.value = n; dl.appendChild(o); });
    ath.appendChild(dl);
    function paintAdd() {
      while (ath.lastChild && ath.lastChild !== dl) ath.removeChild(ath.lastChild);
      if (!svAddOpen[cat]) {
        var pb = svEl('button', 'sv-plus', '+ เพิ่มผู้ส่ง'); pb.type = 'button'; pb.disabled = !can;
        pb.title = can ? 'เพิ่มแถวผู้ส่งใหม่ (พิมพ์ชื่อ) · เพิ่มได้มากกว่า 19 ราย' : 'ต้องเป็นผู้ดูแล/จัดซื้อวัตถุดิบ และโหลดข้อมูลครบก่อน';
        pb.addEventListener('click', function () { svAddOpen[cat] = true; paintAdd(); var i2 = ath.querySelector('input'); if (i2) i2.focus(); });
        ath.appendChild(pb);
      } else {
        var wrap = svEl('span', 'sv-addbox');
        var inp = svEl('input', 'sv-name'); inp.type = 'text'; inp.maxLength = 300; inp.setAttribute('list', 'svNames_' + cat); inp.placeholder = 'พิมพ์ชื่อผู้ส่ง'; inp.setAttribute('aria-label', 'ชื่อผู้ส่งใหม่');
        var ok = svEl('button', 'sv-ok', '✓'); ok.type = 'button'; ok.title = 'เพิ่มแถว (ยังไม่บันทึกอะไรจนกว่าจะกรอกตัวเลขในวัน)';
        var no = svEl('button', 'sv-no', '✕'); no.type = 'button'; no.title = 'ยกเลิก';
        var mm = svEl('button', 'sv-master', 'เลือกจากมาสเตอร์'); mm.type = 'button'; mm.disabled = true;
        mm.title = 'ยังไม่มีมาสเตอร์ผู้ส่งในระบบ (SUPPLIERMASTER ต้องให้ Codex ทำ) · ตอนนี้เลือกจากชื่อที่เคยมีในบัญชีเดือนนี้ได้ที่ช่องพิมพ์';
        function go() {
          var k = svAddName(cat, inp.value, nd);
          if (k == null) return;
          svAddOpen[cat] = false; svRun(true);
          var t = document.querySelector('table.production-overview-grid');
          var target = t && t.querySelector('tr.sv-row[data-sv-cat="' + cat + '"][data-sv-key="' + k.replace(/"/g, '') + '"] input.sv-plan:not([disabled])');
          if (target) { target.scrollIntoView({ block: 'nearest' }); target.focus(); }
        }
        ok.addEventListener('click', go); no.addEventListener('click', function () { svAddOpen[cat] = false; paintAdd(); });
        inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); go(); } else if (ev.key === 'Escape') { svAddOpen[cat] = false; paintAdd(); } });
        wrap.appendChild(inp); wrap.appendChild(ok); wrap.appendChild(no); ath.appendChild(wrap); ath.appendChild(mm);
      }
    }
    paintAdd(); add.appendChild(ath);
    var anote = svEl('td', 'sv-add-note'); anote.setAttribute('colspan', String(Math.max(1, span)));
    anote.textContent = 'เพิ่มชื่อแล้วกรอกตัวเลขในวันที่ต้องการ ระบบจะสร้างรายการของวันนั้นเป็นร่างให้ (ยังไม่ได้บันทึกจนกด “บันทึกข้อมูล”)';
    add.appendChild(anote); frag.appendChild(add);

    // totals
    function totRow(label, kind) {
      var tr = mk('total'); tr.classList.add('sv-tot-' + kind);
      var th = svEl('th', 'rm-sup-th', label); th.setAttribute('scope', 'row'); tr.appendChild(th);
      for (var j = 0; j < tds.length; j++) {
        var day = Number(tds[j].getAttribute('data-material-inline-day'));
        var td = cellFor(tds[j], 'sv-tot'); td.classList.add('sv-tot'); td.setAttribute('data-sv-k', kind);
        var b2 = svEl('div', 'sv-cell sv-tc-row'); for (var k2 = 0; k2 < 3; k2++) b2.appendChild(svEl('span', 'sv-tc', ''));
        td.appendChild(b2); tr.appendChild(td);
      }
      return tr;
    }
    frag.appendChild(totRow('รวมรายผู้ส่ง (ตัน)', 'qty'));
    frag.appendChild(totRow('ต้นทุนรวม (บาท)', 'cost'));

    btn.addEventListener('click', function () {
      svOpen = !svOpen; btn.setAttribute('aria-expanded', svOpen ? 'true' : 'false');
      table.querySelectorAll('tr.rm-sup-head .rm-toggle').forEach(function (b) { var cc = b.closest('tr').getAttribute('data-sv-cat'); b.textContent = (svOpen ? '▾ ' : '▸ ') + b.textContent.slice(2); });
      table.querySelectorAll('tr.sv-row').forEach(function (r) { r.classList.toggle('rm-hide', !svOpen); });
      table.querySelectorAll('tr.rm-sup-head').forEach(function (h) { h.setAttribute('data-rm-sig', svSig(nd)); });
    });
    parent.parentNode.insertBefore(frag, parent.nextSibling);
    for (var d3 = 0; d3 < tds.length; d3++) {
      var dd = Number(tds[d3].getAttribute('data-material-inline-day'));
      svPaintTotals(table, cat, dd, (months + '-' + svPad(dd)) > today);
    }
  }
  var svBusy = false;
  function svRun(force) {
    var table = document.querySelector('table.production-overview-grid');
    if (!table || svBusy) return;
    svBusy = true;
    try {
      var cm = typeof currentMonth !== 'undefined' ? currentMonth : '';
      if (svMonth !== cm) { svMonth = cm; svPending = { yuca: [], fuel: [] }; svAddOpen = {}; force = true; }
      var nd = typeof daysInMonth === 'function' ? daysInMonth(cm) : 31;
      try { svLockTop(nd); } catch (e0) { /* display only */ }
      var first = SV_CATS[0], p0 = table.querySelector('tr[data-material-inline-row="' + first.row + '"]');
      if (!p0 || typeof supplierEntries === 'undefined') { svClear(table); return; }
      // do not rebuild while he is typing in one of our inputs
      var ae = document.activeElement;
      if (!force && ae && ae.closest && ae.closest('tr.sv-row')) return;
      var sig = svSig(nd), head = table.querySelector('tr.rm-sup-head');
      if (!force && head && head.getAttribute('data-rm-sig') === sig && table.querySelectorAll('tr.rm-sup-head').length === SV_CATS.length) return;
      if (force && ae && ae.closest && ae.closest('tr.sv-row') && ae.tagName === 'INPUT' && !ae.classList.contains('sv-name')) ae.blur();
      svClear(table);
      SV_CATS.slice().reverse().forEach(function (c) {
        var parent = table.querySelector('tr[data-material-inline-row="' + c.row + '"]');
        if (!parent) return;
        var tds = parent.querySelectorAll('td[data-material-inline-day]');
        if (!tds.length) return;
        svBuild(table, c, parent, tds, nd);
      });
    } finally { svBusy = false; }
  }
  function enhanceRawMaterial() { svRun(false); }

  /* ---- wood-used-actual-v1: "ใช้ไป ตามแผนผลิต  <แผน> / <จริง>" — fill the right-hand (actual) value ----
     Display only. Same formula the page uses for the planned wood used (productionMaterialsPlannedUse), fed with the
     ACTUAL sheets produced that day instead of the planned sheets:
       per run (hour) of Line 1-3 with qty>0:  A = width x length (m) ; STDA = 1.22 x 2.44 ; t = thickness (mm)
         std  += A x (t/1000) x getDensity(t) x qty / 1000 x yieldCalcConst              (= calcWoodTonsStandard)
         tgt  += qty x (A/STDA) x (t/STD_THICKNESS) / sheetsPerTonRawBoard(line) x yieldTargetConst   (= calcWoodTonsTarget)
         area += qty x A/STDA ;  yieldArea += qty x A/STDA x getYieldRatio(t)
       ยูคา used = (std + tgt) / 2 ;  เชื้อเพลิง used = ยูคา / (yieldArea/area) x steamRatePerTonFG x fuelRatePerTonSteam
     Source of sheets = the page's own productionMailActualRecord(line, day).runs[] (qty, thickness, width, length).
     Shown only when all three Lines have a COMPLETE report that day (productionActualComplete) and at least one sheet was
     produced; otherwise the slot stays "—" (never 0, nothing guessed). A value the owner recorded by hand
     (procurementActual[day][..ActualUsed]) is never overwritten. Nothing is written or saved; คงเหลือ is not touched
     (the page only rolls the actual balance forward from recorded receipt/used values). */
  var WU_LINES = ['Line 1', 'Line 2', 'Line 3'];
  function wuOk(v) { return typeof v === 'number' && isFinite(v); }
  function wuUsed(day) {
    try {
      if (typeof productionMailActualRecord !== 'function' || typeof productionActualComplete !== 'function') return null;
      if (![yieldCalcConst, yieldTargetConst, steamRatePerTonFG, fuelRatePerTonSteam].every(function (v) { return wuOk(v) && v > 0; })) return null;
      var STDA = 1.22 * 2.44, std = 0, tgt = 0, area = 0, yieldArea = 0, totalQty = 0;
      for (var li = 0; li < WU_LINES.length; li++) {
        var line = WU_LINES[li], rec = productionMailActualRecord(line, day);
        if (!rec || !productionActualComplete(rec)) return null;
        var runs = Array.isArray(rec.runs) ? rec.runs : [], sumQty = 0;
        for (var i = 0; i < runs.length; i++) {
          var r = runs[i], q = r && r.qty;
          if (q == null) continue;
          if (!wuOk(q) || q < 0) return null;
          if (q === 0) continue;
          var t = Number(r.thickness), w = Number(r.width) / 1000, l = Number(r.length) / 1000;
          if (!(t > 0) || !(w > 0) || !(l > 0)) return null;
          if (!(getDensity(t) > 0) || !(getYieldRatio(t) > 0) || !(sheetsPerTonRawBoard(line) > 0)) return null;
          var A = w * l;
          std += (A * (t / 1000) * getDensity(t) * q / 1000) * yieldCalcConst;
          tgt += (q * (A / STDA) * (t / STD_THICKNESS) / sheetsPerTonRawBoard(line)) * yieldTargetConst;
          area += q * A / STDA; yieldArea += q * (A / STDA) * getYieldRatio(t);
          sumQty += q;
        }
        if (wuOk(rec.qty) && Math.abs(sumQty - rec.qty) > 0.5) return null;   // runs must add up to the day's reported sheets
        totalQty += sumQty;
      }
      if (!(totalQty > 0) || !(area > 0)) return null;
      var yuca = (std + tgt) / 2, avgYield = yieldArea / area;
      var fuel = avgYield > 0 ? yuca / avgYield * steamRatePerTonFG * fuelRatePerTonSteam : null;
      return { yuca: yuca, fuel: fuel, std: std, tgt: tgt, area: area, avgYield: avgYield, qty: totalQty };
    } catch (e) { return null; }
  }
  window.__aafWoodUsedActual = wuUsed;   // read-only helper (also used by the verification test)
  function enhanceWoodUsed() {
    var table = document.querySelector('table.production-overview-grid');
    if (!table) return;
    ['yuca', 'fuel'].forEach(function (cat) {
      var row = table.querySelector('tr[data-material-inline-row="' + cat + '-used"]');
      if (!row) return;
      var tds = row.querySelectorAll('td[data-material-inline-day]');
      for (var i = 0; i < tds.length; i++) {
        var td = tds[i], day = Number(td.getAttribute('data-material-inline-day'));
        var sp = td.querySelector('span.materials-inline-actual');
        if (!sp) continue;                                            // future day: the page shows no actual slot
        var manual = null;
        try { manual = procurementActual[day] && procurementActual[day][cat + 'ActualUsed']; } catch (e) { manual = null; }
        if (manual != null && manual !== '') { sp.classList.remove('wu-calc'); continue; }   // owner-recorded value stays
        var u = wuUsed(day), v = u ? u[cat] : null;
        if (wuOk(v) && v > 0) {
          var txt = typeof materialsNum === 'function' ? materialsNum(v) : v.toLocaleString('th-TH', { maximumFractionDigits: 2 });
          if (sp.textContent !== txt) sp.textContent = txt;
          sp.classList.add('wu-calc');
          sp.title = 'คำนวณจากแผ่นที่ผลิตจริง (' + u.qty.toLocaleString('th-TH') + ' แผ่น) ด้วยสูตรเดียวกับยอดแผน · ไม่ได้บันทึก ไม่กระทบคงเหลือ';
        } else if (sp.classList.contains('wu-calc')) {
          sp.classList.remove('wu-calc'); sp.textContent = '—';
        }
      }
    });
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

  function enhanceBody() {
    try {
      enhanceLineBadges();
      enhanceRowLabels();
      enhanceColumns();
      enhanceStopped();
      enhanceMetrics();
      enhanceV2();
      try { enhanceRawMaterial(); } catch (e2) { if (typeof console !== 'undefined' && console.warn) console.warn('raw-material skipped', e2); }
      try { enhanceWoodUsed(); } catch (e3) { if (typeof console !== 'undefined' && console.warn) console.warn('wood-used skipped', e3); }
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('grid-modern skipped', err);
    }
  }

  var gmBusy = false;
  function enhance() {
    if (gmBusy) return;
    gmBusy = true;
    try { if (gmObs) gmObs.disconnect(); enhanceBody(); }
    catch (e) { /* never break the page */ }
    finally { gmBusy = false; try { gmAttach(); } catch (e2) { /* ignore */ } }
  }

  try { document.documentElement.setAttribute('data-aaf-grid', 'v6'); } catch (e0) { /* ignore */ }
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
      if (n >= 40) { clearInterval(t); setInterval(function () { hook(); gmAttach(); }, 3000); }
    }, 250);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
