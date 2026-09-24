// ---------- helpers
const $ = q => document.querySelector(q);
const FX_URL = "https://raw.githubusercontent.com/kooroshkz/Dollar-Rial-Toman-Live-Price-Dataset/main/data/Dollar_Rial_Price_Dataset.csv";
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const M = x => fa(x / 1e6);
const B = x => (x / 1e9).toLocaleString("fa-IR", { maximumFractionDigits: 2 });

// ---------- dollar rate (spot + moving averages), cached 6h
async function getRate() {
  const c = store.get("fx", null);
  if (c && Date.now() - c.t < 6 * 3600e3) return c;
  try {
    const rows = (await (await fetch(FX_URL, { cache: "no-store" })).text()).split("\n").slice(1)
      .map(l => l.split(",")).filter(r => r.length > 7 && +r[3] > 0)
      .map(r => ({ close: +r[3] / 10, g: new Date(r[6].replace(/\//g, "-")), j: r[7] }));
    const last = rows[0].g.getTime();
    const avg = d => { const v = rows.filter(r => last - r.g.getTime() < d * 864e5).map(r => r.close); return Math.round(v.reduce((a, b) => a + b, 0) / v.length); };
    const v = { spot: Math.round(rows[0].close), m1: avg(30), m3: avg(91), m12: avg(365), m24: avg(730), date: rows[0].j, t: Date.now() };
    store.set("fx", v); return v;
  } catch (e) { return c ? { ...c, stale: true } : null; }
}

// ---------- link -> Divar token
function extractToken(text) {
  const m = String(text || "").match(/divar\.ir\/v\/(?:[^\/\s?#]+\/)?([A-Za-z0-9_-]{8})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}

// ---------- Divar post JSON -> ad (robust: scans every title/value pair in the JSON, then the description)
function walk(o, cb) { if (o && typeof o === "object") { cb(o); for (const k in o) walk(o[k], cb); } }
function numFromText(txt, re) {                    // "رهن ۵۰۰ میلیون" / "اجاره: ۱۵ م" / "ودیعه ۱٫۵ میلیارد"
  const m = en(txt).replace(/[٫\/](?=\d)/g, ".").match(re); if (!m) return NaN;
  let n = parseFloat(m[1].replace(/[٬,،\s]/g, "")); if (!(n >= 0)) return NaN;
  const u = m[2] || "";
  if (/میلیارد/.test(u)) n *= 1e9; else if (/میلیون|^م$/.test(u)) n *= 1e6; else if (n < 5000) n *= 1e6;   // bare small number = million
  return n;
}
function parsePost(P) {
  const ad = { title: "", type: null, ppm: NaN, total: NaN, area: null, year: null, floor: null, deposit: NaN, rent: NaN,
               elevator: null, parking: null, warehouse: null, npark: 0, slug: "", hood: "", city: "", src: "" };
  const W = P.webengage || {};
  ad.slug = W.district || ""; ad.city = W.city || "";
  const cat = String(W.category || W.cat_3 || W.cat3 || "");
  const wi = P.seo && P.seo.web_info; if (wi) ad.hood = wi.district_persian || "";
  let desc = "";
  walk(P, o => {
    if (o.widget_type === "DESCRIPTION_ROW" && o.data && o.data.text) desc += "\n" + o.data.text;
    if (!ad.title && o.widget_type && /TITLE/.test(o.widget_type) && o.data && o.data.title) ad.title = o.data.title;
    const k = String(o.title || o.label || o.key || "").trim(), v = o.value ?? o.subtitle ?? o.text;
    if (!k || v === undefined || typeof v === "object") return;
    if (/^قیمت هر متر/.test(k)) ad.ppm = NUM(String(v));
    else if (/^قیمت کل|^قیمت$/.test(k)) ad.total = money(v);
    else if (/^(ودیعه|رهن)/.test(k)) { ad.type = "rent"; const m = money(v); if (m >= 0) ad.deposit = m; }
    else if (/^اجار/.test(k)) { ad.type = "rent"; const m = money(v); if (m >= 0) ad.rent = m; }
    else if (/^متراژ/.test(k)) { const a = NUM(String(v)); if (a > 0) ad.area = a; }
    else if (/^ساخت/.test(k)) { const y = NUM(String(v)); if (y > 1300 && y < 1500) ad.year = y; }
    else if (/^طبقه/.test(k)) ad.floor = floorNum(v);
  });
  walk(P, o => {                                     // amenities rows: {title:"آسانسور"} / {title:"آسانسور ندارد"}
    const k = String(o.title || ""); if (!k || k.length > 20) return;
    for (const [key, word] of [["elevator", "آسانسور"], ["parking", "پارکینگ"], ["warehouse", "انباری"]])
      if (k.includes(word)) ad[key] = !(k.includes("ندارد") || o.available === false || o.disabled === true);
  });
  const t = ad.title + " " + desc;
  if (!ad.type) ad.type = /rent|اجاره|رهن/.test(cat + " " + ad.title) ? "rent" : /sell|فروش/.test(cat + " " + ad.title) || ad.ppm > 0 || ad.total > 0 ? "sale" : null;
  if (!ad.type && /ودیعه|رهن|اجاره/.test(desc)) ad.type = "rent";
  if (!ad.type && /(قیمت|فروش)/.test(desc)) ad.type = "sale";
  if (ad.type === "rent") {                          // fall back to the description for missing numbers
    if (!(ad.deposit >= 0)) { ad.deposit = numFromText(t, /(?:رهن|ودیعه)\s*(?:کامل)?\s*[:：]?\s*([\d.,٬]+)\s*(میلیارد|میلیون|م(?=\s|$))?/); if (ad.deposit >= 0) ad.src = "desc"; }
    if (!(ad.rent >= 0)) { const r = numFromText(t, /اجاره(?:\s*ماهانه|\s*ماهیانه)?\s*[:：]?\s*([\d.,٬]+)\s*(میلیارد|میلیون|م(?=\s|$))?/); if (r >= 0) { ad.rent = r; ad.src = "desc"; } }
    if (ad.deposit >= 0 && !(ad.rent >= 0)) ad.rent = 0;
    if (ad.rent >= 0 && !(ad.deposit >= 0)) ad.deposit = 0;
  }
  if (ad.type === "sale") {
    if (!(ad.ppm > 0) && ad.total > 0 && ad.area > 0) ad.ppm = ad.total / ad.area;
    if (!(ad.ppm > 0) && ad.area > 0) { const tot = numFromText(t, /(?:قیمت|فی)\s*(?:کل)?\s*[:：]?\s*([\d.,٬]+)\s*(میلیارد|میلیون)/); if (tot > 1e8) { ad.ppm = tot / ad.area; ad.src = "desc"; } }
  }
  ad.npark = parkingCount(desc);
  if (!ad.area) { const a = en(t).match(/(\d{2,4})\s*متر/); if (a) ad.area = +a[1]; }
  return ad;
}

// ---------- gauge (semicircle): zones below / fair / above, needle at the ad
function gauge(lo, mid, hi, val, fmt) {
  const known = val > 0;
  const min = mid * 0.6, max = mid * 1.5, cl = x => Math.max(min, Math.min(max, x));
  const ang = x => Math.PI * (1 - (cl(x) - min) / (max - min));          // 180deg (left) .. 0deg (right)
  const pt = (a, r) => [150 + r * Math.cos(a), 150 - r * Math.sin(a)];
  const arc = (a0, a1, col) => { const [x0, y0] = pt(a0, 110), [x1, y1] = pt(a1, 110);
    return `<path d="M${x0},${y0} A110,110 0 0 1 ${x1},${y1}" stroke="${col}" stroke-width="26" fill="none"/>`; };
  const [nx, ny] = pt(ang(known ? val : mid), 92);
  return `<svg viewBox="0 -14 300 190" role="img" aria-label="گیج قیمت منصفانه">
    ${arc(Math.PI, ang(lo), "var(--z1)")}${arc(ang(lo), ang(hi), "var(--z2)")}${arc(ang(hi), 0, "var(--z3)")}
    ${known ? `<line x1="150" y1="150" x2="${nx}" y2="${ny}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>` : ""}
    <circle cx="150" cy="150" r="8" fill="var(--ink)"/>
    <text x="30" y="172" font-size="11" fill="var(--muted)" text-anchor="middle">${fmt(min)}</text>
    <text x="150" y="4" font-size="12" fill="var(--muted)" text-anchor="middle">میانه ${fmt(mid)}</text>
    <text x="270" y="172" font-size="11" fill="var(--muted)" text-anchor="middle">${fmt(max)}</text></svg>`;
}
function verdict(val, f) {
  if (!(val > 0)) return ["قیمت آگهی نامشخص است — ارزش منصفانه در پایین آمده", "fair"];
  const pct = Math.round((val / f.mid - 1) * 100);
  if (val < f.lo) return [`زیر رنج منصفانه — ${fa(Math.abs(pct))}٪ ارزان‌تر از میانه`, "below"];
  if (val > f.hi) return [`بالای رنج منصفانه — ${fa(pct)}٪ گران‌تر از میانه`, "above"];
  return ["در رنج منصفانه", "fair"];
}
const opts = (list, sel) => list.map(([v, n]) => `<option value="${v}"${String(v) === String(sel) ? " selected" : ""}>${n}</option>`).join("");
const QOPT = [["", "نامشخص"], ["top", "عالی"], ["good", "خوب"], ["mid", "متوسط"], ["weak", "ضعیف"], ["vweak", "خیلی ضعیف"]];

// ---------- main
let AD = null, TOKEN = null, FX = null;
async function analyze(text) {
  const token = extractToken(text);
  const out = $("#report");
  if (!token) { out.innerHTML = `<p class="err">لینک آگهی دیوار پیدا نشد. لینک را از دکمه «اشتراک‌گذاری» آگهی در دیوار بفرستید یا کپی کنید.</p>`; return; }
  out.innerHTML = `<p class="muted">در حال دریافت آگهی…</p>`;
  try {
    const r = await fetch(`https://api.divar.ir/v8/posts-v2/web/${token}`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(r.status === 404 ? "این آگهی حذف شده یا منقضی شده است." : "خطای دیوار: " + r.status);
    AD = parsePost(await r.json()); TOKEN = token;
  } catch (e) { out.innerHTML = `<p class="err">${e.message || "اتصال به دیوار برقرار نشد."}</p>`; return; }
  if (!AD.type) { out.innerHTML = `<p class="err">نوع آگهی (فروش یا اجاره آپارتمان) تشخیص داده نشد.</p>`; return; }
  if (AD.city && AD.city !== "tehran") { out.innerHTML = `<p class="err">فعلاً فقط آگهی‌های شهر تهران پشتیبانی می‌شوند.</p>`; return; }
  FX = FX || await getRate();
  render();
}

function render() {
  const ad = AD, q = store.get("q:" + TOKEN, { street: "", plan: "", npark: "" });
  const dist = store.get("over", {})[norm(ad.hood)] ?? lookup(ad.hood);
  const head = `<h2>${ad.title || "آگهی دیوار"}</h2><p class="muted">${[ad.hood, ad.area && fa(ad.area) + " متر", ad.year && "ساخت " + fa(ad.year).replace(/٬/g, ""), ad.floor !== null && "طبقه " + fa(ad.floor)].filter(Boolean).join(" · ")}</p>`;
  const qrow = `<div class="grid">
      <label>موقعیت در محله<select data-q="street">${opts(QOPT, q.street)}</select></label>
      <label>نقشه واحد<select data-q="plan">${opts(QOPT, q.plan)}</select></label>
      ${ad.type === "sale" ? `<label>تعداد پارکینگ<select data-q="npark">${opts([["", "طبق آگهی"], [0, "ندارد"], [1, "۱"], [2, "۲"], [3, "۳"]], q.npark)}</select></label>` : ""}
    </div>`;
  let body = "";
  if (ad.type === "sale") {
    state.mode = store.get("mode", "m24"); state.win = store.get("win", "3y");
    const manual = store.get("fxManual", 0), rate = manual || (FX && FX[state.mode]) || 0;
    if (!(rate > 0)) { $("#report").innerHTML = head + `<p class="err">نرخ دلار دریافت نشد؛ در تنظیمات دستی وارد کنید.</p>`; return; }
    const f = fairRange(ad, dist, state.win, q), usd = ad.ppm / rate, [vt, vc] = verdict(usd, f);
    const rr = store.get("rentRate", DFP_RENT.rate), rentMid = ad.area > 0 ? rentRange(ad, q).mid * ad.area : NaN;
    body = `${gauge(f.lo, f.mid, f.hi, usd, x => fa(x * rate / 1e6))}
      <p class="verdict ${vc}">${vt}</p>
      <div class="fair"><span>ارزش منصفانه</span><b>${ad.area ? B(f.mid * rate * ad.area) + " میلیارد" : M(f.mid * rate) + " میلیون هر متر"}</b>
        <small>${ad.area ? "هر متر " + M(f.mid * rate) + " میلیون" : ""}</small></div>
      <div class="cards">
        <div><span>قیمت آگهی</span><b>${ad.ppm > 0 ? (ad.area ? B(ad.ppm * ad.area) + " میلیارد — " : "") + "هر متر " + M(ad.ppm) + " میلیون" + (ad.src ? " (از توضیحات)" : "") : "نامشخص"}</b></div>
        <div><span>بازه منصفانه</span><b>${ad.area ? B(f.lo * rate * ad.area) + " تا " + B(f.hi * rate * ad.area) + " میلیارد" : M(f.lo * rate) + " تا " + M(f.hi * rate) + " میلیون هر متر"}</b></div>
        ${rentMid > 0 ? `<div><span>رهن کامل منصفانه همین واحد</span><b>${B(rentMid / rr)} میلیارد <small>(یا اجاره ماهانه معادل ${M(rentMid)} میلیون)</small></b></div>` : ""}
      </div>
      <p class="muted small">مبنا: ${f.how}</p>
      ${qrow}
      <div class="grid">
        <label>بازه<select id="win">${opts([["3y", "۳ سال اخیر"], ["7y", "۷ سال"]], state.win)}</select></label>
        <label>مبنای دلار<select id="mode">${opts(Object.entries(MODES), state.mode)}</select></label>
        <label>منطقه<select id="dist">${opts([[0, "نامشخص"]].concat(Array.from({ length: 22 }, (_, i) => [i + 1, "منطقه " + fa(i + 1)])), dist)}</select></label>
      </div>
      <details><summary>قیمت همین ملک در گذشته</summary>${histTool(ad, dist, q)}</details>
      <details><summary>مقایسه با محله دیگر</summary>${cmpTool(ad, dist, q, rate)}</details>
      <details><summary>قیمت با تورم از سال مبنا</summary>${inflTool(ad, dist, q)}</details>
      <p class="muted small">دلار آزاد (${MODES[state.mode]}): ${fa(rate)} تومان${FX && FX.date ? " — تا " + FX.date : ""}. سطح قیمت: معاملات بانک مرکزی؛ ضرایب محله: داده باز دیوار (ODbL).</p>`;
  } else {
    const rate = store.get("rentRate", DFP_RENT.rate);
    if (!(ad.area > 0)) { $("#report").innerHTML = head + `<p class="err">متراژ آگهی خوانده نشد؛ بدون متراژ نمی‌شود اجاره منصفانه را حساب کرد.</p>`; return; }
    const known = ad.deposit >= 0 && ad.rent >= 0 && (ad.deposit > 0 || ad.rent > 0);
    const f = rentRange(ad, q), eq = known ? ad.rent + ad.deposit * rate : NaN, epm = eq / ad.area, [vt, vc] = verdict(epm, f);
    const fairRent = known ? f.mid * ad.area - ad.deposit * rate : NaN;
    state.mode = store.get("mode", "m24"); state.win = store.get("win", "3y");
    const fxr = store.get("fxManual", 0) || (FX && FX[state.mode]) || 0;
    const saleMid = fxr > 0 ? fairRange(ad, dist, state.win, q).mid * fxr * ad.area : NaN;
    body = `${gauge(f.lo, f.mid, f.hi, epm, x => fa(x * ad.area / 1e6))}
      <p class="verdict ${vc}">${vt}</p>
      <div class="fair"><span>اجاره منصفانه (معادل ماهانه)</span><b>${M(f.mid * ad.area)} میلیون</b>
        <small>یا رهن کامل ${B(f.mid * ad.area / rate)} میلیارد</small></div>
      <div class="cards">
        <div><span>این آگهی</span><b>${known ? `ودیعه ${M(ad.deposit)} + اجاره ${M(ad.rent)} = معادل ${M(eq)} میلیون` + (ad.src ? " (از توضیحات)" : "") : "نامشخص"}</b></div>
        <div><span>بازه منصفانه</span><b>${M(f.lo * ad.area)} تا ${M(f.hi * ad.area)} میلیون در ماه</b></div>
        ${fairRent > 0 ? `<div><span>اجاره منصفانه با همین ودیعه</span><b>${M(fairRent)} میلیون</b></div>` : ""}
        ${saleMid > 0 ? `<div><span>ارزش فروش منصفانه همین واحد</span><b>${B(saleMid)} میلیارد</b></div>` : ""}
      </div>
      <p class="muted small">مبنا: ${f.how}. ودیعه با نرخ ${fa(rate * 100)}٪ در ماه به اجاره تبدیل شده.</p>
      ${qrow}
      <details><summary>اجاره همین واحد در گذشته</summary>${rentHistTool(ad, q, rate)}</details>
      <details><summary>مقایسه با محله دیگر</summary>${rentCmpTool(ad, q)}</details>`;
  }
  $("#report").innerHTML = head + body;
  document.querySelectorAll("[data-q]").forEach(el => el.onchange = () => { q[el.dataset.q] = el.value; store.set("q:" + TOKEN, q); render(); });
  const on = (id, fn) => { const el = $(id); if (el) el.onchange = fn; };
  on("#win", e => { store.set("win", e.target.value); render(); });
  on("#mode", e => { store.set("mode", e.target.value); render(); });
  on("#dist", e => { const o = store.get("over", {}); o[norm(ad.hood)] = +e.target.value; store.set("over", o); render(); });
  document.querySelectorAll("[data-tool]").forEach(el => el.onchange = () => { store.set("tool:" + el.dataset.tool, el.value); render(); document.querySelector(`[data-tool="${el.dataset.tool}"]`).closest("details").open = true; });
}

// ---------- tools
const nbNames = src => Object.keys(src).map(k => [k, DFP_FA[k] || k]).sort((a, b) => a[1].localeCompare(b[1], "fa"));
function histTool(ad, dist, q) {
  const H = DFP_HIST, sel = +store.get("tool:hist", 140007);
  const list = H.months.slice().reverse().map(x => [x, `${H.src && H.src[x] === "sci" ? (x % 100 === 3 ? "نیمه اول" : "نیمه دوم") : MON[x % 100 - 1]} ${fa(Math.floor(x / 100)).replace(/٬/g, "")}`]);
  const hv = histValue(ad, dist, q, sel);
  const res = hv ? `حدود <b>${M(hv.ppm)} میلیون</b> تومان هر متر${ad.area ? ` (کل ${B(hv.ppm * ad.area)} میلیارد)` : ""}${hv.usd ? ` — ≈ $${fa(hv.ppm / hv.usd)} در متر` : ""}<br><span class="muted small">بر اساس ${hv.how}${hv.est ? "، درون‌یابی" : ""}</span>` : "داده کافی نیست.";
  return `<label>ماه<select data-tool="hist">${opts(list, sel)}</select></label><p>${res}</p>`;
}
function cmpTool(ad, dist, q, rate) {
  const k = store.get("tool:cmp", ""), here = fairRange(ad, dist, state.win, q);
  let res = "";
  if (k) { const t = fairRange({ ...ad, slug: k }, dist, state.win, q), d = Math.round((t.mid / here.mid - 1) * 100);
    res = `همین واحد در ${DFP_FA[k] || k}: <b>${M(t.lo * rate)} تا ${M(t.hi * rate)} میلیون</b> هر متر — ${fa(Math.abs(d))}٪ ${d >= 0 ? "گران‌تر" : "ارزان‌تر"}`; }
  return `<label>محله<select data-tool="cmp">${opts([["", "انتخاب کنید"]].concat(nbNames(DFP_COEF.nb)), k)}</select></label><p>${res}</p>`;
}
function inflTool(ad, dist, q) {
  const I = DFP_INFL, yrs = Object.keys(I.years).map(Number).sort((a, b) => a - b), sel = store.get("tool:infl", "avg");
  const nb = ad.slug && DFP_COEF.nb[ad.slug]; if (!nb) return "<p>ضریب محله موجود نیست.</p>";
  const ratio = fairRange(ad, dist, "3y", q).mid / bands("3y")[0][2];
  const ys = sel === "avg" ? yrs.filter(y => y >= 1388 && y <= 1397) : sel === "recent" ? yrs.filter(y => y >= 1400) : [+sel];
  const vals = ys.map(y => I.years[y][0] * I.now.cpi / I.years[y][1]).sort((a, b) => a - b), med = vals[Math.floor(vals.length / 2)];
  const v = med * ratio, d = Math.round((ad.ppm / v - 1) * 100);
  const list = [["avg", "میانگین ۱۳۸۸ تا ۱۳۹۷"], ["recent", "میانگین ۱۴۰۰ تا ۱۴۰۳"]].concat(yrs.map(y => [y, fa(y).replace(/٬/g, "")]));
  return `<label>سال مبنا<select data-tool="infl">${opts(list, sel)}</select></label><p>حدود <b>${M(v)} میلیون</b> هر متر به قیمت امروز — قیمت آگهی ${fa(Math.abs(d))}٪ ${d >= 0 ? "بالاتر" : "پایین‌تر"}</p>`;
}
function rentHistTool(ad, q, rate) {
  const I = DFP_INFL, yrs = Object.keys(I.years).map(Number).sort((a, b) => b - a), y = +store.get("tool:rhist", 1400);
  const past = rentRange(ad, q).mid * ad.area * rentIdx(y * 100 + 6) / rentIdx(DFP_RENTIDX.now);
  return `<label>سال<select data-tool="rhist">${opts(yrs.map(v => [v, fa(v).replace(/٬/g, "")]), y)}</select></label><p>حدود <b>${M(past)} میلیون</b> اجاره ماهانه معادل (ودیعه کامل ${B(past / rate)} میلیارد)</p>`;
}
function rentCmpTool(ad, q) {
  const k = store.get("tool:rcmp", ""), here = rentRange(ad, q);
  let res = "";
  if (k) { const t = rentRange({ ...ad, slug: k }, q), d = Math.round((t.mid / here.mid - 1) * 100);
    res = `همین واحد در ${DFP_FA[k] || k}: <b>${M(t.lo * ad.area)} تا ${M(t.hi * ad.area)} میلیون</b> در ماه — ${fa(Math.abs(d))}٪ ${d >= 0 ? "گران‌تر" : "ارزان‌تر"}`; }
  return `<label>محله<select data-tool="rcmp">${opts([["", "انتخاب کنید"]].concat(nbNames(DFP_RENT.nb)), k)}</select></label><p>${res}</p>`;
}

// ---------- boot: shared link (?share=...) or paste
window.addEventListener("DOMContentLoaded", async () => {
  $("#go").onclick = () => analyze($("#link").value);
  $("#paste").onclick = async () => { try { $("#link").value = await navigator.clipboard.readText(); analyze($("#link").value); } catch { $("#link").focus(); } };
  const shared = new URLSearchParams(location.search).get("share");
  if (shared) { $("#link").value = shared; analyze(shared); }
  FX = await getRate();
});
