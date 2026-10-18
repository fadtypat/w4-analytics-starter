// usage: node dashboard/check_calc.js <data-dir>
const fs = require('fs'), path = require('path');
const Papa = require('./papaparse.min.js');
const C = require('./calc.js');
const dir = process.argv[2] || 'data';
const rd = f => Papa.parse(fs.readFileSync(path.join(dir, f), 'utf8'), { header: true, skipEmptyLines: true, transformHeader: h => h.replace(/^﻿/, '').trim() });
const o = rd('orders.csv'), p = rd('products.csv');
const { map, missing } = C.mapCols(o.meta.fields, C.ALIAS);
const cost = C.costMapOf(p.data, C.mapCols(p.meta.fields, C.PALIAS).map);
const b = C.buildRows(o.data, map, cost);
console.log('rows', o.data.length, 'missing columns', missing, 'bad', b.bad, 'unmatched products', b.unmatched);
const rgs = ['', ...new Set(b.rows.map(x => x.rg))], cts = ['', ...new Set(b.rows.map(x => x.ct))];
let max = 0, badNum = 0, notOk = 0, n = 0;
for (const rg of rgs) for (const ct of cts) {
  const rows = b.rows.filter(x => (!rg || x.rg === rg) && (!ct || x.ct === ct));
  const j = C.buildSummary(rows, b.rows, { region: rg, category: ct });
  const r = C.buildReport(j), chk = C.checkSummary(C.reportText(r), j);
  n++; max = Math.max(max, r.words);
  if (chk.bad.length || C.leaves(j).length > 30) badNum++;
  if (!r.ok) notOk++;
}
console.log('filter combos', n, '| max words', max, '| combos with foreign numbers or >30 values', badNum, '| combos over word limits', notOk);
process.exit(badNum || notOk ? 1 : 0);
