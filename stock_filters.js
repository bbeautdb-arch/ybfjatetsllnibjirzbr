/* View-only filters: never remove catalog rows, change stock, or filter exports. */
(() => {
  'use strict';
  window.AAFStockFilters = Object.freeze({
    matches(row, filters = {}) {
      if (filters.hideZero && Number(row.qty) === 0) return false;
      return ['t', 'w', 'l', 'grade'].every(key =>
        !filters[key] || String(row[key]) === String(filters[key]));
    }
  });
})();
