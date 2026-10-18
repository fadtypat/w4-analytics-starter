(function (g) {
'use strict';
const OK = 'จัดส่งสำเร็จ', CANCEL = 'ยกเลิก', RET = 'คืนสินค้า';
const MEGA = new Set(['3.3', '6.6', '9.9', '10.10', '11.11', '12.12']);
const MEGA_TEXT = '3.3, 6.6, 9.9, 10.10, 11.11, 12.12';
const ALIAS = {
  status: ['status', 'สถานะ'], qty: ['qty', 'quantity', 'จำนวน'], price: ['unit_price', 'price', 'ราคา'],
  disc: ['discount_pct', 'discount', 'ส่วนลด'], date: ['order_datetime', 'order_date', 'date', 'created_at', 'วันที่'],
  channel: ['channel', 'ช่องทาง'], region: ['region', 'ภูมิภาค'], prov: ['province', 'จังหวัด', 'state'],
  ship: ['carrier', 'shipping_method', 'ship_method', 'shipping', 'delivery_method', 'delivery', 'courier', 'ขนส่ง', 'การจัดส่ง'],
  cat: ['category', 'product_category', 'หมวดสินค้า', 'หมวด'], pid: ['product_id', 'sku', 'รหัสสินค้า']
};
const PALIAS = { pid: ['product_id', 'sku', 'รหัสสินค้า'], cost: ['unit_cost', 'cost', 'ต้นทุน'] };
const num = x => { const s = String(x == null ? '' : x).trim(); return s === '' ? NaN : Number(s.replace(/[,฿\s]/g, '')); };
const pad = s => String(s).padStart(2, '0');
function dayOf(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  return null;
}
function mapCols(cols, alias) {
  const map = {}, missing = [];
  for (const k in alias) {
    const f = cols.find(c => alias[k].includes(String(c).toLowerCase()));
    if (f) map[k] = f; else missing.push(alias[k][0]);
  }
  return { map, missing };
}
function costMapOf(recs, map) {
  const cm = new Map();
  if (!map.pid || !map.cost) return cm;
  recs.forEach(d => { const c = num(d[map.cost]); if (!isNaN(c)) cm.set(String(d[map.pid] || '').trim(), c); });
  return cm;
}
function buildRows(recs, map, costMap) {
  let bad = 0, unmatched = 0;
  const rows = recs.map(d => {
    const st = String(d[map.status] || '').trim();
    const q = num(d[map.qty]), p = num(d[map.price]);
    let dc = map.disc ? num(d[map.disc]) : 0; if (isNaN(dc)) dc = 0;
    const ok = st === OK, valid = !isNaN(q) && !isNaN(p);
    if (ok && !valid) bad++;
    const net = ok && valid ? q * p * (1 - dc / 100) : 0;
    const day = dayOf(d[map.date]);
    const label = day ? (+day.slice(5, 7)) + '.' + (+day.slice(8, 10)) : null;
    let cost = 0, rc = 0;
    if (ok && valid && costMap && costMap.size) {
      const uc = costMap.get(String(d[map.pid] || '').trim());
      if (uc == null) unmatched++; else { cost = q * uc; rc = net; }
    }
    const tx = k => (map[k] && String(d[map[k]] || '').trim()) || 'ไม่ระบุ';
    return { st, ok, net, cost, rc, day, m: day ? day.slice(0, 7) : null, mega: label && MEGA.has(label) ? label : null,
      ch: tx('channel'), rg: tx('region'), ct: tx('cat'), sh: tx('ship'), pv: tx('prov') };
  });
  return { rows, bad, unmatched };
}
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const margin = (rc, cost) => rc > 0 ? (rc - cost) / rc : null;
function kpis(rows) {
  const okr = rows.filter(x => x.ok), net = sum(okr, x => x.net), n = okr.length;
  return { net, n, aov: n ? net / n : null,
    cancel: rows.length ? rows.filter(x => x.st === CANCEL).length / rows.length : null,
    ret: rows.length ? rows.filter(x => x.st === RET).length / rows.length : null };
}
function megaAnalysis(rows, all) {
  const days = new Map();
  all.forEach(x => { if (x.day) days.set(x.day, x.mega); });
  const megaDays = [...days].filter(([, l]) => l).map(([day, label]) => ({ day, label })).sort((a, b) => a.day < b.day ? -1 : 1);
  const normalDays = [...days.values()].filter(l => !l).length;
  const total = sum(rows, x => x.net);
  const grp = f => { const r = rows.filter(f); return { net: sum(r, x => x.net), rc: sum(r, x => x.rc), cost: sum(r, x => x.cost) }; };
  const mega = grp(x => x.mega), normal = grp(x => !x.mega);
  const events = megaDays.map(e => { const g = grp(x => x.day === e.day); return { ...e, net: g.net, share: total ? g.net / total : null, margin: margin(g.rc, g.cost) }; });
  const normalDayShare = total && normalDays ? normal.net / normalDays / total : null;
  return {
    total, megaDays: megaDays.length, normalDays, events, normalDayShare,
    megaNet: mega.net, normalNet: normal.net,
    share: total ? mega.net / total : null,
    avgMega: megaDays.length ? mega.net / megaDays.length : null,
    avgNormal: normalDays ? normal.net / normalDays : null,
    marginMega: margin(mega.rc, mega.cost), marginNormal: margin(normal.rc, normal.cost),
    marginAll: margin(mega.rc + normal.rc, mega.cost + normal.cost)
  };
}
const topBy = (rows, key) => {
  const r = {}; rows.filter(x => x.ok).forEach(x => { r[x[key]] = (r[x[key]] || 0) + x.net; });
  const e = Object.entries(r).sort((a, b) => b[1] - a[1]); return e[0] || null;
};
const r0 = v => Math.round(v), r1 = v => +(v * 100).toFixed(1);
function buildSummary(rows, all, f) {
  const k = kpis(rows), ma = megaAnalysis(rows, all), s = {};
  s.filter_region = f.region || 'ทั้งหมด';
  s.filter_category = f.category || 'ทั้งหมด';
  s.net_sales_baht = r0(k.net);
  s.completed_orders = k.n;
  if (k.aov != null) s.aov_baht = r0(k.aov);
  if (k.cancel != null) s.cancel_rate_pct = r1(k.cancel);
  if (k.ret != null) s.return_rate_pct = r1(k.ret);
  const ch = topBy(rows, 'ch'); if (ch) s.top_channel = { name: ch[0], net_sales_baht: r0(ch[1]) };
  const pv = topBy(rows, 'pv'); if (pv) s.top_province = { name: pv[0], net_sales_baht: r0(pv[1]) };
  const mo = topBy(rows.filter(x => x.m), 'm'); if (mo) s.best_month = { month: mo[0], net_sales_baht: r0(mo[1]) };
  if (ma.megaDays) {
    const m = { days_count: ma.megaDays, days: MEGA_TEXT };
    if (ma.share != null) m.share_of_sales_pct = r1(ma.share);
    if (ma.avgMega != null) m.avg_daily_sales_baht = r0(ma.avgMega);
    if (ma.avgNormal != null) m.normal_avg_daily_sales_baht = r0(ma.avgNormal);
    if (ma.marginMega != null) m.gross_margin_pct = r1(ma.marginMega);
    if (ma.marginNormal != null) m.normal_gross_margin_pct = r1(ma.marginNormal);
    s.mega_sale = m;
  }
  if (ma.marginAll != null) s.overall_gross_margin_pct = r1(ma.marginAll);
  return s;
}
function leaves(o, out) {
  out = out || [];
  if (o && typeof o === 'object') Object.values(o).forEach(v => leaves(v, out)); else out.push(o);
  return out;
}
const TOKEN = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const tokens = t => (String(t).match(TOKEN) || []).map(s => Number(s.replace(/,/g, '')));
function allowedNumbers(json) {
  const set = new Set();
  leaves(json).forEach(v => { if (typeof v === 'number') set.add(v); else tokens(v).forEach(n => set.add(n)); });
  return set;
}
function checkSummary(text, json) {
  const lines = String(text).split(/\n+/).map(s => s.trim()).filter(Boolean);
  const allowed = allowedNumbers(json), bad = [];
  (String(text).match(TOKEN) || []).forEach(s => { const n = Number(s.replace(/,/g, '')); if (!allowed.has(n)) bad.push(s); });
  return { lines, bad: [...new Set(bad)], okLines: lines.length === 5 };
}
function buildPrompt(json) {
  return 'คุณเป็นผู้ช่วยสรุปผลให้ผู้บริหารร้านออนไลน์ ด้านล่างคือ JSON ตัวเลขสรุป (ไม่มีข้อมูลดิบ)\n' +
    'งาน: เขียนบทสรุปภาษาไทยให้พอดี 5 บรรทัด แต่ละบรรทัดเป็นประโยคเดียว เน้นสิ่งที่ผู้บริหารควรรู้และควรทำ\n' +
    'กฎเข้มงวด:\n' +
    '1) ห้ามมีตัวเลขใดที่ไม่ได้ปรากฏใน JSON — ห้ามคำนวณใหม่ ห้ามปัดเศษ ห้ามเทียบเป็นเท่าหรือส่วนต่าง ห้ามใช้เลขลำดับหรือเลขข้อ\n' +
    '2) ตัวเลขที่ใช้ให้คัดลอกตามค่าใน JSON ทุกประการ (ใส่คอมมาพันได้ และใส่ ฿ หรือ % ได้) ใช้เลขอารบิกเท่านั้น\n' +
    '3) ถ้าค่าไหนไม่มีใน JSON ให้ไม่พูดถึงหรือบอกว่าไม่มีข้อมูล\n' +
    '4) ตอบเฉพาะ 5 บรรทัด ไม่มีหัวข้อ ไม่มีสัญลักษณ์นำหน้า ไม่มีข้อความอื่น\n\n' +
    'JSON:\n' + JSON.stringify(json, null, 1);
}
const MAX_WORDS = 300;
const nf = n => Number(n).toLocaleString('en-US');
function countWords(t) {
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  if (!seg) return String(t).split(/\s+/).filter(Boolean).length;
  let n = 0; for (const s of seg.segment(String(t))) if (s.isWordLike) n++;
  return n;
}
const MAX_SECTION_WORDS = 100;
function buildReport(j) {
  const S = [], m = j.mega_sale, B = x => '฿' + nf(x);
  const add = (h, bullets) => { bullets = bullets.filter(Boolean); if (bullets.length) S.push({ h, bullets }); };
  add('ขอบเขตข้อมูล', ['ภูมิภาค ' + j.filter_region + ' หมวดสินค้า ' + j.filter_category, 'นับเฉพาะจัดส่งสำเร็จ ไม่รวมค่าส่ง']);
  add('ยอดขาย', ['ยอดขายสุทธิ ' + B(j.net_sales_baht), 'คำสั่งซื้อที่จัดส่งสำเร็จ ' + nf(j.completed_orders) + ' รายการ', j.aov_baht != null && 'เฉลี่ยคำสั่งซื้อละ ' + B(j.aov_baht)]);
  add('ยกเลิกและคืนสินค้า', [j.cancel_rate_pct != null && 'อัตรายกเลิก ' + j.cancel_rate_pct + '%', j.return_rate_pct != null && 'อัตราคืนสินค้า ' + j.return_rate_pct + '%']);
  add('ช่องทางและพื้นที่', [j.top_channel && 'ช่องทาง' + j.top_channel.name + ' ยอดสูงสุด ' + B(j.top_channel.net_sales_baht), j.top_province && 'จังหวัด' + j.top_province.name + ' ยอดสูงสุด ' + B(j.top_province.net_sales_baht)]);
  add('ช่วงเวลา', [j.best_month && 'เดือน ' + j.best_month.month + ' ขายดีที่สุด ' + B(j.best_month.net_sales_baht)]);
  if (m) add('วันเมกะเซล', ['วันเมกะเซล ' + m.days_count + ' วัน (' + m.days + ')', m.share_of_sales_pct != null && 'สัดส่วนยอดขาย ' + m.share_of_sales_pct + '% ของยอดรวม',
    m.avg_daily_sales_baht != null && 'เฉลี่ยวันละ ' + B(m.avg_daily_sales_baht), m.normal_avg_daily_sales_baht != null && 'วันปกติเฉลี่ยวันละ ' + B(m.normal_avg_daily_sales_baht)]);
  const mg = m && m.gross_margin_pct != null && m.normal_gross_margin_pct != null;
  add('กำไรขั้นต้น', [mg && 'วันเมกะเซล ' + m.gross_margin_pct + '% วันปกติ ' + m.normal_gross_margin_pct + '%', j.overall_gross_margin_pct != null && 'ภาพรวม ' + j.overall_gross_margin_pct + '%']);
  if (mg && m.gross_margin_pct < m.normal_gross_margin_pct)
    add('ข้อเสนอแนะ: กำไรขั้นต้น', ['เหตุ: กำไรขั้นต้นวันเมกะเซล ' + m.gross_margin_pct + '% ต่ำกว่าวันปกติ ' + m.normal_gross_margin_pct + '% น่าจะมาจากส่วนลดที่ลึกกว่า', 'ผล: ยอดเพิ่มแต่กำไรต่อบาทลดลง', 'ข้อเสนอ: จำกัดส่วนลด เลือกลดเฉพาะสินค้ากำไรสูง']);
  if (m && m.avg_daily_sales_baht != null && m.normal_avg_daily_sales_baht != null && m.avg_daily_sales_baht > m.normal_avg_daily_sales_baht)
    add('ข้อเสนอแนะ: แคมเปญเมกะเซล', ['เหตุ: วันเมกะเซลขายเฉลี่ยวันละ ' + B(m.avg_daily_sales_baht) + ' สูงกว่าวันปกติ ' + B(m.normal_avg_daily_sales_baht), 'ผล: แคมเปญดึงยอดได้จริง', 'ข้อเสนอ: คงแคมเปญ แต่ประเมินกำไรควบคู่ยอดขาย']);
  if (j.cancel_rate_pct != null && j.return_rate_pct != null)
    add('ข้อเสนอแนะ: ยกเลิกและคืนสินค้า', ['เหตุ: อัตรายกเลิก ' + j.cancel_rate_pct + '% และคืนสินค้า ' + j.return_rate_pct + '%', 'ผล: ยอดขายสูญเปล่า', 'ข้อเสนอ: ตรวจสาเหตุหลัก เช่น สต็อกและเวลาจัดส่ง แล้วแก้ที่ต้นเหตุ']);
  if (j.top_channel && j.top_province)
    add('ข้อเสนอแนะ: การกระจายยอด', ['เหตุ: ยอดกระจุกที่ช่องทาง' + j.top_channel.name + ' และจังหวัด' + j.top_province.name, 'ผล: เสี่ยงพึ่งพามากเกินไป', 'ข้อเสนอ: ขยายช่องทางอื่นและพื้นที่ยอดต่ำ']);
  const title = 'บทสรุปผู้บริหาร';
  S.forEach(s => { s.words = countWords(s.h + ' ' + s.bullets.join(' ')); });
  const words = countWords(title + ' ' + S.map(s => s.h + ' ' + s.bullets.join(' ')).join(' '));
  const ok = words <= MAX_WORDS && S.every(s => s.words <= MAX_SECTION_WORDS);
  return { title, sections: S, words, ok, maxSection: Math.max(...S.map(s => s.words)) };
}
function reportText(r) { return [r.title, ...r.sections.map(s => s.h + ' ' + s.bullets.join(' '))].join('\n'); }
// pages: [{jpeg: Uint8Array, lines: [{t, x, y, size}]}]; wmap: char -> width per 1000 em. Visible text is the JPEG; the
// invisible (render mode 3) text layer makes the PDF selectable / copyable / searchable.
function makePdf(pages, w, h, PW, PH, wmap) {
  wmap = wmap || {};
  const enc = new TextEncoder(), chunks = [], offs = [];
  let len = 0;
  const push = b => { if (typeof b === 'string') b = enc.encode(b); chunks.push(b); len += b.length; };
  const obj = (id, fn) => { offs[id] = len; push(id + ' 0 obj\n'); fn(); push('\nendobj\n'); };
  const cid = new Map(), chars = [];
  pages.forEach(p => (p.lines || []).forEach(l => { for (const ch of l.t) if (!cid.has(ch)) { cid.set(ch, chars.length + 1); chars.push(ch); } }));
  const hex4 = n => n.toString(16).toUpperCase().padStart(4, '0');
  const u16 = ch => { let s = ''; for (let i = 0; i < ch.length; i++) s += hex4(ch.charCodeAt(i)); return s; };
  const n = pages.length, kids = [];
  const P0 = 7;
  for (let i = 0; i < n; i++) kids.push((P0 + 3 * i) + ' 0 R');
  push('%PDF-1.4\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>'));
  obj(3, () => push('<< /Type /Font /Subtype /Type0 /BaseFont /SXThai /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>'));
  obj(4, () => {
    const W = chars.map((ch, i) => (i + 1) + ' [' + Math.round(wmap[ch] != null ? wmap[ch] : 500) + ']').join(' ');
    push('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SXThai /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 500 /W [' + W + '] /CIDToGIDMap /Identity >>');
  });
  obj(5, () => push('<< /Type /FontDescriptor /FontName /SXThai /Flags 4 /FontBBox [0 -300 1000 1000] /ItalicAngle 0 /Ascent 900 /Descent -300 /CapHeight 700 /StemV 80 >>'));
  obj(6, () => {
    let cm = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < chars.length; i += 100) {
      const part = chars.slice(i, i + 100);
      cm += part.length + ' beginbfchar\n' + part.map((ch, k) => '<' + hex4(i + k + 1) + '> <' + u16(ch) + '>').join('\n') + '\nendbfchar\n';
    }
    cm += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    push('<< /Length ' + enc.encode(cm).length + ' >>\nstream\n' + cm + '\nendstream');
  });
  pages.forEach((pg, i) => {
    const po = P0 + 3 * i, ct = po + 1, im = po + 2;
    obj(po, () => push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> /Font << /F1 3 0 R >> >> /Contents ' + ct + ' 0 R >>'));
    let cs = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q\nBT\n3 Tr\n';
    (pg.lines || []).forEach(l => {
      const hx = Array.from(l.t).map(ch => hex4(cid.get(ch))).join('');
      cs += '/F1 ' + l.size + ' Tf 1 0 0 1 ' + l.x.toFixed(2) + ' ' + (PH - l.y - l.size * 0.85).toFixed(2) + ' Tm <' + hx + '> Tj\n';
    });
    cs += 'ET';
    const cb = enc.encode(cs);
    obj(ct, () => { push('<< /Length ' + cb.length + ' >>\nstream\n'); push(cb); push('\nendstream'); });
    obj(im, () => { push('<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.jpeg.length + ' >>\nstream\n'); push(pg.jpeg); push('\nendstream'); });
  });
  const x = len, total = P0 + 3 * n;
  push('xref\n0 ' + total + '\n0000000000 65535 f \n');
  for (let i = 1; i < total; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  push('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n');
  const out = new Uint8Array(len); let p = 0;
  chunks.forEach(c => { out.set(c, p); p += c.length; });
  return out;
}
g.SXCALC = { MAX_WORDS, MAX_SECTION_WORDS, countWords, buildReport, reportText, makePdf, OK, CANCEL, RET, MEGA_TEXT, ALIAS, PALIAS, mapCols, costMapOf, buildRows, kpis, megaAnalysis, buildSummary, leaves, checkSummary, buildPrompt, dayOf, num };
if (typeof module !== 'undefined' && module.exports) module.exports = g.SXCALC;
})(typeof window !== 'undefined' ? window : globalThis);
