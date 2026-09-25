const REPORT_CSS = `.dfp{--bg:#f6f4ef;--card:#fff;--ink:#23211d;--muted:#7a7468;--line:#e3ded3;--accent:#1f5f5b;--z1:#cfe8d3;--z2:#9fd0c8;--z3:#f3d9a8;--below:#2e7d3f;--above:#a2620b;
  direction:rtl;color:var(--ink);font-family:Vazirmatn,IRANSansX,"Noto Naskh Arabic",Tahoma,sans-serif;line-height:1.7;font-size:14px}
@media (prefers-color-scheme:dark){.dfp{--bg:#171614;--card:#221f1b;--ink:#eee8dc;--muted:#a39c8e;--line:#3a352e;--accent:#6cc0b5;--z1:#2f5a39;--z2:#2c6a63;--z3:#6d5424;--below:#7ccf8e;--above:#e0a95a}}
.dfp h2{font-size:17px;margin:0 0 2px}
.dfp select{font:inherit;font-size:13px;padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);width:100%}
.dfp label{display:flex;flex-direction:column;font-size:12px;color:var(--muted);gap:3px}
.dfp .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:12px 0}
.dfp .cards{display:grid;gap:8px;margin:10px 0}.dfp .cards div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed var(--line);padding:4px 0}
.dfp .cards span{color:var(--muted);font-size:13px}.dfp .cards b{font-size:14px;text-align:left}
.dfp svg{width:100%;max-width:360px;display:block;margin:6px auto 0}
.dfp .verdict{text-align:center;font-weight:700;font-size:17px;margin:4px 0}
.dfp .verdict.below{color:var(--below)}.dfp .verdict.above{color:var(--above)}.dfp .verdict.fair{color:var(--accent)}
.dfp .fair{text-align:center;margin:8px 0 4px;padding:10px;border-radius:10px;background:color-mix(in srgb,var(--z2) 35%,transparent)}
.dfp .fair span{display:block;font-size:13px;color:var(--muted)}.dfp .fair b{display:block;font-size:22px}.dfp .fair small{color:var(--muted)}
.dfp details{border-top:1px solid var(--line);padding:8px 0}.dfp summary{cursor:pointer;font-weight:700;font-size:14px}
.dfp .premium summary{color:var(--accent)}.dfp ul{margin:6px 0;padding-right:18px}.dfp li{margin:4px 0}
.dfp .muted{color:var(--muted)}.dfp .small{font-size:12px}.dfp .err{color:var(--above)}
.dfp select:focus-visible,.dfp summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`;
// ---------- helpers
let ROOT = null;                                              // report container (app: #report, extension: shadow root div)
const $ = q => ROOT.querySelector(q);
function setRoot(el) { ROOT = el; }
let FETCH_POST = async token => {                            // app: direct (CapacitorHttp); extension overrides via background
  const r = await fetch(`https://api.divar.ir/v8/posts-v2/web/${token}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(r.status === 404 ? "این آگهی حذف شده یا منقضی شده است." : "خطای دیوار: " + r.status);
  return r.json();
};
const FX_URL = "https://raw.githubusercontent.com/kooroshkz/Dollar-Rial-Toman-Live-Price-Dataset/main/data/Dollar_Rial_Price_Dataset.csv";
const store = {
  get: (k, d) => { try { const v = localStorage.getItem("dfp:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("dfp:" + k, JSON.stringify(v)); } catch {} },
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
  const cat = String(W.category || W.cat_3 || W.cat3 || ""); ad.cat = cat;
  const wi = P.seo && P.seo.web_info; if (wi) { ad.hood = wi.district_persian || ""; ad.cityFa = wi.city_persian || ""; }
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
    else if (/^متراژ زمین/.test(k)) { const a = NUM(String(v)); if (a > 0) ad.land = a; }
    else if (/^متراژ/.test(k)) { const a = NUM(String(v)); if (a > 0) ad.area = a; }
    else if (/^ساخت/.test(k)) { const y = NUM(String(v)); if (y > 1300 && y < 1500) ad.year = y; }
    else if (/^طبقه/.test(k)) ad.floor = floorNum(v);
    else if (/^سند/.test(k)) { const x = String(v); ad.deed = /تک.?برگ/.test(x) ? "single" : /منگوله/.test(x) ? "multi" : /قولنامه/.test(x) ? "written" : /اوقاف|موقوفه/.test(x) ? "awqaf" : "other"; }
  });
  walk(P, o => {                                     // amenities rows: {title:"آسانسور"} / {title:"آسانسور ندارد"}
    const k = String(o.title || ""); if (!k || k.length > 20) return;
    for (const [key, word] of [["elevator", "آسانسور"], ["parking", "پارکینگ"], ["warehouse", "انباری"]])
      if (k.includes(word)) ad[key] = !(k.includes("ندارد") || o.available === false || o.disabled === true);
  });
  const t = ad.title + " " + desc;
  ad.comCat = DFP_COM[cat] ? cat : /کلنگی/.test(ad.title) ? "plot-old"
    : /مغازه|تجاری|غرفه/.test(ad.title) ? (/اجاره|رهن/.test(ad.title) ? "shop-rent" : "shop-sell")
    : /اداری|دفتر کار|مطب/.test(ad.title) ? (/اجاره|رهن/.test(ad.title) ? "office-rent" : "office-sell") : "";
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
  if (ad.comCat) {                                   // commercial / old house: own model, own price fields
    const C = DFP_COM[ad.comCat];
    if (C.kind === "rent") {
      if (!(ad.deposit >= 0)) ad.deposit = numFromText(t, /(?:رهن|ودیعه)\s*(?:کامل)?\s*[:：]?\s*([\d.,٬]+)\s*(میلیارد|میلیون|م(?=\s|$))?/);
      if (!(ad.rent >= 0)) ad.rent = numFromText(t, /اجاره(?:\s*ماهانه)?\s*[:：]?\s*([\d.,٬]+)\s*(میلیارد|میلیون|م(?=\s|$))?/);
      if (ad.deposit >= 0 && !(ad.rent >= 0)) ad.rent = 0; if (ad.rent >= 0 && !(ad.deposit >= 0)) ad.deposit = 0;
    } else if (!(ad.total > 0)) { const tot = numFromText(t, /(?:قیمت|فی)\s*(?:کل)?\s*[:：]?\s*([\d.,٬]+)\s*(میلیارد|میلیون)/); if (tot > 1e7) { ad.total = tot; ad.src = "desc"; } }
    ad.type = "com";
  }
  if (/اوقاف|موقوفه/.test(t)) ad.deed = "awqaf";
  else if (/سرقفلی/.test(t) && !/شش.?دانگ|ملکیت/.test(t)) ad.deed = "sarghofli";
  else if (!ad.deed && /قولنامه/.test(t)) ad.deed = "written";
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
  if (!token) { ROOT.innerHTML = `<p class="err">لینک آگهی دیوار پیدا نشد. لینک را از دکمه «اشتراک‌گذاری» آگهی در دیوار بفرستید یا کپی کنید.</p>`; return; }
  return analyzeToken(token);
}
async function analyzeToken(token) {
  ROOT.innerHTML = `<p class="muted">در حال دریافت آگهی…</p>`;
  try { AD = parsePost(await FETCH_POST(token)); TOKEN = token; }
  catch (e) { ROOT.innerHTML = `<p class="err">${e.message || "اتصال به دیوار برقرار نشد."}</p>`; return; }
  if (!AD.type) { ROOT.innerHTML = `<p class="err">نوع آگهی تشخیص داده نشد (فعلاً آپارتمان، کلنگی، مغازه و اداری پشتیبانی می‌شوند).</p>`; return; }
  AD.iran = !!(AD.city && AD.city !== "tehran");
  if (AD.iran) {
    if (AD.type === "com") { ROOT.innerHTML = `<p class="err">کلنگی و تجاری فعلاً فقط برای تهران پشتیبانی می‌شوند.</p>`; return; }
    if (!DFP_IRAN[AD.type === "rent" ? "rent" : "sale"].city[AD.city]) { ROOT.innerHTML = `<p class="err">برای شهر ${AD.cityFa || AD.city} آگهی کافی در داده دیوار نبود.</p>`; return; }
  }
  FX = FX || await getRate();
  render();
}

function render() {
  const ad = AD, q = store.get("q:" + TOKEN, { street: "", plan: "", npark: "" });
  if (!q.deed) q.deed = ad.deed || "single";
  const deedList = ad.type === "com" && /shop/.test(ad.comCat) ? ["single", "sarghofli", "written", "awqaf"] : ["single", "multi", "written", "awqaf", "other"];
  const deedSel = `<label>${ad.type === "com" && /shop/.test(ad.comCat) ? "نوع مالکیت / سند" : "نوع سند"}${ad.deed ? " (از آگهی)" : ""}<select data-q="deed">${opts(deedList.map(k => [k, k === "single" && /shop/.test(ad.comCat || "") ? "ملکیت، تک‌برگ" : DFP_COEF.deed[k][1]]), q.deed)}</select></label>`;
  const dist = store.get("over", {})[norm(ad.hood)] ?? lookup(ad.hood);
  const head = `<h2>${ad.title || "آگهی دیوار"}</h2><p class="muted">${[ad.hood, ad.area && fa(ad.area) + " متر", ad.year && "ساخت " + fa(ad.year).replace(/٬/g, ""), ad.floor !== null && "طبقه " + fa(ad.floor)].filter(Boolean).join(" · ")}</p>`;
  const qrow = `<div class="grid">
      <label>موقعیت در محله<select data-q="street">${opts(QOPT, q.street)}</select></label>
      <label>نقشه واحد<select data-q="plan">${opts(QOPT, q.plan)}</select></label>
      ${ad.type === "sale" ? deedSel : ""}
      ${ad.type === "sale" ? `<label>تعداد پارکینگ<select data-q="npark">${opts([["", "طبق آگهی"], [0, "ندارد"], [1, "۱"], [2, "۲"], [3, "۳"]], q.npark)}</select></label>` : ""}
    </div>`;
  let body = "";
  if (ad.type === "sale") {
    state.mode = store.get("mode", "m24"); state.win = store.get("win", "3y");
    const manual = store.get("fxManual", 0), rate = manual || (FX && FX[state.mode]) || 0;
    if (!(rate > 0)) { ROOT.innerHTML = head + `<p class="err">نرخ دلار دریافت نشد. نرخ دلار آزاد را دستی وارد کنید (تومان):</p>
      <div class="grid"><label>نرخ دلار<input id="fxm" type="number" inputmode="numeric" placeholder="مثلاً ۱۲۰۰۰۰" style="font:inherit;padding:6px;border:1px solid var(--line);border-radius:6px"></label></div>`;
      $("#fxm").onchange = e => { const v = +e.target.value; if (v > 1000) { store.set("fxManual", v); render(); } }; return; }
    const f = ad.iran ? iranRange(ad, "sale", q, rate) : fairRange(ad, dist, state.win, q), usd = ad.ppm / rate, [vt, vc] = verdict(usd, f);
    const rr = store.get("rentRate", DFP_RENT.rate), rentMid = ad.area > 0 ? (ad.iran ? (iranRange(ad, "rent", q, rate) || {}).mid : rentRange(ad, q).mid) * ad.area : NaN;
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
        ${ad.iran ? "" : `<label>بازه<select id="win">${opts([["3y", "۳ سال اخیر"], ["7y", "۷ سال"]], state.win)}</select></label>
        <label>مبنای دلار<select id="mode">${opts(Object.entries(MODES), state.mode)}</select></label>
        <label>منطقه<select id="dist">${opts([[0, "نامشخص"]].concat(Array.from({ length: 22 }, (_, i) => [i + 1, "منطقه " + fa(i + 1)])), dist)}</select></label>`}
      </div>
      ${ad.iran ? `${DFP_CITYHIST[ad.city] ? `<details><summary>قیمت همین ملک در گذشته</summary>${cityHistTool(ad, q, rate)}</details>
        <details><summary>قیمت با تورم از سال مبنا</summary>${cityInflTool(ad, q, rate)}</details>` : ""}
        <details><summary>مقایسه با محله دیگر در همین شهر</summary>${iranCmpTool(ad, "sale", q, rate)}</details>`
      : `<details><summary>قیمت همین ملک در گذشته</summary>${histTool(ad, dist, q)}</details>
      <details><summary>مقایسه با محله دیگر</summary>${cmpTool(ad, dist, q, rate)}</details>
      <details><summary>قیمت با تورم از سال مبنا</summary>${inflTool(ad, dist, q)}</details>`}
      <details class="premium"><summary>تحلیل ⭐</summary>${analysisTool(ad, dist, q)}</details>
      <p class="muted small">دلار آزاد (${MODES[state.mode]}): ${fa(rate)} تومان${FX && FX.date ? " — تا " + FX.date : ""}. ${ad.iran ? "سطح قیمت: آگهی‌های ۱۴۰۳ دیوار در همین شهر، هم‌پای مسیر قیمت منصفانه تهران به امروز آورده شده (آمار رسمی معامله برای این شهر نیست)." : "سطح قیمت: معاملات بانک مرکزی؛ ضرایب محله: داده باز دیوار (ODbL)."}</p>`;
  } else if (ad.type === "com") {
    const C = DFP_COM[ad.comCat];
    state.mode = store.get("mode", "m24"); state.win = store.get("win", "3y");
    const rate = store.get("fxManual", 0) || (FX && FX[state.mode]) || 0, rr = store.get("rentRate", DFP_RENT.rate);
    const f = comRange(ad, ad.comCat, q, rate), S = f.size, unitTxt = C.unit === "land" ? "متر زمین" : "متر";
    if (!(S > 0) || !(f.mid > 0)) { ROOT.innerHTML = head + `<p class="err">${S > 0 ? "نرخ دلار دریافت نشد؛ از آگهی فروش آپارتمان نرخ را دستی وارد کنید یا کمی بعد دوباره امتحان کنید." : "متراژ آگهی خوانده نشد."}</p>`; return; }
    const val = C.kind === "rent" ? ((ad.deposit >= 0 && ad.rent >= 0 && (ad.deposit > 0 || ad.rent > 0)) ? (ad.rent + ad.deposit * rr) / S : NaN)
                                  : (ad.total > 0 ? ad.total / S : NaN);
    const [vt, vc] = verdict(val, f), per = x => C.kind === "rent" ? M(x * S) + " میلیون در ماه" : B(x * S) + " میلیارد";
    const years = Object.keys(DFP_INFL.years).map(Number).filter(y => y >= 1396).sort((a, b) => b - a), py = +store.get("tool:cpast", 1400);
    const past = comPast(ad, ad.comCat, q, rate, py), ck = store.get("tool:ccmp", "");
    let cmpTxt = ""; if (ck) { const g = comRange({ ...ad, slug: ck }, ad.comCat, q, rate), d = Math.round((g.mid / f.mid - 1) * 100);
      cmpTxt = `همین ملک در ${DFP_FA[ck] || ck}: <b>${per(g.mid)}</b> — ${fa(Math.abs(d))}٪ ${d >= 0 ? "گران‌تر" : "ارزان‌تر"}`; }
    body = `<p class="muted small">${C.label}</p>${gauge(f.lo, f.mid, f.hi, val, x => C.kind === "rent" ? fa(x * S / 1e6) : fa(x / 1e6))}
      <p class="verdict ${vc}">${vt}</p>
      <div class="fair"><span>${C.kind === "rent" ? "اجاره منصفانه (معادل ماهانه)" : "ارزش منصفانه"}</span><b>${per(f.mid)}</b>
        <small>${C.kind === "rent" ? "یا رهن کامل " + B(f.mid * S / rr) + " میلیارد" : "هر " + unitTxt + " " + M(f.mid) + " میلیون"}</small></div>
      <div class="cards">
        <div><span>این آگهی</span><b>${val > 0 ? (C.kind === "rent" ? `ودیعه ${M(ad.deposit)} + اجاره ${M(ad.rent)} = معادل ${M(val * S)} میلیون` : B(ad.total) + " میلیارد — هر " + unitTxt + " " + M(val) + " میلیون") + (ad.src ? " (از توضیحات)" : "") : "نامشخص"}</b></div>
        <div><span>بازه منصفانه</span><b>${per(f.lo)} تا ${per(f.hi)}</b></div>
      </div>
      <p class="muted small">مبنا: ${f.how}. ${C.kind === "rent" ? "سطح ۱۴۰۳ با شاخص اجاره به امروز آورده شده." : "سطح ۱۴۰۳ هم‌پای قیمت منصفانه مسکن تهران (مبنای دلار " + MODES[state.mode] + ") به امروز آورده شده."}</p>
      <div class="grid"><label>${C.unit === "land" ? "موقعیت و عرض گذر" : "موقعیت (بَر خیابان، دید، دسترسی)"}<select data-q="street">${opts(QOPT, q.street)}</select></label>
        ${C.kind === "sale" ? deedSel : ""}
        ${C.kind === "sale" ? `<label>مبنای دلار<select id="mode">${opts(Object.entries(MODES), state.mode)}</select></label>` : ""}</div>
      <details><summary>همین ملک در گذشته</summary><label>سال<select data-tool="cpast">${opts(years.map(y => [y, fa(y).replace(/٬/g, "")]), py)}</select></label>
        <p>${past > 0 ? "حدود <b>" + per(past) + "</b> — تخمین " + (C.kind === "rent" ? "با شاخص اجاره" : "با روند قیمت مسکن تهران") : "داده کافی نیست."}</p></details>
      <details><summary>مقایسه با محله دیگر</summary><label>محله<select data-tool="ccmp">${opts([["", "انتخاب کنید"]].concat(nbNames(C.nb)), ck)}</select></label><p>${cmpTxt}</p></details>
      <p class="muted small">داده: آگهی‌های ۱۴۰۳ دیوار (ODbL). برای ${C.label} آمار رسمی معامله وجود ندارد؛ دقت کمتر از آپارتمان است.</p>`;
  } else {
    const rate = store.get("rentRate", DFP_RENT.rate);
    if (!(ad.area > 0)) { ROOT.innerHTML = head + `<p class="err">متراژ آگهی خوانده نشد؛ بدون متراژ نمی‌شود اجاره منصفانه را حساب کرد.</p>`; return; }
    const known = ad.deposit >= 0 && ad.rent >= 0 && (ad.deposit > 0 || ad.rent > 0);
    const f = ad.iran ? iranRange(ad, "rent", q, 0) : rentRange(ad, q), eq = known ? ad.rent + ad.deposit * rate : NaN, epm = eq / ad.area, [vt, vc] = verdict(epm, f);
    const fairRent = known ? f.mid * ad.area - ad.deposit * rate : NaN;
    state.mode = store.get("mode", "m24"); state.win = store.get("win", "3y");
    const fxr = store.get("fxManual", 0) || (FX && FX[state.mode]) || 0;
    const sf = fxr > 0 ? (ad.iran ? iranRange(ad, "sale", q, fxr) : fairRange(ad, dist, state.win, q)) : null;
    const saleMid = sf ? sf.mid * fxr * ad.area : NaN;
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
      ${ad.iran ? `<details><summary>اجاره همین واحد در گذشته</summary>${rentHistTool(ad, q, rate)}</details>
        <details><summary>مقایسه با محله دیگر در همین شهر</summary>${iranCmpTool(ad, "rent", q, rate)}</details>`
      : `<details><summary>اجاره همین واحد در گذشته</summary>${rentHistTool(ad, q, rate)}</details>
      <details><summary>مقایسه با محله دیگر</summary>${rentCmpTool(ad, q)}</details>`}`;
  }
  ROOT.innerHTML = head + body;
  ROOT.querySelectorAll("[data-q]").forEach(el => el.onchange = () => { q[el.dataset.q] = el.value; store.set("q:" + TOKEN, q); render(); });
  const on = (id, fn) => { const el = $(id); if (el) el.onchange = fn; };
  on("#win", e => { store.set("win", e.target.value); render(); });
  on("#mode", e => { store.set("mode", e.target.value); render(); });
  on("#dist", e => { const o = store.get("over", {}); o[norm(ad.hood)] = +e.target.value; store.set("over", o); render(); });
  ROOT.querySelectorAll("[data-tool]").forEach(el => el.onchange = () => { store.set("tool:" + el.dataset.tool, el.value); render(); ROOT.querySelector(`[data-tool="${el.dataset.tool}"]`).closest("details").open = true; });
}

// ---------- tools
const nbNames = src => Object.keys(src).map(k => [k, DFP_FA[k] || k]).sort((a, b) => a[1].localeCompare(b[1], "fa"));
// ---------- premium analysis: fair value under different dollar averages, CPI view, rental yield, and a plain-language summary
function analysisTool(ad, dist, q) {
  if (!(FX && FX.m24 > 0)) return "<p>نرخ دلار در دسترس نیست.</p>";
  const saved = state.mode, rows = [], val = {};
  for (const m of ["spot", "m3", "m12", "m24"]) {
    state.mode = m; const r = FX[m], f = ad.iran ? iranRange(ad, "sale", q, r) : fairRange(ad, dist, "3y", q);
    if (f) { val[m] = f.mid * r; rows.push([MODES[m], val[m]]); }
  }
  state.mode = saved;
  const P = ad.ppm > 0 ? ad.ppm : NaN, pct = v => Math.round((P / v - 1) * 100), sgn = d => `${fa(Math.abs(d))}٪ ${d >= 0 ? "بالاتر" : "پایین‌تر"}`;
  const tbl = rows.map(([n, v]) => `<div><span>با دلار ${n}</span><b>${M(v)} میلیون${P > 0 ? " — آگهی " + sgn(pct(v)) : ""}</b></div>`).join("");
  const I = DFP_INFL, yrsA = Object.keys(I.years).map(Number);
  let cpiLong = NaN, cpiRecent = NaN;
  if (ad.iran) { if (DFP_CITYHIST[ad.city]) { cpiLong = cityInfl(ad, q, FX.m24, yrsA.filter(y => y >= 1388 && y <= 1397)); cpiRecent = cityInfl(ad, q, FX.m24, yrsA.filter(y => y >= 1400)); } }
  else { state.mode = "m24"; const ratio = fairRange(ad, dist, "3y", q).mid / bands("3y")[0][2]; state.mode = saved;
    const med = ys => { const v = ys.map(y => I.years[y][0] * I.now.cpi / I.years[y][1]).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    cpiLong = med(yrsA.filter(y => y >= 1388 && y <= 1397)) * ratio; cpiRecent = med(yrsA.filter(y => y >= 1400)) * ratio; }
  const rr = store.get("rentRate", DFP_RENT.rate);
  const rentF = ad.area > 0 ? (ad.iran ? iranRange(ad, "rent", q, 0) : rentRange(ad, q)) : null;
  const yieldPct = rentF && P > 0 ? rentF.mid * 12 / P * 100 : NaN;
  const lag = val.m3 && val.m24 ? Math.round((val.m3 / val.m24 - 1) * 100) : NaN;
  const s = [];
  if (P > 0 && val.m24) {
    const d = pct(val.m24);
    s.push(Math.abs(d) <= 7 ? "قیمت آگهی با ارزش منصفانه بلندمدت (دلار میانگین ۲۴ ماه) هم‌خوان است." :
      d > 0 ? `قیمت آگهی ${fa(d)}٪ بالاتر از ارزش منصفانه بلندمدت است؛ جای چانه‌زنی دارد.` : `قیمت آگهی ${fa(-d)}٪ پایین‌تر از ارزش منصفانه بلندمدت است؛ اگر مشکل پنهانی (سند، کیفیت، موقعیت) ندارد، فرصت محسوب می‌شود.`);
  }
  if (lag > 10) s.push(`ارزش با دلار ۳ ماه اخیر ${fa(lag)}٪ بالاتر از ارزش با دلار ۲۴ ماه است: دلار اخیراً جهش کرده و مسکن معمولاً با تأخیر یک تا دو ساله دنبالش می‌رود؛ احتمال رشد قیمت در ماه‌های آینده بیشتر است.`);
  else if (lag < -10) s.push(`ارزش با دلار ۳ ماه اخیر ${fa(-lag)}٪ پایین‌تر از میانگین ۲۴ ماه است: دلار اخیراً افت کرده و فشار صعودی بر مسکن کمتر است.`);
  else if (!isNaN(lag)) s.push("دلار ۳ ماه اخیر و ۲۴ ماه فاصله زیادی ندارند؛ از سمت ارز فشار خاصی بر قیمت نیست.");
  if (P > 0 && cpiLong > 0) { const d = pct(cpiLong); s.push(d > 25 ? `نسبت به دوره هم‌گامی مسکن و تورم (۱۳۸۸–۱۳۹۷) قیمت ${fa(d)}٪ بالاتر است؛ یعنی مسکن از تورم عمومی جلو زده و بخشی از قیمت امروز به ماندگاری این جهش بستگی دارد.` : d < -10 ? `با معیار تورم بلندمدت، قیمت ${fa(-d)}٪ پایین‌تر است؛ از این منظر ارزان است.` : "با معیار تورم بلندمدت قیمت در محدوده معمول است."); }
  if (yieldPct > 0) s.push(`بازده اجاره ناخالص حدود ${yieldPct.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪ در سال است، در حالی که بازار ودیعه را با ${fa(rr * 1200)}٪ در سال به اجاره تبدیل می‌کند؛ پس بازده این ملک عمدتاً از رشد قیمت می‌آید، نه اجاره${yieldPct >= 6 ? " (البته برای مسکن این بازده نسبتاً بالاست)" : ""}.`);
  return `<div class="cards">${tbl}
      ${cpiLong > 0 ? `<div><span>با تورم، مبنای ۱۳۸۸–۱۳۹۷</span><b>${M(cpiLong)} میلیون${P > 0 ? " — آگهی " + sgn(pct(cpiLong)) : ""}</b></div>` : ""}
      ${cpiRecent > 0 ? `<div><span>با تورم، مبنای ۱۴۰۰–۱۴۰۳</span><b>${M(cpiRecent)} میلیون${P > 0 ? " — آگهی " + sgn(pct(cpiRecent)) : ""}</b></div>` : ""}
      ${yieldPct > 0 ? `<div><span>بازده اجاره ناخالص</span><b>${yieldPct.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪ در سال</b></div>` : ""}
    </div><p class="muted small">اعداد: قیمت منصفانه هر متر (میلیون تومان).</p><ul>${s.map(x => `<li>${x}</li>`).join("")}</ul>
    <p class="muted small">این تحلیل خودکار و بر پایه داده‌های آماری است و جایگزین بازدید و کارشناسی نیست.</p>`;
}
function iranCmpTool(ad, kind, q, rate) {
  const city = DFP_IRAN[kind].city[ad.city], k = store.get("tool:icmp" + kind, "");
  const names = Object.keys(city.nb).map(s => [s, s.replace(/-/g, " ")]).sort((a, b) => a[1].localeCompare(b[1]));
  if (!names.length) return "<p>برای محله‌های این شهر آگهی کافی نبود.</p>";
  const here = iranRange(ad, kind, q, rate); let res = "";
  if (k && city.nb[k]) { const t = iranRange({ ...ad, slug: k, hood: k }, kind, q, rate), d = Math.round((t.mid / here.mid - 1) * 100);
    res = `همین واحد در ${k.replace(/-/g, " ")}: <b>${kind === "sale" ? B(t.mid * rate * (ad.area || 1)) + (ad.area ? " میلیارد" : "") : M(t.mid * ad.area) + " میلیون در ماه"}</b> — ${fa(Math.abs(d))}٪ ${d >= 0 ? "گران‌تر" : "ارزان‌تر"}`; }
  return `<label>محله (نام لاتین دیوار)<select data-tool="icmp${kind}">${opts([["", "انتخاب کنید"]].concat(names), k)}</select></label><p>${res}</p>`;
}
function cityHistTool(ad, q, rate) {
  const H = DFP_CITYHIST[ad.city], yrs = Object.keys(H).map(Number).sort((a, b) => b - a), y = +store.get("tool:chist", 1395);
  const v = cityPast(ad, q, rate, y);
  return `<label>سال<select data-tool="chist">${opts(yrs.map(x => [x, fa(x).replace(/٬/g, "")]), y)}</select></label>
    <p>${v > 0 ? `حدود <b>${M(v)} میلیون</b> تومان هر متر${ad.area ? ` (کل ${B(v * ad.area)} میلیارد)` : ""}` : "داده کافی نیست."}<br>
    <span class="muted small">${y <= 1396 ? "بر اساس آمار شش‌ماهه مرکز آمار برای " + (ad.cityFa || ad.city) : "۱۳۹۷ تا ۱۴۰۳: پل‌زدن بین آخرین آمار مرکز آمار و سطح آگهی‌های ۱۴۰۳ دیوار، با شکل روند تهران"}</span></p>`;
}
function cityInflTool(ad, q, rate) {
  const H = DFP_CITYHIST[ad.city], yrs = Object.keys(H).map(Number).sort((a, b) => a - b), sel = store.get("tool:cinfl", "avg");
  const ys = sel === "avg" ? yrs.filter(y => y >= 1388 && y <= 1397) : sel === "recent" ? yrs.filter(y => y >= 1400) : [+sel];
  const v = cityInfl(ad, q, rate, ys), d = ad.ppm > 0 ? Math.round((ad.ppm / v - 1) * 100) : null;
  const list = [["avg", "میانگین ۱۳۸۸ تا ۱۳۹۷"], ["recent", "میانگین ۱۴۰۰ تا ۱۴۰۳"]].concat(yrs.filter(y => DFP_INFL.years[y]).map(y => [y, fa(y).replace(/٬/g, "")]));
  return `<label>سال مبنا<select data-tool="cinfl">${opts(list, sel)}</select></label><p>${v > 0 ? `حدود <b>${M(v)} میلیون</b> هر متر به قیمت امروز` + (d !== null ? ` — قیمت آگهی ${fa(Math.abs(d))}٪ ${d >= 0 ? "بالاتر" : "پایین‌تر"}` : "") : "داده کافی نیست."}</p>`;
}
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
  const past = (ad.iran ? iranRange(ad, "rent", q, 0) : rentRange(ad, q)).mid * ad.area * rentIdx(y * 100 + 6) / rentIdx(DFP_RENTIDX.now);
  return `<label>سال<select data-tool="rhist">${opts(yrs.map(v => [v, fa(v).replace(/٬/g, "")]), y)}</select></label><p>حدود <b>${M(past)} میلیون</b> اجاره ماهانه معادل (ودیعه کامل ${B(past / rate)} میلیارد)</p>`;
}
function rentCmpTool(ad, q) {
  const k = store.get("tool:rcmp", ""), here = rentRange(ad, q);
  let res = "";
  if (k) { const t = rentRange({ ...ad, slug: k }, q), d = Math.round((t.mid / here.mid - 1) * 100);
    res = `همین واحد در ${DFP_FA[k] || k}: <b>${M(t.lo * ad.area)} تا ${M(t.hi * ad.area)} میلیون</b> در ماه — ${fa(Math.abs(d))}٪ ${d >= 0 ? "گران‌تر" : "ارزان‌تر"}`; }
  return `<label>محله<select data-tool="rcmp">${opts([["", "انتخاب کنید"]].concat(nbNames(DFP_RENT.nb)), k)}</select></label><p>${res}</p>`;
}

