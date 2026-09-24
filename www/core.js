// Core valuation logic, copied unchanged from the browser extension (content.js).
const state = { win: "3y", mode: "m24" };
  const FA = { "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9","٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9" };
  const en = s => s.replace(/[۰-۹٠-٩]/g, c => FA[c]);
  const NUM = s => { const m = en(s).replace(/[٬,،\s]/g, "").match(/\d+/); return m ? parseInt(m[0], 10) : NaN; };
  const norm = s => (s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\s]/g, "").trim();
  const NB = {}; for (const [k, v] of Object.entries(DFP_NEIGHBORHOODS)) NB[norm(k)] = v;
  const fa = n => Math.round(n).toLocaleString("fa-IR");
  const jyNow = () => { const d = new Date(); return d.getFullYear() - ((d.getMonth() > 2 || (d.getMonth() === 2 && d.getDate() >= 21)) ? 621 : 622); };


  function money(v) {
    const s = en(String(v || ""));
    if (/مجانی|رایگان/.test(s)) return 0;
    if (/توافقی/.test(s)) return NaN;
    let n = parseFloat(s.replace(/[٫\/]/g, ".").replace(/[٬,،\s]/g, "").replace(/[^\d.]/g, "")); if (!(n >= 0)) return NaN;
    if (/میلیارد/.test(s)) n *= 1e9; else if (/میلیون/.test(s)) n *= 1e6;
    return n;
  }

  function parkingCount(text) {
    const t = en(text || "").replace(/\u200c/g, " ");
    const W = { "یک": 1, "دو": 2, "سه": 3, "چهار": 4, "1": 1, "2": 2, "3": 3, "4": 4 };
    let best = 0, m;
    const pats = [
      /(یک|دو|سه|چهار|[1-4])\s*(?:عدد|واحد|تا|جای|جایگاه|فقره)?\s*(?:پارکینگ|پارک)/g,
      /پارکینگ\s*[:：]?\s*(دو|سه|چهار|[2-4])\s*(?:عدد|واحد|تا|جای|جایگاه)?(?![0-9])/g,
    ];
    for (const re of pats) while ((m = re.exec(t))) best = Math.max(best, W[m[1]] || 0);
    if (/پارکینگ\s*(?:های)?\s*(?:دوم|مجزا\s*دوم)/.test(t)) best = Math.max(best, 2);
    if (/پارکینگ\s*سوم/.test(t)) best = Math.max(best, 3);
    return best >= 2 ? best : 0;                       // only trust 2+; "has parking" comes from the ad fields
  }

  function floorNum(v) {
    const s = en(String(v));
    if (/زیر\s*همکف/.test(s)) return -1;
    if (/همکف/.test(s)) return 0;
    const m = s.match(/-?\d+/); return m ? parseInt(m[0], 10) : null;
  }

  function lookup(hood) {
    const h = norm(hood); if (!h) return 0;
    if (NB[h]) return NB[h];
    let best = 0, len = 0;
    for (const k in NB) if ((h.includes(k) || k.includes(h)) && k.length > len) { best = NB[k]; len = k.length; }
    return best;
  }

  const MODES = { spot: "لحظه‌ای", m1: "میانگین ۱ ماه", m3: "میانگین ۳ ماه", m12: "میانگین ۱۲ ماه", m24: "میانگین ۲۴ ماه" };
  function bands(win) { return DFP_BANDS.w[win].m[(state && state.mode) || "m24"].d; }


  function fairRange(ad, dist, win, q) {
    const W = { d: bands(win) }, C = DFP_COEF;
    const nb = ad.slug && C.nb[ad.slug];
    const age = ad.year ? jyNow() - ad.year : null;
    let k = 1, parts = [];
    if (age !== null) { for (const [lo, hi, f] of C.age) if (age >= lo && age <= hi) k *= f; parts.push(`بنای ${fa(age)} ساله`); } else k *= C.age_na;
    if (ad.floor !== null && ad.floor !== undefined) {                 // +2.5% per floor above the 1st (normalized to the data's average floor)
      const R = C.floor_rule; k *= Math.pow(1 + R.step, ad.floor - R.base) / R.norm; parts.push(`طبقه ${fa(ad.floor)}`);
    }
    const bin = (tbl, x) => { for (const [lo, hi, f] of tbl) if (x >= lo && x <= hi) return f; return 1; };
    const pk = ad.area > 0 ? bin(C.parking_by_size, ad.area) : 1.1;          // first parking: worth more in bigger units
    if (ad.area > 0) k *= bin(C.size, ad.area);
    // Parking: the standard unit HAS parking (2 spaces from 150 m2 up). Missing spaces are deducted, extra ones added.
    const std = ad.area >= 150 ? 2 : 1;
    const userSet = q && q.npark !== "" && q.npark !== undefined;
    const fromDesc = !userSet && ad.parking !== false && ad.npark >= 2;
    const np = userSet ? +q.npark : ad.parking === false ? 0 : fromDesc ? ad.npark : std;
    const pf0 = k;
    if (np >= 1) k *= pk;                                                    // first space (size-dependent, from data)
    const xm2 = (Math.max(np, 1) - std) * C.extra_parking_m2;
    if (ad.area > 0) k *= 1 + xm2 / ad.area;                               // each space beyond/below standard ~ 6.5 m2
    const pDelta = Math.round((k / (pf0 * pk) - 1) * 100);                 // vs. standard parking
    parts.push(np === 0 ? `بدون پارکینگ (${fa(Math.abs(pDelta))}٪ کسر)` : `${fa(np)} پارکینگ` + (np === std ? "" : ` (${pDelta > 0 ? "+" : "−"}${fa(Math.abs(pDelta))}٪)`) + (fromDesc ? " طبق توضیحات آگهی" : ""));
    for (const f of ["elevator", "warehouse"]) k *= ad[f] === true ? C[f] : ad[f] === false ? 1 : Math.pow(C[f], C.share[f]);
    const am = [["elevator", "آسانسور"], ["warehouse", "انباری"]].map(([f, n]) => ad[f] === false ? "بدون " + n : ad[f] ? n : null).filter(Boolean);
    if (am.length) parts.push(am.join("، "));
    const Q = C.quality, QN = { top: "عالی", mid: "متوسط", weak: "ضعیف" };
    let lo = nb ? nb.lo : 0, hi = nb ? nb.hi : 0;
    for (const [key, label] of [["street", "موقعیت"], ["plan", "نقشه"]]) {
      const v = q && q[key];
      if (v && Q[key][v]) { k *= Q[key][v]; parts.push(`${label} ${QN[v]}`); lo = 1 - (1 - lo) * Q.shrink; hi = 1 + (hi - 1) * Q.shrink; }
    }
    const dd = q && q.deed && C.deed && C.deed[q.deed];
    if (dd && q.deed !== "single") { k *= dd[0]; parts.push(dd[1]); }
    if (nb) {
      const mid = W.d[0][2] * Math.exp(nb.fe) * k;
      return { lo: mid * lo, mid, hi: mid * hi, how: `محله ${ad.hood || ad.slug} (${fa(nb.n)} آگهی مرجع)، ` + parts.join("، ") };
    }
    const [, p25, p50, p75] = W.d[dist], kd = dd && q.deed !== "single" ? dd[0] : 1;
    return { lo: p25 * kd, mid: p50 * kd, hi: p75 * kd, how: (dist ? `سطح منطقه ${fa(dist)}` : "سطح کل شهر") + " (داده محله کافی نیست)" };
  }

  function rentIdx(ym) {
    const P = DFP_RENTIDX.pts, mi = x => Math.floor(x / 100) * 12 + (x % 100);
    if (ym >= P[P.length - 1][0]) return P[P.length - 1][1];
    if (ym < P[0][0]) { const I = DFP_INFL, y = Math.floor(ym / 100); return I.years[y] ? P[0][1] * I.years[y][1] / I.years[1396][1] : null; }
    for (let i = 1; i < P.length; i++) if (ym <= P[i][0]) {
      const [a, va] = P[i - 1], [b, vb] = P[i], t = (mi(ym) - mi(a)) / (mi(b) - mi(a));
      return Math.exp(Math.log(va) + (Math.log(vb) - Math.log(va)) * t);
    }
    return null;
  }

  function rentRange(ad, q) {
    const C = DFP_RENT, nb = ad.slug && C.nb[ad.slug], parts = [];
    const bin = (tbl, x) => { for (const [lo, hi, f] of tbl) if (x >= lo && x <= hi) return f; return 1; };
    const age = ad.year ? jyNow() - ad.year : null;
    let k = 1;
    if (age !== null) { k *= bin(C.age, age); parts.push(`بنای ${fa(age)} ساله`); } else k *= C.age_na;
    if (ad.floor !== null && ad.floor !== undefined) { const R = DFP_COEF.floor_rule; k *= Math.pow(1 + R.step, ad.floor - R.base) / R.norm; parts.push(`طبقه ${fa(ad.floor)}`); }
    if (ad.area > 0) k *= bin(C.size, ad.area);
    const pk = ad.area > 0 ? bin(C.parking_by_size, ad.area) : 1.1;
    k *= ad.parking === false ? 1 : pk; parts.push(ad.parking === false ? "بدون پارکینگ" : "پارکینگ");
    for (const f of ["elevator", "warehouse"]) k *= ad[f] === true ? C[f] : ad[f] === false ? 1 : Math.pow(C[f], C.share[f]);
    const Q = DFP_COEF.quality; let lo = nb ? nb.lo : 0.85, hi = nb ? nb.hi : 1.15;
    for (const [key, label] of [["street", "موقعیت"], ["plan", "نقشه"]]) {
      const v = q && q[key]; if (v && Q[key][v]) { k *= Q[key][v]; lo = 1 - (1 - lo) * Q.shrink; hi = 1 + (hi - 1) * Q.shrink; }
    }
    const level = C.city_epm_1403 * rentIdx(DFP_RENTIDX.now) / rentIdx(DFP_RENTIDX.sample);   // 1403 level carried to today by the rent index
    const mid = level * (nb ? Math.exp(nb.fe) : 1) * k;                     // toman per m2 per month (equivalent)
    return { lo: mid * lo, mid, hi: mid * hi, how: (nb ? `محله ${ad.hood || ad.slug} (${fa(nb.n)} آگهی اجاره مرجع)` : "سطح کل شهر (داده محله کافی نیست)") + "، " + parts.join("، ") };
  }

  const MON = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];


  function histValue(ad, dist, q, ym) {
    const H = DFP_HIST, i = H.months.indexOf(ym); if (i < 0) return null;
    const refIdx = H.ref.map(r => H.months.indexOf(r));
    const avg = (arr) => { const v = refIdx.map(j => arr[j]).filter(x => x); return v.length ? v.reduce((a, b) => a + b) / v.length : null; };
    const D = dist ? H.dist[dist] : null;
    const useD = D && D[i] && avg(D);
    const S = useD ? D : H.city, sRef = avg(S);
    const nb = ad.slug && DFP_COEF.nb[ad.slug];
    if (!nb) return useD ? { ppm: D[i], usd: H.usd[i], how: `میانگین منطقه ${fa(dist)}`, est: false } : null;
    const ratio = fairRange(ad, dist, "3y", q).mid / bands("3y")[0][2];   // unit vs city median
    const vRef = avg(H.city) * ratio;
    return { ppm: vRef * S[i] / sRef, usd: H.usd[i], est: !useD && H.est.includes(ym),
             how: useD ? `روند منطقه ${fa(dist)}` : "روند کل شهر" };
  }

