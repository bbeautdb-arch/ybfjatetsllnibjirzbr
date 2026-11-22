/* Coalesce every production-plan add-on paint into one animation frame.
 * Display only: does not wrap save, update, or renderAll itself. */
(function () {
  'use strict';
  if (window.__AAF_PAINT__) return;
  var ORDER = ['clarity', 'modern', 'mixed', 'loading', 'eq25', 'colors', 'hooks'];
  var jobs = [];
  var scheduled = false;
  var depth = 0;
  var raf = 0;

  function sortJobs(list) {
    return list.slice().sort(function (a, b) {
      var ia = ORDER.indexOf(a.name);
      var ib = ORDER.indexOf(b.name);
      if (ia < 0) ia = 50;
      if (ib < 0) ib = 50;
      return ia - ib;
    });
  }

  function run() {
    scheduled = false;
    var list = sortJobs(jobs);
    jobs = [];
    var html = document.documentElement;
    depth += 1;
    if (html) html.setAttribute('data-aaf-painting', '1');
    try {
      for (var i = 0; i < list.length; i++) {
        try { list[i].fn(); }
        catch (e) { try { console.warn('aaf paint', list[i].name, e); } catch (_) {} }
      }
    } finally {
      if (html) html.removeAttribute('data-aaf-painting');
      depth -= 1;
    }
  }

  window.__AAF_PAINT__ = {
    version: 'v8.2',
    enqueue: function (name, fn) {
      if (typeof fn !== 'function') return;
      var found = false;
      for (var i = 0; i < jobs.length; i++) {
        if (jobs[i].name === name) { jobs[i].fn = fn; found = true; break; }
      }
      if (!found) jobs.push({ name: name, fn: fn });
      if (scheduled) return;
      scheduled = true;
      if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(run);
      else raf = setTimeout(run, 0);
    },
    flush: function () {
      if (depth > 0) return;
      if (scheduled && raf) {
        try {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
          else clearTimeout(raf);
        } catch (_) {}
      }
      raf = 0;
      if (jobs.length) run();
      else scheduled = false;
    },
    busy: function () { return depth > 0; },
    isRebuild: function (records) {
      if (!records || !records.length) return true;
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'childList' && ((r.addedNodes && r.addedNodes.length) || (r.removedNodes && r.removedNodes.length))) return true;
      }
      return false;
    }
  };
})();
