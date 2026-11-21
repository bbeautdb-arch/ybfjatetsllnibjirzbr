/* Display-only size-aware 2.5-eq for ACTUAL sheets.
 * Official formula (factory-knowledge + mail-actual):
 *   eq25 = qty * w * l * t / (1220 * 2440 * 2.5)   (w,l,t in mm)
 * The target already uses this via calcRunSizeBreakdown / size catalog (meters).
 * Actual must use the same path: look at the plan size header first, then convert.
 * Never fall back to thickness-only (qty * t / 2.5). If size is missing, show "—".
 * Does not write planData, field IDs, mail records, or save behaviour.
 */
(function () {
  'use strict';
  if (window.__AAF_EQ25_SIZE__) return;

  var STD_W_MM = 1220;
  var STD_L_MM = 2440;
  var STD_T = 2.5;
  var STD_W_M = 1.22;
  var STD_L_M = 2.44;
  var DASH = '—';
  var MARK = 'v8';

  function finite(n) {
    return typeof n === 'number' && Number.isFinite(n);
  }
  function nonneg(n) {
    return finite(n) && n >= 0;
  }
  function pos(n) {
    return finite(n) && n > 0;
  }
  function toNum(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).trim().replace(/,/g, ''));
    return finite(n) ? n : null;
  }
  function fmt(n) {
    if (!finite(n)) return DASH;
    try {
      if (typeof mailNumber === 'function') return mailNumber(n);
    } catch (e0) {}
    return n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }
  function parseDisplay(text) {
    if (text == null) return null;
    var s = String(text).replace(/,/g, '').replace(/\s+/g, '').replace(/\*$/, '').trim();
    if (s === '' || s === DASH || s === '-') return null;
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return finite(n) ? n : null;
  }

  /* Canonical conversion. Width/length may be mm (>= 100) or meters (<= 20). */
  function eq25(qty, w, l, t) {
    if (!nonneg(qty) || !pos(w) || !pos(l) || !pos(t)) return null;
    var wMm = w;
    var lMm = l;
    if (w <= 20 && l <= 20) {
      wMm = w * 1000;
      lMm = l * 1000;
    }
    var n = qty * wMm * lMm * t / (STD_W_MM * STD_L_MM * STD_T);
    return finite(n) ? n : null;
  }
  function eq25Meters(qty, wM, lM, t) {
    if (!nonneg(qty) || !pos(wM) || !pos(lM) || !pos(t)) return null;
    var n = qty * wM * lM * t / (STD_W_M * STD_L_M * STD_T);
    return finite(n) ? n : null;
  }

  function skipRun(run) {
    if (!run) return true;
    return (run.hours == null || String(run.hours).trim() === '') &&
      (run.thickness == null || String(run.thickness).trim() === '');
  }
  function planRuns(line, day) {
    var runs;
    try { runs = (typeof planData !== 'undefined' && planData[line + '_' + day]) || []; }
    catch (e1) { return []; }
    if (!Array.isArray(runs)) return [];
    var out = [];
    for (var i = 0; i < runs.length; i++) {
      if (skipRun(runs[i])) continue;
      out.push(runs[i]);
    }
    return out;
  }
  function sizeSheets(sizeName) {
    if (!sizeName || !String(sizeName).trim()) return [];
    try {
      if (typeof getSizeSheets === 'function') {
        var sheets = getSizeSheets(sizeName);
        if (Array.isArray(sheets) && sheets.length) return sheets.filter(function (s) {
          return s && pos(Number(s.w)) && pos(Number(s.l));
        });
      }
    } catch (e2) {}
    try {
      if (typeof sizeStdRows !== 'undefined' && sizeStdRows) {
        var trimmed = String(sizeName).trim();
        var keys = Object.keys(sizeStdRows);
        for (var i = 0; i < keys.length; i++) {
          var row = sizeStdRows[keys[i]];
          if (row && row.name && String(row.name).trim() === trimmed) {
            return (row.sheets || []).filter(function (s) {
              return s && pos(Number(s.w)) && pos(Number(s.l));
            });
          }
        }
      }
    } catch (e3) {}
    return [];
  }

  /* Factor for one plan run: same math as the target (calcRunSizeBreakdown). */
  function factorFromRun(line, run) {
    if (!run) return null;
    var t = toNum(run.thickness);
    if (!pos(t)) return null;
    var parts = null;
    try {
      if (typeof calcRunSizeBreakdown === 'function') parts = calcRunSizeBreakdown(line, run);
    } catch (e4) { parts = null; }
    if (Array.isArray(parts) && parts.length) {
      var qty = 0, total = 0, ok = true;
      for (var p = 0; p < parts.length; p++) {
        var part = parts[p];
        var c = Number(part.count);
        var w = Number(part.w);
        var l = Number(part.l);
        var e = eq25(c, w, l, t);
        if (!nonneg(c) || e == null) { ok = false; break; }
        qty += c;
        total += e;
      }
      if (ok && qty > 0 && finite(total)) return total / qty;
    }
    var size = run.size != null ? String(run.size).trim() : '';
    if (!size) return null;
    var sheets = sizeSheets(size);
    if (!sheets.length) return null;
    var fSum = 0;
    for (var s = 0; s < sheets.length; s++) {
      var e2 = eq25(1, Number(sheets[s].w), Number(sheets[s].l), t);
      if (e2 == null) return null;
      fSum += e2;
    }
    return fSum / sheets.length;
  }

  function factorFromHeader(sizeName, thickness) {
    var t = toNum(thickness);
    if (!pos(t)) return null;
    var size = sizeName != null ? String(sizeName).trim() : '';
    if (!size) return null;
    var sheets = sizeSheets(size);
    if (!sheets.length) return null;
    var fSum = 0;
    for (var s = 0; s < sheets.length; s++) {
      var e = eq25(1, Number(sheets[s].w), Number(sheets[s].l), t);
      if (e == null) return null;
      fSum += e;
    }
    return fSum / sheets.length;
  }

  /* Prefer the plan size header for this thickness (first matching lane). */
  function factorForThickness(line, day, thickness) {
    var t = toNum(thickness);
    var runs = planRuns(line, day);
    var match = [];
    var i;
    for (i = 0; i < runs.length; i++) {
      var rt = toNum(runs[i].thickness);
      if (t != null && pos(t) && rt != null && String(rt) === String(t)) match.push(runs[i]);
    }
    if (!match.length && pos(t)) {
      /* No exact thickness match: do not borrow another run's size. */
    } else if (match.length) {
      var factors = [];
      for (i = 0; i < match.length; i++) {
        var f = factorFromRun(line, match[i]);
        if (f == null) return null;
        factors.push(f);
      }
      /* Different sizes at the same thickness cannot share one aggregated qty. */
      var first = factors[0];
      for (i = 1; i < factors.length; i++) {
        if (Math.abs(factors[i] - first) > 1e-9 * Math.max(1, Math.abs(first))) return null;
      }
      return first;
    }
    return null;
  }

  function convertActual(line, day, qty, thickness, sizeName) {
    if (!nonneg(qty)) return null;
    var f = null;
    if (sizeName != null && String(sizeName).trim() !== '') {
      f = factorFromHeader(sizeName, thickness);
    }
    if (f == null) f = factorForThickness(line, day, thickness);
    if (f == null) return null;
    var n = qty * f;
    return finite(n) ? n : null;
  }

  function convertRecord(line, day, rec) {
    if (!rec || typeof rec !== 'object') return rec;
    var copy = Object.assign({}, rec);
    var anyMissing = false;
    if (Array.isArray(rec.byThickness)) {
      copy.byThickness = rec.byThickness.map(function (g) {
        var g2 = Object.assign({}, g);
        var qty = g && typeof g.qty === 'number' ? g.qty : null;
        if (qty == null) return g2;
        var next = convertActual(line, day, qty, g.thickness);
        if (next == null) { g2.eq25 = null; anyMissing = true; }
        else g2.eq25 = next;
        return g2;
      });
    }
    if (Array.isArray(rec.runs)) {
      copy.runs = rec.runs.map(function (run) {
        var r2 = Object.assign({}, run);
        var qty = run && typeof run.qty === 'number' ? run.qty : null;
        if (qty == null) return r2;
        var next = convertActual(line, day, qty, run.thickness);
        if (next == null) r2.eq25 = null;
        else r2.eq25 = next;
        return r2;
      });
    }
    function sumKnown(list, key) {
      if (!list || !list.length) return null;
      var sum = 0, seen = false;
      for (var i = 0; i < list.length; i++) {
        var v = list[i] && list[i][key];
        if (typeof v === 'number' && finite(v)) { sum += v; seen = true; }
        else if (list[i] && typeof list[i].qty === 'number' && list[i].qty) return null;
      }
      return seen ? sum : null;
    }
    var total = sumKnown(copy.byThickness, 'eq25');
    if (total == null && !copy.byThickness && typeof rec.qty === 'number') {
      var runs = planRuns(line, day);
      if (runs.length === 1) total = convertActual(line, day, rec.qty, runs[0].thickness || rec.thickness, runs[0].size);
    }
    if (anyMissing) total = null;
    if (rec.eq25 != null || rec.knownEq25 != null || total != null) {
      if (total == null && (rec.eq25 != null || rec.knownEq25 != null)) {
        /* Size missing: do not keep a thickness-only stored value. */
        copy.eq25 = rec.eq25 != null ? null : rec.eq25;
        if (rec.knownEq25 != null) copy.knownEq25 = null;
      } else {
        if (rec.eq25 != null || total != null) copy.eq25 = total;
        if (rec.knownEq25 != null || (rec.status === 'partial' && total != null)) copy.knownEq25 = total;
      }
    }
    return copy;
  }

  function displayPayload(source) {
    if (!source || typeof source !== 'object') return source;
    if (!Array.isArray(source.days)) return source;
    var out = Object.assign({}, source);
    out.days = source.days.map(function (day) {
      if (!day || typeof day !== 'object') return day;
      var d = Object.assign({}, day);
      if (Array.isArray(day.lines)) {
        d.lines = day.lines.map(function (r) {
          var line = r && r.line;
          var num = day.day;
          return convertRecord(line, num, r);
        });
      }
      function sum(key) {
        if (!Array.isArray(d.lines)) return null;
        var s = 0, ok = true, seen = false;
        d.lines.forEach(function (r) {
          var v = r && r[key];
          if (typeof v === 'number' && finite(v)) { s += v; seen = true; }
          else if (r && (r[key] == null) && (day[key] != null)) ok = false;
        });
        return ok && seen ? s : null;
      }
      if (day.eq25 != null) d.eq25 = sum('eq25');
      if (day.knownEq25 != null) d.knownEq25 = sum('knownEq25');
      return d;
    });
    if (source.totals && typeof source.totals === 'object') {
      out.totals = Object.assign({}, source.totals);
      var tEq = 0, tKnown = 0, sawEq = false, sawKnown = false, missEq = false, missKnown = false;
      out.days.forEach(function (day) {
        if (day && day.eq25 != null) {
          if (typeof day.eq25 === 'number' && finite(day.eq25)) { tEq += day.eq25; sawEq = true; }
          else missEq = true;
        }
        if (day && day.knownEq25 != null) {
          if (typeof day.knownEq25 === 'number' && finite(day.knownEq25)) { tKnown += day.knownEq25; sawKnown = true; }
          else missKnown = true;
        }
      });
      if (source.totals.eq25 != null) out.totals.eq25 = (!missEq && sawEq) ? tEq : null;
      if (source.totals.knownEq25 != null) out.totals.knownEq25 = (!missKnown && sawKnown) ? tKnown : null;
    }
    return out;
  }

  function wrapFn(name, wrapper) {
    try {
      var orig = window[name];
      if (typeof orig !== 'function' || orig.__aafEq25Size) return false;
      var wrapped = wrapper(orig);
      wrapped.__aafEq25Size = true;
      window[name] = wrapped;
      return true;
    } catch (e5) { return false; }
  }

  function hookDisplayHelpers() {
    wrapFn('productionMailActualRecord', function (orig) {
      return function (line, day) {
        var rec = orig.apply(this, arguments);
        try { return rec ? convertRecord(line, day, rec) : rec; }
        catch (e6) { return rec; }
      };
    });
    wrapFn('productionActualDailyTotal', function (orig) {
      return function (day) {
        /* Rebuild from wrapped per-line records when possible. */
        try {
          var lines = (typeof productionActualLines !== 'undefined' && productionActualLines) || ['Line 1', 'Line 2', 'Line 3'];
          var sum = 0, ok = true, seen = false;
          for (var i = 0; i < lines.length; i++) {
            var rec = typeof productionMailActualRecord === 'function' ? productionMailActualRecord(lines[i], day) : null;
            var v = rec && (typeof rec.eq25 === 'number' ? rec.eq25 : rec.knownEq25);
            if (typeof v === 'number' && finite(v)) { sum += v; seen = true; }
            else if (rec && rec.status && rec.status !== 'missing' && rec.status !== 'future') { ok = false; break; }
          }
          if (ok && seen) return sum;
        } catch (e7) {}
        return orig.apply(this, arguments);
      };
    });
    wrapFn('productionActualThicknessPairs', function (orig) {
      return function (line, day) {
        var groups = orig.apply(this, arguments);
        if (!Array.isArray(groups)) return groups;
        return groups.map(function (g) {
          if (!g || typeof g !== 'object') return g;
          var g2 = Object.assign({}, g);
          if (g.actual && typeof g.actual === 'object') {
            g2.actual = Object.assign({}, g.actual);
            var qty = typeof g.actual.qty === 'number' ? g.actual.qty : null;
            if (qty != null) g2.actual.eq25 = convertActual(line, day, qty, g.thickness != null ? g.thickness : (g.actual.thickness));
          }
          return g2;
        });
      };
    });
    wrapFn('productionSummaryActualCardsProjection', function (orig) {
      return function (payload, month, today, plans) {
        try { return orig(displayPayload(payload), month, today, plans); }
        catch (e8) { return orig.apply(this, arguments); }
      };
    });
    wrapFn('productionSummaryPaceProjection', function (orig) {
      return function (payload, month, today, dailyPlan, cards) {
        try { return orig(displayPayload(payload), month, today, dailyPlan, cards); }
        catch (e9) { return orig.apply(this, arguments); }
      };
    });
    wrapFn('productionActualVariance', function (orig) {
      return function (line, day) {
        try {
          var r = typeof productionMailActualRecord === 'function' ? productionMailActualRecord(line, day) : null;
          var plan = typeof productionActualLinePlan === 'function' ? productionActualLinePlan(line, day) : null;
          var complete = typeof productionActualComplete === 'function' ? productionActualComplete(r) : (r && r.status === 'complete');
          if (complete && plan != null && typeof r.eq25 === 'number' && finite(r.eq25)) return r.eq25 - plan;
          if (complete && plan != null && r && r.eq25 == null) return null;
        } catch (e10) {}
        return orig.apply(this, arguments);
      };
    });
  }

  function dayGroups(row) {
    var out = [], g;
    Array.prototype.forEach.call(row.children, function (td) {
      if (String(td.tagName).toUpperCase() !== 'TD') return;
      if (!g || td.classList.contains('day-start')) { g = []; out.push(g); }
      g.push(td);
    });
    return out;
  }
  function lineTable(node) {
    return node && node.closest && node.closest('table.production-overview-grid, table.preview-table');
  }
  function findRow(table, line, pred) {
    if (!table) return null;
    var rows = table.querySelectorAll('tr[data-production-line]');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-production-line') !== line) continue;
      if (pred(rows[i])) return rows[i];
    }
    return null;
  }
  function laneValue(row, day, lane, selector, attr) {
    if (!row) return null;
    var group = dayGroups(row)[day - 1];
    if (!group || !group.length) return null;
    var cell = group[Math.min(Math.max(lane, 0), group.length - 1)] || group[0];
    if (!cell) return null;
    if (selector) {
      var nodes = cell.querySelectorAll(selector);
      var node = nodes[Math.min(lane, Math.max(0, nodes.length - 1))] || nodes[0];
      if (node) {
        if (attr) return node.getAttribute(attr);
        if (node.tagName === 'INPUT' || node.tagName === 'SELECT') return node.value;
        return node.textContent;
      }
    }
    var input = cell.querySelector('input,select');
    return input ? input.value : cell.textContent;
  }

  function setTextKeepMark(el, text) {
    if (!el) return false;
    var star = el.querySelector && el.querySelector('sup');
    var current = (el.textContent || '').trim();
    var want = text + (star ? '*' : '');
    /* Compare without thousands separators / stars. */
    var curN = parseDisplay(current);
    var wantN = parseDisplay(text);
    if (text === DASH) {
      if (current === DASH || current === '-' || current === '') return false;
    } else if (curN != null && wantN != null && Math.abs(curN - wantN) < 1e-6) {
      return false;
    }
    if (star) {
      var b = el.querySelector('b') || el;
      if (b === el) {
        el.childNodes.forEach ? null : 0;
        var written = false;
        Array.prototype.slice.call(el.childNodes).forEach(function (n) {
          if (n.nodeType === 3 || (n.nodeType === 1 && n.tagName === 'B')) {
            if (n.nodeType === 3) { if (!written) { n.nodeValue = text; written = true; } }
            else if (!written) { n.textContent = text; written = true; }
          }
        });
        if (!written) el.insertBefore(document.createTextNode(text), el.firstChild);
      } else if (b.textContent !== text) b.textContent = text;
    } else if ((el.textContent || '') !== text) {
      var b2 = el.querySelector && el.querySelector('b');
      if (b2) b2.textContent = text;
      else el.textContent = text;
    }
    return true;
  }

  function correctActualNode(node, value) {
    if (!node) return false;
    var text = value == null ? DASH : fmt(value);
    var changed = setTextKeepMark(node, text);
    if (node.getAttribute && node.getAttribute('data-aaf-eq25-size') !== MARK) {
      node.setAttribute('data-aaf-eq25-size', MARK);
      changed = true;
    }
    if (value == null) node.setAttribute('data-aaf-eq25-missing-size', '1');
    else node.removeAttribute('data-aaf-eq25-missing-size');
    return changed;
  }

  function qtyFromPairOrRow(table, line, day, lane, pair) {
    if (pair) {
      var q = pair.getAttribute('data-mail-actual-qty');
      var n = toNum(q);
      if (n != null) return n;
    }
    var qtyRow = findRow(table, line, function (r) { return r.getAttribute('data-mail-plan-metric') === 'qty'; });
    if (!qtyRow) return null;
    var group = dayGroups(qtyRow)[day - 1];
    if (!group) return null;
    var cell = group[Math.min(lane, group.length - 1)] || group[0];
    if (!cell) return null;
    var thk = pair && (pair.getAttribute('data-mail-thickness') || pair.getAttribute('data-mail-phr-thickness'));
    if (thk) {
      var matched = cell.querySelector('.mail-thickness-pair[data-mail-thickness="' + thk + '"] .mail-inline-actual, .mail-thickness-pair[data-mail-thickness="' + thk + '"] .mail-metric-actual, .mail-thickness-pair[data-mail-thickness="' + thk + '"] .gm4-a');
      if (matched) return parseDisplay(matched.textContent);
    }
    var actuals = cell.querySelectorAll('.mail-thickness-pair .mail-inline-actual, .mail-thickness-pair .mail-metric-actual, .mail-thickness-pair .gm4-a');
    if (!actuals.length) actuals = cell.querySelectorAll('.mail-inline-actual, .mail-metric-actual, .gm4-a');
    var a = actuals[Math.min(lane, Math.max(0, actuals.length - 1))] || actuals[0];
    return parseDisplay(a && a.textContent);
  }

  function sizeFromLane(table, line, day, lane, thickness) {
    var runs = planRuns(line, day);
    var t = toNum(thickness);
    if (runs[lane] && (t == null || toNum(runs[lane].thickness) == t || String(toNum(runs[lane].thickness)) === String(t))) {
      if (runs[lane].size) return String(runs[lane].size).trim();
    }
    if (t != null) {
      for (var i = 0; i < runs.length; i++) {
        if (String(toNum(runs[i].thickness)) === String(t) && runs[i].size) return String(runs[i].size).trim();
      }
    }
    var sizeRow = findRow(table, line, function (r) {
      return !!r.querySelector('input.pv-size') && !r.getAttribute('data-mail-plan-metric');
    });
    var raw = laneValue(sizeRow, day, lane, 'input.pv-size');
    return raw != null ? String(raw).trim() : '';
  }

  function thicknessFromLane(table, line, day, lane, pair) {
    if (pair) {
      var raw = pair.getAttribute('data-mail-thickness') || pair.getAttribute('data-mail-phr-thickness');
      var n = toNum(raw);
      if (n != null) return n;
    }
    var runs = planRuns(line, day);
    if (runs[lane] && toNum(runs[lane].thickness) != null) return toNum(runs[lane].thickness);
    var thkRow = findRow(table, line, function (r) { return !!r.querySelector('input.pv-thk'); });
    return toNum(laneValue(thkRow, day, lane, 'input.pv-thk'));
  }

  function correctPair(table, line, day, lane, pair) {
    var actual = pair.querySelector('.mail-inline-actual, .mail-metric-actual, .gm4-a');
    if (!actual) return false;
    var thk = thicknessFromLane(table, line, day, lane, pair);
    var qty = qtyFromPairOrRow(table, line, day, lane, pair);
    var size = sizeFromLane(table, line, day, lane, thk);
    var value = null;
    if (qty != null) {
      value = convertActual(line, day, qty, thk, size);
      if (value == null) value = convertActual(line, day, qty, thk);
    }
    return correctActualNode(actual, value);
  }

  function correctEq25Row(row) {
    var table = lineTable(row);
    var line = row.getAttribute('data-production-line');
    if (!table || !line) return;
    dayGroups(row).forEach(function (cells, index) {
      var day = index + 1;
      cells.forEach(function (cell, laneFromCell) {
        var thickPairs = cell.querySelectorAll('.mail-thickness-pair');
        var pairs = thickPairs.length ? thickPairs : cell.querySelectorAll('.mail-inline-pair, .gm4-pair, [data-mail-metric-source]');
        if (pairs.length) {
          Array.prototype.forEach.call(pairs, function (pair, lane) {
            /* A wrapper spanning several groups is not itself a matched pair. */
            if (pair.querySelectorAll('.mail-inline-actual, .mail-metric-actual, .gm4-a').length !== 1 &&
                !pair.classList.contains('mail-thickness-pair') && !pair.classList.contains('gm4-pair')) return;
            correctPair(table, line, day, lane, pair);
          });
          return;
        }
        var actuals = cell.querySelectorAll('.mail-inline-actual, .mail-metric-actual, .gm4-a, .gm2-ha, .gm3-ha');
        Array.prototype.forEach.call(actuals, function (actual, lane) {
          var thk = thicknessFromLane(table, line, day, Math.max(lane, laneFromCell));
          var qty = qtyFromPairOrRow(table, line, day, Math.max(lane, laneFromCell), null);
          var size = sizeFromLane(table, line, day, Math.max(lane, laneFromCell), thk);
          var value = qty == null ? null : convertActual(line, day, qty, thk, size);
          correctActualNode(actual, value);
        });
      });
    });
  }

  function correctTotals() {
    document.querySelectorAll('table.production-overview-grid .actual-production-row, table.preview-table .actual-production-row').forEach(function (row) {
      row.querySelectorAll('[data-mail-actual-total-day]').forEach(function (td) {
        var day = Number(td.getAttribute('data-mail-actual-total-day'));
        var node = td.querySelector('strong, .mail-inline-actual, b') || td;
        var total = null;
        try {
          if (typeof productionActualDailyTotal === 'function') total = productionActualDailyTotal(day);
        } catch (e11) { total = null; }
        if (total == null) {
          var sum = 0, ok = true, seen = false;
          ['Line 1', 'Line 2', 'Line 3'].forEach(function (line) {
            var rec = null;
            try { rec = typeof productionMailActualRecord === 'function' ? productionMailActualRecord(line, day) : null; }
            catch (e12) { rec = null; }
            var v = rec && (typeof rec.eq25 === 'number' ? rec.eq25 : rec.knownEq25);
            if (typeof v === 'number' && finite(v)) { sum += v; seen = true; }
            else if (rec && rec.status && rec.status !== 'missing' && rec.status !== 'future' && rec.status !== 'shutdown-confirmed') ok = false;
          });
          total = ok && seen ? sum : null;
        }
        correctActualNode(node, total);
      });
    });
  }

  function correctDetails() {
    document.querySelectorAll('.mail-actual-thicknesses span, .mail-actual-details td').forEach(function () { /* numbers come from wrapped records on refresh */ });
  }

  function correctAll() {
    document.querySelectorAll('tr[data-mail-plan-metric="eq25"]').forEach(correctEq25Row);
    correctTotals();
    correctDetails();
    try {
      if (typeof window.refreshProductionSummaryActualCards === 'function' && !correctAll._cards) {
        /* Rebuild cards once after hooks; later renders call this themselves. */
      }
    } catch (e13) {}
  }

  var scheduled = false;
  var paused = false;
  function schedule() {
    if (scheduled || paused) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      paused = true;
      try { hookDisplayHelpers(); correctAll(); }
      finally { paused = false; }
    });
  }

  var hookTries = 0;
  function boot() {
    hookDisplayHelpers();
    var iv = setInterval(function () {
      hookDisplayHelpers();
      if (++hookTries > 40) clearInterval(iv);
    }, 250);
    try {
      if (typeof window.refreshProductionSummaryActualCards === 'function') {
        window.refreshProductionSummaryActualCards();
      }
    } catch (e14) {}
    var host = document.getElementById('main') || document.body;
    if (host && typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () { schedule(); }).observe(host, { childList: true, subtree: true, characterData: true });
    }
    schedule();
  }

  window.__AAF_EQ25_SIZE__ = {
    version: MARK,
    STD_W_MM: STD_W_MM,
    STD_L_MM: STD_L_MM,
    STD_T: STD_T,
    eq25: eq25,
    eq25Meters: eq25Meters,
    factorFromRun: factorFromRun,
    factorFromHeader: factorFromHeader,
    factorForThickness: factorForThickness,
    convertActual: convertActual,
    convertRecord: convertRecord,
    displayPayload: displayPayload,
    format: fmt,
    correctAll: correctAll,
    hook: hookDisplayHelpers
  };

  hookDisplayHelpers();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