// ---- commercial / old-house valuation (same structure as apartments; location quality from the category's own spread)
function comQuality(C, v) { const m = { top: C.ghi, good: Math.sqrt(C.ghi), mid: 1, weak: Math.sqrt(C.glo), vweak: C.glo }; return m[v] || 1; }
function cityOfficial1403() {
  const H = DFP_HIST, v = H.ref.map(r => H.city[H.months.indexOf(r)]).filter(x => x);
  return v.reduce((a, b) => a + b, 0) / v.length;
}
function comLevelNow(C, rate) {           // today's level relative to 1403: housing fair-price path (sale) or rent index (rent)
  if (C.kind === "rent") return rentIdx(DFP_RENTIDX.now) / rentIdx(DFP_RENTIDX.sample);
  return rate > 0 ? bands("3y")[0][2] * rate / cityOfficial1403() : NaN;
}
function comRange(ad, cat, q, rate) {
  const C = DFP_COM[cat], nb = ad.slug && C.nb[ad.slug], parts = [];
  const bin = (tbl, x) => { for (const [lo, hi, f] of tbl) if (x >= lo && x <= hi) return f; return 1; };
  const size = C.unit === "land" ? (ad.land || ad.area) : ad.area;
  let k = size > 0 ? bin(C.size, size) : 1;
  if (C.age) { const age = ad.year ? jyNow() - ad.year : null; if (age !== null) { k *= bin(C.age, age); parts.push(`بنای ${fa(age)} ساله`); } else k *= C.age_na; }
  if (C.floor) { if (ad.floor !== null && ad.floor !== undefined) { k *= bin(C.floor, ad.floor); parts.push(`طبقه ${fa(ad.floor)}`); } else k *= C.floor_na; }
  for (const f of ["elevator", "parking", "warehouse", "deed"]) if (C[f]) k *= ad[f] === true ? C[f] : ad[f] === false ? 1 : Math.pow(C[f], C.share[f]);
  let lo = nb ? nb.lo : C.glo, hi = nb ? nb.hi : C.ghi;
  const v = q && q.street; if (v && v !== "") { k *= comQuality(C, v); lo = 1 - (1 - lo) * 0.6; hi = 1 + (hi - 1) * 0.6; parts.push("موقعیت " + ({ top: "عالی", good: "خوب", mid: "متوسط", weak: "ضعیف", vweak: "خیلی ضعیف" })[v]); }
  const dd = C.kind === "sale" && q && q.deed && DFP_COEF.deed[q.deed];
  if (dd && q.deed !== "single") { k *= dd[0]; parts.push(dd[1]); }
  const mid = C.city_1403 * comLevelNow(C, rate) * (nb ? Math.exp(nb.fe) : 1) * k;
  return { lo: mid * lo, mid, hi: mid * hi, size, unit: C.unit, kind: C.kind,
           how: (nb ? `محله ${ad.hood || ad.slug} (${fa(nb.n)} آگهی ${C.label} مرجع)` : `سطح کل تهران برای ${C.label} (داده محله کافی نیست)`) + (parts.length ? "، " + parts.join("، ") : "") };
}
function comPast(ad, cat, q, rate, y) {    // same unit in year y (sale: along Tehran housing prices; rent: along the rent index)
  const f = comRange(ad, cat, q, rate), C = DFP_COM[cat];
  if (C.kind === "rent") return f.mid * rentIdx(y * 100 + 6) / rentIdx(DFP_RENTIDX.now);
  const H = DFP_HIST, v = H.months.filter(m => Math.floor(m / 100) === y).map(m => H.city[H.months.indexOf(m)]);
  if (!v.length) return NaN;
  const cityY = v.reduce((a, b) => a + b, 0) / v.length;
  return f.mid / (bands("3y")[0][2] * rate) * cityY;
}
