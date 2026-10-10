// v10: tabs (link analysis / manual estimate / favorites). Does not touch the valuation logic in core.js / app.js;
// it only calls fairRange / rentRange / iranRange / comRange and render() the same way the link analysis does.

const CITY_FA = { tehran: "تهران", mashhad: "مشهد", karaj: "کرج", isfahan: "اصفهان", shiraz: "شیراز", tabriz: "تبریز", ahvaz: "اهواز", qom: "قم",
  rasht: "رشت", kermanshah: "کرمانشاه", urmia: "ارومیه", yazd: "یزد", hamedan: "همدان", arak: "اراک", ardabil: "اردبیل", zahedan: "زاهدان",
  sanandaj: "سنندج", "bandar-abbas": "بندرعباس", kerman: "کرمان", gorgan: "گرگان", sari: "ساری", qazvin: "قزوین", khorramabad: "خرم‌آباد",
  bushehr: "بوشهر", birjand: "بیرجند", bojnurd: "بجنورد", ilam: "ایلام", semnan: "سمنان", shahrekord: "شهرکرد", yasuj: "یاسوج", zanjan: "زنجان",
  kashan: "کاشان", najafabad: "نجف‌آباد", amol: "آمل", babol: "بابل", chalus: "چالوس", kish: "کیش", qeshm: "قشم", lahijan: "لاهیجان",
  dezful: "دزفول", borujerd: "بروجرد", saveh: "ساوه", varamin: "ورامین", "varamin-city": "ورامین", neyshabur: "نیشابور", sabzevar: "سبزوار",
  maragheh: "مراغه", malayer: "ملایر", nowshahr: "نوشهر", tonekabon: "تنکابن", ramsar: "رمسر", chabahar: "چابهار", abadan: "آبادان",
  eslamshahr: "اسلامشهر", shahriar: "شهریار", "shahriar-city": "شهریار", pardis: "پردیس", "pardis-city": "پردیس", "robat-karim": "رباط کریم",
  "shahre-rey": "شهر ری", gonbad: "گنبد", "gonbad-kavus": "گنبد کاووس", garmsar: "گرمسار", damavand: "دماوند", "qods-city": "قدس", nasimshahr: "نسیم‌شهر" };
const cityName = k => k === "tehran" ? "تهران" : (CITY_FA[k] || k);
const isRentAd = ad => ad.type === "rent" || (ad.type === "com" && DFP_COM[ad.comCat] && DFP_COM[ad.comCat].kind === "rent");
const areaOf = ad => ad.comCat === "plot-old" ? (ad.land || ad.area) : ad.area;
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const jd = t => new Date(t).toLocaleDateString("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit" });
const num = x => Number.isFinite(x) ? x : null;
const d1 = x => x.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
const fmtPrice = (v, rent) => !(v > 0) ? "نامشخص" : rent ? d1(v / 1e6) + " میلیون در ماه" : d1(v / 1e9) + " میلیارد";
const typeLabel = ad => ad.type === "com" ? DFP_COM[ad.comCat].label : isRentAd(ad) ? "اجاره آپارتمان" : "فروش آپارتمان";

// ---------- price of an ad: sale = total price, rent = monthly equivalent (rent + deposit x monthly rate)
function adPrice(ad) {
  if (isRentAd(ad)) {
    const rr = store.get("rentRate", DFP_RENT.rate);
    return (ad.rent >= 0 && ad.deposit >= 0 && (ad.rent > 0 || ad.deposit > 0)) ? ad.rent + ad.deposit * rr : NaN;
  }
  return ad.total > 0 ? ad.total : (ad.ppm > 0 && ad.area > 0 ? ad.ppm * ad.area : NaN);
}

// ---------- fair value of a (saved) ad with the same calls render() makes; total toman (sale) or monthly equivalent (rent)
function fairOf(ad0, token) {
  try {
    const q = store.get("q:" + token, { street: "", plan: "", npark: "" }); if (!q.deed) q.deed = ad0.deed || "single";
    const ad = { ...ad0 };
    if (q.area > 0) { if (ad.comCat === "plot-old") ad.land = q.area; else ad.area = q.area; }
    if (q.year > 1300) ad.year = q.year;
    state.mode = store.get("mode", "m24"); state.win = store.get("win", "3y");
    const rate = store.get("fxManual", 0) || (FX && FX[state.mode]) || 0;
    const dist = store.get("over", {})[norm(ad.hood)] ?? lookup(ad.hood);
    let f, k;
    if (ad.type === "com") { f = comRange(ad, ad.comCat, q, rate); k = f.size; if (!(rate > 0) && DFP_COM[ad.comCat].kind === "sale") return null; }
    else if (isRentAd(ad)) { f = ad.iran ? iranRange(ad, "rent", q, 0) : rentRange(ad, q); k = ad.area; }
    else { if (!(rate > 0)) return null; f = ad.iran ? iranRange(ad, "sale", q, rate) : fairRange(ad, dist, state.win, q); k = ad.area * rate; }
    if (!f || !(k > 0)) return null;
    const r = { mid: f.mid * k, lo: f.lo * k, hi: f.hi * k };
    return r.mid > 0 && isFinite(r.mid) ? r : null;
  } catch (e) { return null; }
}

// ---------- tabs (each pane keeps its own AD / TOKEN / ROOT of the report engine)
const PANE = { link: { AD: null, TOKEN: null, root: null }, manual: { AD: null, TOKEN: null, root: null }, fav: {} };
let curTab = "link";
function showTab(name) {
  if (curTab !== "fav") { PANE[curTab].AD = AD; PANE[curTab].TOKEN = TOKEN; }
  curTab = name;
  document.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== name);
  document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  if (name === "fav") renderFavs();
  else { AD = PANE[name].AD; TOKEN = PANE[name].TOKEN; setRoot(PANE[name].root); }
}

// ---------- manual estimate
// Quality of the unit's position inside its neighborhood: 5 tiers x 3 alley strengths = 15 cells.
// Each cell is a z-score on the neighborhood's OWN price spread (quartiles lo/hi from the fitted data), spaced 0.2 apart.
const QUAL = [["top", "عالی"], ["good", "خوب"], ["mid", "متوسط"], ["weak", "ضعیف"], ["vweak", "خیلی ضعیف"]];
const ALLEY = [["strong", "قوی"], ["mid", "متوسط"], ["weak", "ضعیف"]];
const ZQ = { top: 1.2, good: 0.6, mid: 0, weak: -0.6, vweak: -1.2 }, ZA = { strong: 0.2, mid: 0, weak: -0.2 }, IQR_Z = 0.6745;
const nq = s => norm(String(s || "")).toLowerCase();

function spreadOf(kind, city, slug, dist) {              // {lo, hi} = p25/median, p75/median of the units in this neighborhood
  state.mode = store.get("mode", "m24"); state.win = store.get("win", "3y");
  if (city === "tehran") {
    if (kind === "rent") { const nb = slug && DFP_RENT.nb[slug]; return nb ? { lo: nb.lo, hi: nb.hi } : { lo: 0.85, hi: 1.15 }; }
    const nb = slug && DFP_COEF.nb[slug]; if (nb) return { lo: nb.lo, hi: nb.hi };
    const b = bands("3y")[dist || 0]; return { lo: b[1] / b[2], hi: b[3] / b[2] };
  }
  const c = DFP_IRAN[kind].city[city]; if (!c) return { lo: 0.9, hi: 1.1 };
  const nb = slug && c.nb[slug]; return nb ? { lo: nb.lo, hi: nb.hi } : { lo: c.lo, hi: c.hi };
}
function qFactor(sp, qual, alley) {                       // multiplier on the neighborhood median
  const z = ZQ[qual || "mid"] + ZA[alley || "mid"];
  return z >= 0 ? Math.exp(z * Math.log(sp.hi) / IQR_Z) : Math.exp(-z * Math.log(sp.lo) / IQR_Z);
}

function fillSelect(sel, list, keep) {
  sel.innerHTML = list.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join("");
  if (keep !== undefined && list.some(([v]) => v === keep)) sel.value = keep;
}
const SUBS = { load: () => store.get("subareas", []), save: a => store.set("subareas", a) };
function manualHoods(city, kind) {                        // [value, label]; sub-areas defined by the user follow their neighborhood
  let keys;
  if (city === "tehran") keys = Array.from(new Set(Object.keys(DFP_COEF.nb).concat(Object.keys(DFP_RENT.nb))));
  else { const c = DFP_IRAN[kind].city[city]; keys = c ? Object.keys(c.nb) : []; }
  const nm = k => city === "tehran" ? (DFP_FA[k] || k) : k, subs = SUBS.load().filter(x => x.city === city);
  const out = [];
  keys.map(k => [k, nm(k)]).sort((a, b) => a[1].localeCompare(b[1], "fa")).forEach(([k, n]) => {
    out.push([k, n]);
    subs.filter(x => x.slug === k).forEach(x => out.push([k + "#" + x.id, `${n} ← ${x.name}`]));
  });
  return out;
}
function manualCities(kind) {
  const ks = Object.keys(DFP_IRAN[kind].city);
  return [["tehran", "تهران"]].concat(ks.map(k => [k, cityName(k)]).sort((a, b) => a[1].localeCompare(b[1], "fa")));
}

function initManual() {
  const g = id => document.getElementById(id);
  const kindEl = g("m-kind"), cityEl = g("m-city"), hoodEl = g("m-hood");
  let HOODS = [], CITIES = [];
  const kindKey = () => kindEl.value === "rent" ? "rent" : "sale";
  const curHood = () => { const [slug, sub] = (hoodEl.value || "").split("#"); return { slug: slug || "", sub: sub ? SUBS.load().find(x => x.id === sub && x.city === cityEl.value && x.slug === slug) : null }; };
  const hoodFa = () => { const { slug, sub } = curHood(); if (!slug) return ""; const b = (cityEl.value === "tehran" ? (DFP_FA[slug] || slug) : slug).replace(/\s*\(.*\)\s*$/, ""); return b; };
  const distOf = () => { const h = hoodFa(); return h ? (store.get("over", {})[norm(h)] ?? lookup(h)) : 0; };

  // ---- search: filters the option list as the user types (matches Persian name, slug, sub-area name)
  const filt = (selEl, list, qEl, cntEl, keep) => {
    const qv = nq(qEl.value), prev = keep !== undefined ? keep : selEl.value;
    const lst = qv ? list.filter(([v, l]) => nq(l).includes(qv) || nq(v).includes(qv)) : list;
    const out = (selEl === hoodEl && !qv ? [["", cityEl.value === "tehran" ? "نامشخص (سطح کل تهران)" : "نامشخص (سطح کل شهر)"]] : []).concat(lst);
    fillSelect(selEl, out.length ? out : [["", "موردی پیدا نشد"]], prev);
    if (qv && lst.length && !lst.some(([v]) => v === prev)) selEl.value = lst[0][0];
    cntEl.textContent = qv ? (lst.length ? fa(lst.length) + " مورد" : "موردی پیدا نشد") : "";
  };
  const refreshHoods = keep => { HOODS = manualHoods(cityEl.value, kindKey()); filt(hoodEl, HOODS, g("m-hood-q"), g("m-hood-cnt"), keep); onHood(); };
  const refreshCities = () => { CITIES = manualCities(kindKey()); const keep = cityEl.value || "tehran"; filt(cityEl, CITIES, g("m-city-q"), g("m-city-cnt"), keep); if (!cityEl.value) cityEl.value = keep; };

  // ---- quality / alley grid for the selected neighborhood
  const pc = f => { const p = (f - 1) * 100; return (p > 0.05 ? "+" : p < -0.05 ? "−" : "") + Math.abs(p).toLocaleString("fa-IR", { maximumFractionDigits: 0 }) + "٪"; };
  const renderGrid = () => {
    const { slug } = curHood(), sp = spreadOf(kindKey(), cityEl.value, slug, distOf()), qs = g("m-qual").value, as = g("m-alley").value;
    g("m-grid").innerHTML = `<thead><tr><th>کیفیت محله \ کوچه</th>${ALLEY.map(a => `<th>${a[1]}</th>`).join("")}</tr></thead><tbody>` +
      QUAL.map(([qk, qn]) => `<tr><th>${qn}</th>${ALLEY.map(([ak]) => `<td class="${(qs || "mid") === qk && (as || "mid") === ak && (qs || as) ? "cell-on" : ""}">${pc(qFactor(sp, qk, ak))}</td>`).join("")}</tr>`).join("") + `</tbody>`;
    g("m-sigma").textContent = `پراکندگی قیمت در این ${slug ? "محله" : "سطح"}: چارک پایین ${pc(sp.lo)} و چارک بالا ${pc(sp.hi)} نسبت به میانه`;
    g("m-qcap").textContent = (qs || as) ? `ضریب کیفیت و کوچه: ${pc(qFactor(sp, qs, as))} نسبت به میانه محله` : "کیفیت و کوچه نامشخص: قیمت میانه محله با بازه کامل.";
  };
  const syncParking = () => { g("m-pcount-l").hidden = !(g("m-park").value === "1" && kindKey() === "sale"); };
  const syncSubBtns = () => { const { slug, sub } = curHood(); g("m-subsave").hidden = !slug || !!sub || !(g("m-qual").value || g("m-alley").value); g("m-subdel").hidden = !sub; };
  function onHood() {
    const { sub } = curHood(); if (sub) { g("m-qual").value = sub.qual; g("m-alley").value = sub.alley; }
    renderGrid(); syncSubBtns();
  }

  // ---- the estimate itself (reset=true on the button, false when a form field changes after the first estimate)
  const err = t => { g("m-err").textContent = t || ""; };
  async function runManual(reset) {
    const area = +g("m-area").value; if (!(area >= 10 && area <= 5000)) return err("متراژ را وارد کنید (۱۰ تا ۵۰۰۰ متر).");
    const year = +g("m-year").value, fl = g("m-floor").value;
    if (g("m-year").value && !(year > 1300 && year < 1500)) return err("سال ساخت را شمسی و چهار رقمی وارد کنید (مثلاً ۱۳۹۵).");
    err("");
    const tri = id => { const v = g(id).value; return v === "" ? null : v === "1"; };
    if (!cityEl.value) return err("شهر را انتخاب کنید.");
    const rent = kindKey() === "rent", city = cityEl.value, { slug, sub } = curHood(), hf = hoodFa();
    const mil = id => { const v = parseFloat(g(id).value); return v >= 0 ? v : NaN; };
    const ad = { title: `تخمین دستی — ${hf || cityName(city)}${sub ? " ← " + sub.name : ""}`, type: rent ? "rent" : "sale", ppm: NaN, total: NaN, area, year: year > 1300 ? year : null,
      floor: fl === "" ? null : parseInt(fl, 10), deposit: NaN, rent: NaN, elevator: tri("m-elev"), parking: tri("m-park"), warehouse: tri("m-ware"), npark: 0,
      slug, hood: hf, city, cityFa: cityName(city), src: "", cat: "", comCat: "", iran: city !== "tehran" };
    if (rent) { const dep = mil("m-dep"), rn = mil("m-rent"); if (dep >= 0 || rn >= 0) { ad.deposit = dep >= 0 ? dep * 1e6 : 0; ad.rent = rn >= 0 ? rn * 1e6 : 0; } }
    else { const t = mil("m-total"); if (t > 0) { ad.total = t * 1e9; ad.ppm = ad.total / area; } }
    const q = reset ? { street: "", plan: "", npark: "" } : store.get("q:manual", { street: "", plan: "", npark: "" });
    const qs = g("m-qual").value, as = g("m-alley").value;
    if (qs || as) { DFP_COEF.quality.street.mq = qFactor(spreadOf(rent ? "rent" : "sale", city, slug, distOf()), qs, as); q.street = "mq"; } else q.street = "";
    const pk = g("m-park").value; q.npark = !rent && pk === "1" ? g("m-pcount").value : pk === "0" ? "0" : "";
    store.set("q:manual", q);
    FX = FX || await getRate();
    PANE.manual.root = g("mreport"); setRoot(PANE.manual.root);
    AD = ad; TOKEN = "manual"; PANE.manual.AD = AD; PANE.manual.TOKEN = TOKEN;
    render();
    if (reset) g("mreport").scrollIntoView({ behavior: "smooth" });
  }
  const live = () => { if (PANE.manual.AD) runManual(false); };

  // ---- wiring
  kindEl.onchange = () => { refreshCities(); refreshHoods(""); syncParking(); g("m-sale-price").hidden = kindKey() === "rent"; g("m-rent-price").hidden = kindKey() !== "rent"; live(); };
  cityEl.onchange = () => { refreshHoods(""); live(); };
  hoodEl.onchange = () => { onHood(); live(); };
  g("m-city-q").oninput = () => { filt(cityEl, CITIES, g("m-city-q"), g("m-city-cnt")); refreshHoods(""); };
  g("m-hood-q").oninput = () => { filt(hoodEl, HOODS, g("m-hood-q"), g("m-hood-cnt")); onHood(); };
  g("m-qual").onchange = g("m-alley").onchange = () => { renderGrid(); syncSubBtns(); live(); };
  g("m-park").onchange = () => { syncParking(); live(); };
  ["m-pcount", "m-elev", "m-ware", "m-area", "m-year", "m-floor", "m-total", "m-dep", "m-rent"].forEach(id => g(id).addEventListener("change", live));
  g("m-subsave").onclick = () => {
    const { slug } = curHood(), name = (prompt("نام زیرمحله را بنویسید (مثلاً شمالی، جنوبی، نزدیک خیابان اصلی):") || "").trim(); if (!slug || !name) return;
    const subs = SUBS.load(), id = Date.now().toString(36);
    subs.push({ id, city: cityEl.value, slug, name, qual: g("m-qual").value || "mid", alley: g("m-alley").value || "mid" }); SUBS.save(subs);
    g("m-hood-q").value = ""; refreshHoods(slug + "#" + id); live();
  };
  g("m-subdel").onclick = () => {
    const { slug, sub } = curHood(); if (!sub || !confirm("این زیرمحله حذف شود؟")) return;
    SUBS.save(SUBS.load().filter(x => x.id !== sub.id)); refreshHoods(slug); live();
  };
  g("m-go").onclick = () => runManual(true);
  const qText = () => { const qn = (QUAL.find(x => x[0] === g("m-qual").value) || [])[1], an = (ALLEY.find(x => x[0] === g("m-alley").value) || [])[1]; return "کیفیت محله " + (qn || "متوسط") + "، کوچه " + (an || "متوسط"); };
  new MutationObserver(() => {
    g("mreport").querySelectorAll('select[data-q="street"],select[data-q="npark"]').forEach(s => { const l = s.closest("label"); if (l) l.style.display = "none"; });
    g("mreport").querySelectorAll("p.small").forEach(p => { if (p.textContent.includes("موقعیت undefined")) p.textContent = p.textContent.replace("موقعیت undefined", qText()); });   // label of the custom quality key
  }).observe(g("mreport"), { childList: true });
  refreshCities(); refreshHoods(""); syncParking();
  g("m-sale-price").hidden = false; g("m-rent-price").hidden = true;
}

// ---------- favorites
const FAV = { load: () => store.get("favs", []), save: a => store.set("favs", a) };
let FAVSEL = [], FAVMSG = "";

function makeSnap(ad, token) {
  const fv = fairOf(ad, token);
  return { t: Date.now(), price: num(adPrice(ad)), total: num(ad.total), ppm: num(ad.ppm), deposit: num(ad.deposit), rent: num(ad.rent),
           area: num(areaOf(ad)), year: ad.year || null, floor: ad.floor === undefined ? null : ad.floor, fair: fv ? Math.round(fv.mid) : null };
}
function snapChanged(a, b) {
  for (const k of ["price", "area", "year", "floor"]) if ((a[k] ?? null) !== (b[k] ?? null)) return true;
  return !!(a.fair && b.fair && Math.abs(b.fair / a.fair - 1) > 0.02);
}
function recordAd(f, ad) {
  f.ad = ad; f.checked = Date.now(); f.gone = null; f.err = null;
  const s = makeSnap(ad, f.token), last = f.snaps[f.snaps.length - 1];
  if (!last || snapChanged(last, s)) { f.snaps.push(s); if (f.snaps.length > 300) f.snaps.splice(1, f.snaps.length - 300); }
  f.fair = s.fair;
  return !last || f.snaps[f.snaps.length - 1] === s;
}
function favByToken(favs, token) { return favs.find(f => f.token === token); }

async function saveCurrentFav() {
  const msg = document.getElementById("savemsg");
  if (!AD || !TOKEN || TOKEN === "manual") return;
  FX = FX || await getRate();
  const favs = FAV.load(); let f = favByToken(favs, TOKEN), isNew = !f;
  if (!f) { f = { token: TOKEN, url: "https://divar.ir/v/a/" + TOKEN, savedAt: Date.now(), snaps: [] }; favs.unshift(f); }
  const changed = recordAd(f, AD);
  FAV.save(favs);
  msg.textContent = isNew ? "به علاقه‌مندی‌ها اضافه شد ✓" : changed ? "اطلاعات تازه ذخیره شد ✓ (تغییر قیمت/مشخصات ثبت شد)" : "قبلاً ذخیره شده بود؛ تغییری نکرده است.";
  updateSaveBar();
}
function updateSaveBar() {
  const bar = document.getElementById("savebar"), btn = document.getElementById("savebtn");
  const ok = curTab === "link" && AD && TOKEN && TOKEN !== "manual" && !document.getElementById("report").querySelector(".err");
  bar.hidden = !ok; if (!ok) return;
  btn.textContent = favByToken(FAV.load(), TOKEN) ? "⭐ بروزرسانی نسخه ذخیره‌شده" : "⭐ ذخیره در علاقه‌مندی‌ها";
}

async function refreshFav(f) {
  let raw;
  try { raw = await FETCH_POST(f.token); }
  catch (e) {
    const m = String((e && e.message) || e);
    if (/حذف|منقضی/.test(m)) { f.gone = f.gone || Date.now(); f.err = null; f.checked = Date.now(); return "gone"; }
    f.err = m.startsWith("خطا") ? m : "اتصال به دیوار برقرار نشد."; return "err";
  }
  const ad = parsePost(raw); if (!ad.type) { f.err = "نوع آگهی تشخیص داده نشد."; return "err"; }
  ad.iran = !!(ad.city && ad.city !== "tehran");
  return recordAd(f, ad) ? "changed" : "same";
}
async function refreshAllFavs() {
  const favs = FAV.load(); if (!favs.length) return;
  FX = FX || await getRate();
  let ch = 0, gone = 0, err = 0;
  for (let i = 0; i < favs.length; i++) {
    FAVMSG = `در حال بروزرسانی ${fa(i + 1)} از ${fa(favs.length)}…`; document.getElementById("favmsg").textContent = FAVMSG;
    const r = await refreshFav(favs[i]); if (r === "changed") ch++; else if (r === "gone") gone++; else if (r === "err") err++;
    FAV.save(favs); await new Promise(r => setTimeout(r, 350));
  }
  FAVMSG = `بروزرسانی تمام شد: ${fa(ch)} تغییر، ${fa(gone)} آگهی حذف‌شده${err ? "، " + fa(err) + " خطا" : ""}.`;
  renderFavs();
}

function spark(vals, rent) {
  if (vals.length < 2) return "";
  const mn = Math.min(...vals), mx = Math.max(...vals), W = 300, H = 56, sp = mx - mn || 1;
  const pts = vals.map((v, i) => [10 + i * (W - 20) / (vals.length - 1), 8 + (H - 16) * (1 - (v - mn) / sp)]);
  return `<svg viewBox="0 0 ${W} ${H + 14}" role="img" aria-label="روند قیمت"><polyline points="${pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--accent)"/>`).join("")}
    <text x="10" y="${H + 11}" font-size="10" fill="var(--muted)" text-anchor="end">${fmtPrice(vals[0], rent)}</text><text x="${W - 10}" y="${H + 11}" font-size="10" fill="var(--muted)" text-anchor="start">${fmtPrice(vals[vals.length - 1], rent)}</text></svg>`;
}
const pctTxt = p => (p > 0.0005 ? "+" : p < -0.0005 ? "−" : "") + Math.abs(p * 100).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + "٪";
const pctCls = (p, rent) => Math.abs(p) < 0.005 ? "" : p > 0 ? "up" : "down";

// ---------- notes & extra info per favorite
const STATUS = [["", "بدون وضعیت"], ["called", "تماس گرفتم"], ["visited", "بازدید شد"], ["negotiating", "در حال مذاکره"], ["rejected", "رد شد"], ["bought", "نهایی شد"]];
const statusName = v => (STATUS.find(x => x[0] === v) || [])[1] || "";
const XKEYS = ["تعداد خواب", "جهت ساختمان", "نما", "کف‌پوش", "گرمایش و سرمایش", "وضعیت تخلیه", "تاریخ بازدید", "قیمت توافقی", "نام مشاور / مالک"];
const starTxt = n => n > 0 ? "★".repeat(n) + "☆".repeat(5 - n) : "";
const OPENINFO = new Set();
function infoBlock(f) {                                   // summary line + note preview shown on the card
  const i = f.info || {}, bits = [];
  if (i.status) bits.push(`<span class="badge st-${esc(i.status)}">${esc(statusName(i.status))}</span>`);
  if (i.rating > 0) bits.push(`<span class="stars">${starTxt(+i.rating)}</span>`);
  if (i.address) bits.push(`<span>📍 ${esc(i.address)}</span>`);
  if (i.contact) bits.push(`<span>☎ ${esc(i.contact)}</span>`);
  const ex = (i.extra || []).filter(x => x.k || x.v).map(x => `<span>${esc(x.k)}${x.k && x.v ? ": " : ""}${esc(x.v)}</span>`);
  const note = i.note && i.note.trim() ? `<p class="note-text">${esc(i.note.trim().length > 160 ? i.note.trim().slice(0, 160) + "…" : i.note.trim())}</p>` : "";
  return (bits.length || ex.length ? `<div class="infosum">${bits.concat(ex).join("")}</div>` : "") + note;
}
function infoPanel(f) {
  const i = f.info || {}, ex = i.extra || [];
  return `<details class="info"${OPENINFO.has(f.token) ? " open" : ""}><summary>📝 یادداشت و اطلاعات تکمیلی</summary>
    <div class="f2">
      <label>وضعیت پیگیری<select data-i="status">${opts(STATUS, i.status || "")}</select></label>
      <label>امتیاز من<select data-i="rating">${opts([["", "بدون امتیاز"], [1, "★"], [2, "★★"], [3, "★★★"], [4, "★★★★"], [5, "★★★★★"]], i.rating || "")}</select></label>
      <label class="wide">آدرس<input data-i="address" dir="auto" value="${esc(i.address)}" placeholder="خیابان، کوچه، پلاک…"></label>
      <label class="wide">تماس (مالک / مشاور / تلفن)<input data-i="contact" dir="auto" value="${esc(i.contact)}"></label>
      <label class="wide">یادداشت<textarea data-i="note" rows="4" placeholder="نکته‌ها، نقاط قوت و ضعف، حرف‌های مالک…">${esc(i.note)}</textarea></label>
    </div>
    <p class="small" style="margin:8px 0 0"><b>ریز مشخصات</b> <span class="muted">(هر چیزی که می‌خواهید کنار این آگهی داشته باشید)</span></p>
    ${ex.map((x, n) => `<div class="xrow"><input data-x="k" dir="auto" value="${esc(x.k)}" placeholder="عنوان"><input data-x="v" dir="auto" value="${esc(x.v)}" placeholder="مقدار"><button data-act="xdel" data-n="${n}" aria-label="حذف">×</button></div>`).join("")}
    <div class="chips">${XKEYS.filter(k => !ex.some(x => x.k === k)).map(k => `<button data-act="xadd" data-k="${esc(k)}">+ ${esc(k)}</button>`).join("")}<button data-act="xadd" data-k="">+ مورد دلخواه</button></div>
  </details>`;
}
function collectInfo(card, f) {                           // DOM -> f.info (empty extra rows are kept so row indexes stay aligned)
  const i = f.info = f.info || {};
  card.querySelectorAll("[data-i]").forEach(el => { const k = el.dataset.i; i[k] = k === "rating" ? (+el.value || 0) : k === "note" ? el.value : el.value.trim(); });
  i.extra = Array.from(card.querySelectorAll(".xrow")).map(r => ({ k: r.querySelector('[data-x="k"]').value.trim(), v: r.querySelector('[data-x="v"]').value.trim() }));
  f.infoT = Date.now();
}
function saveInfo(card) {
  const favs = FAV.load(), f = favByToken(favs, card.dataset.token); if (!f) return;
  collectInfo(card, f); FAV.save(favs);
  const blk = card.querySelector(".infoblock"); if (blk) blk.innerHTML = infoBlock(f);
}

function favCard(f) {
  const ad = f.ad, rent = isRentAd(ad), L = f.snaps[f.snaps.length - 1] || {}, F0 = f.snaps[0] || {};
  const ch = L.price > 0 && F0.price > 0 && f.snaps.length > 1 ? L.price / F0.price - 1 : null;
  const vf = L.price > 0 && f.fair > 0 ? L.price / f.fair - 1 : null;
  const sub = [typeLabel(ad), ad.hood || cityName(ad.city), areaOf(ad) && fa(areaOf(ad)) + " متر", ad.year && "ساخت " + String(ad.year).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d])].filter(Boolean).join(" · ");
  const hist = f.snaps.slice().reverse().map((s, i, arr) => {
    const prev = arr[i + 1], d = prev && s.price > 0 && prev.price > 0 ? s.price / prev.price - 1 : null;
    return `<tr><td>${jd(s.t)}</td><td>${fmtPrice(s.price, rent)}</td><td class="${d === null ? "" : pctCls(d)}">${d === null ? "—" : pctTxt(d)}</td><td>${s.fair ? fmtPrice(s.fair, rent) : "—"}</td></tr>`;
  }).join("");
  return `<div class="fav${f.gone ? " gone" : ""}" data-token="${esc(f.token)}">
    <label class="selrow"><input type="checkbox" data-act="sel" ${FAVSEL.includes(f.token) ? "checked" : ""}> مقایسه</label>
    <h3>${esc(ad.title || "آگهی دیوار")}</h3><p class="muted small">${esc(sub)}</p>
    <div class="infoblock">${infoBlock(f)}</div>
    ${f.gone ? `<p class="badge gone">آگهی در دیوار حذف/منقضی شده (${jd(f.gone)}) — آخرین اطلاعات ذخیره‌شده نمایش داده می‌شود</p>` : ""}
    ${f.err ? `<p class="small err">${esc(f.err)}</p>` : ""}
    <div class="cards">
      <div><span>آخرین قیمت</span><b>${fmtPrice(L.price, rent)}</b></div>
      ${ch !== null ? `<div><span>تغییر از اولین ذخیره (${jd(F0.t)})</span><b class="${pctCls(ch)}">${pctTxt(ch)}</b></div>` : `<div><span>ذخیره از</span><b>${jd(f.savedAt)}</b></div>`}
      ${f.fair > 0 ? `<div><span>ارزش منصفانه (آخرین محاسبه)</span><b>${fmtPrice(f.fair, rent)}</b></div>` : ""}
      ${vf !== null ? `<div><span>قیمت نسبت به منصفانه</span><b class="${vf > 0 ? "up" : "down"}">${pctTxt(vf)} ${vf > 0 ? "گران‌تر" : "ارزان‌تر"}</b></div>` : ""}
      <div><span>آخرین بررسی</span><b>${jd(f.checked || f.savedAt)}</b></div>
    </div>
    ${spark(f.snaps.map(s => s.price).filter(v => v > 0), rent)}
    <details><summary>تاریخچه قیمت (${fa(f.snaps.length)} ثبت)</summary>
      <div class="tbl"><table><thead><tr><th>تاریخ</th><th>قیمت</th><th>تغییر</th><th>منصفانه</th></tr></thead><tbody>${hist}</tbody></table></div></details>
    ${infoPanel(f)}
    <div class="row fbtn"><button class="ghost" data-act="open">تحلیل کامل</button>${f.gone ? "" : `<button class="ghost" data-act="refresh">بروزرسانی</button>`}<button class="ghost" data-act="del">حذف</button></div>
  </div>`;
}

function compareHtml(favs) {
  const sel = FAVSEL.map(t => favByToken(favs, t)).filter(Boolean);
  if (sel.length < 2) return sel.length ? `<p class="muted small">یک آگهی دیگر هم برای مقایسه انتخاب کنید.</p>` : "";
  const [A, B2] = sel, a = A.ad, b = B2.ad, ra = isRentAd(a), rb = isRentAd(b);
  const LA = A.snaps[A.snaps.length - 1], LB = B2.snaps[B2.snaps.length - 1], FA0 = A.snaps[0], FB0 = B2.snaps[0];
  const per = (L, ad) => L.price > 0 && areaOf(ad) > 0 ? L.price / areaOf(ad) : NaN;
  const chg = (L, F0) => L.price > 0 && F0.price > 0 && F0 !== L ? L.price / F0.price - 1 : NaN;
  const vsf = (L, f) => L.price > 0 && f.fair > 0 ? L.price / f.fair - 1 : NaN;
  const dif = (x, y) => x > 0 && y > 0 ? pctTxt(y / x - 1) : "";
  const ia = A.info || {}, ib = B2.info || {}, xv = (i, k) => ((i.extra || []).find(x => x.k === k && x.v) || {}).v || "—";
  const xkeys = Array.from(new Set((ia.extra || []).concat(ib.extra || []).filter(x => x.k && x.v).map(x => x.k)));
  const R = [
    ["نوع", typeLabel(a), typeLabel(b), ""],
    ["محل", a.hood || cityName(a.city), b.hood || cityName(b.city), ""],
    ["متراژ", areaOf(a) ? fa(areaOf(a)) : "—", areaOf(b) ? fa(areaOf(b)) : "—", dif(areaOf(a), areaOf(b))],
    ["سال ساخت", a.year ? String(a.year).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]) : "—", b.year ? String(b.year).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]) : "—", ""],
    ["طبقه", a.floor != null ? fa(a.floor) : "—", b.floor != null ? fa(b.floor) : "—", ""],
    ["قیمت فعلی", fmtPrice(LA.price, ra), fmtPrice(LB.price, rb), dif(LA.price, LB.price)],
    ["قیمت هر متر", per(LA, a) > 0 ? (ra ? d1(per(LA, a) / 1e6) + " میلیون/ماه" : d1(per(LA, a) / 1e6) + " میلیون") : "—", per(LB, b) > 0 ? (rb ? d1(per(LB, b) / 1e6) + " میلیون/ماه" : d1(per(LB, b) / 1e6) + " میلیون") : "—", dif(per(LA, a), per(LB, b))],
    ["ارزش منصفانه", A.fair > 0 ? fmtPrice(A.fair, ra) : "—", B2.fair > 0 ? fmtPrice(B2.fair, rb) : "—", dif(A.fair, B2.fair)],
    ["قیمت نسبت به منصفانه", isNaN(vsf(LA, A)) ? "—" : pctTxt(vsf(LA, A)), isNaN(vsf(LB, B2)) ? "—" : pctTxt(vsf(LB, B2)), ""],
    ["تغییر از اولین ذخیره", isNaN(chg(LA, FA0)) ? "—" : pctTxt(chg(LA, FA0)), isNaN(chg(LB, FB0)) ? "—" : pctTxt(chg(LB, FB0)), ""],
    ["وضعیت پیگیری", esc(statusName(ia.status) || "—"), esc(statusName(ib.status) || "—"), ""],
    ["امتیاز من", ia.rating > 0 ? starTxt(+ia.rating) : "—", ib.rating > 0 ? starTxt(+ib.rating) : "—", ""],
    ["آدرس", esc(ia.address || "—"), esc(ib.address || "—"), ""],
    ["تماس", esc(ia.contact || "—"), esc(ib.contact || "—"), ""],
    ...xkeys.map(k => [esc(k), esc(xv(ia, k)), esc(xv(ib, k)), ""]),
    ["یادداشت", esc((ia.note || "—").slice(0, 140)), esc((ib.note || "—").slice(0, 140)), ""],
    ["ذخیره از", jd(A.savedAt), jd(B2.savedAt), ""],
    ["وضعیت", A.gone ? "حذف‌شده" : "فعال", B2.gone ? "حذف‌شده" : "فعال", ""],
  ];
  return `<h3>مقایسه</h3>${ra !== rb ? `<p class="small err">⚠ یکی فروش و دیگری اجاره است؛ قیمت‌ها قابل مقایسه مستقیم نیستند.</p>` : ""}
    <div class="tbl"><table class="cmp"><thead><tr><th></th><th>${esc(a.title || "آگهی ۱").slice(0, 40)}</th><th>${esc(b.title || "آگهی ۲").slice(0, 40)}</th><th>دومی نسبت به اولی</th></tr></thead>
    <tbody>${R.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderFavs() {
  const favs = FAV.load(), el = document.getElementById("favlist");
  FAVSEL = FAVSEL.filter(t => favByToken(favs, t));
  document.getElementById("favtools").hidden = !favs.length;
  document.getElementById("favmsg").textContent = FAVMSG; FAVMSG = "";
  const qv = nq(document.getElementById("fav-q").value);
  const hay = f => { const i = f.info || {}, a = f.ad || {}; return nq([a.title, a.hood, cityName(a.city), i.address, i.contact, i.note, statusName(i.status)].concat((i.extra || []).map(x => x.k + " " + x.v)).join(" ")); };
  const shown = qv ? favs.filter(f => hay(f).includes(qv)) : favs;
  el.innerHTML = shown.length ? shown.map(favCard).join("") : favs.length ? `<p class="muted">موردی پیدا نشد.</p>` : `<p class="muted">هنوز آگهی‌ای ذخیره نشده. در تب «تحلیل لینک» یک آگهی را باز کنید و دکمه «ذخیره در علاقه‌مندی‌ها» را بزنید.</p>`;
  const cm = document.getElementById("favcmp"); cm.innerHTML = compareHtml(favs); cm.hidden = !cm.innerHTML;
}

async function openFav(token) {
  const favs = FAV.load(), f = favByToken(favs, token); if (!f) return;
  showTab("link"); FX = FX || await getRate();
  document.getElementById("link").value = f.url;
  let raw = null;
  try { raw = await FETCH_POST(token); }
  catch (e) { if (/حذف|منقضی/.test(String((e && e.message) || e))) { f.gone = f.gone || Date.now(); FAV.save(favs); } }
  if (raw) {
    const orig = FETCH_POST; FETCH_POST = async () => raw;
    try { await analyzeToken(token); } finally { FETCH_POST = orig; }
    if (AD && TOKEN === token) { recordAd(f, AD); FAV.save(favs); updateSaveBar(); }
  } else {
    AD = { ...f.ad, iran: !!(f.ad.city && f.ad.city !== "tehran") }; TOKEN = token; PANE.link.AD = AD; PANE.link.TOKEN = TOKEN;
    render();
    ROOT.insertAdjacentHTML("afterbegin", `<p class="badge gone">${f.gone ? "این آگهی در دیوار حذف یا منقضی شده؛ تحلیل با آخرین اطلاعات ذخیره‌شده (" + jd(f.checked || f.savedAt) + ") انجام شد." : "اتصال به دیوار برقرار نشد؛ تحلیل با آخرین اطلاعات ذخیره‌شده انجام شد."}</p>`);
    updateSaveBar();
  }
}

async function clipWrite(t) {
  const cb = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Clipboard;
  if (cb) { await cb.write({ string: t }); return true; }
  if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; }
  return false;
}
async function clipRead() {
  const cb = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Clipboard;
  return cb ? (await cb.read()).value : await navigator.clipboard.readText();
}
function importBackup(text) {                              // clipboard text is untrusted: validate before merging
  let o; try { o = JSON.parse(text); } catch { return null; }
  if (!o || o.app !== "fair-price" || !Array.isArray(o.favs)) return null;
  const cur = FAV.load(); let add = 0, upd = 0;
  for (const f of o.favs) {
    if (!f || typeof f.token !== "string" || !/^[A-Za-z0-9_-]{8}$/.test(f.token) || !f.ad || !["sale", "rent", "com"].includes(f.ad.type) || !Array.isArray(f.snaps)) continue;
    if (f.ad.type === "com" && !DFP_COM[f.ad.comCat]) continue;
    const c = favByToken(cur, f.token);
    if (!c) { cur.push(f); add++; continue; }
    const seen = new Set(c.snaps.map(x => x.t)); f.snaps.forEach(x => { if (!seen.has(x.t)) c.snaps.push(x); }); c.snaps.sort((a, b) => a.t - b.t);
    if ((f.checked || 0) > (c.checked || 0)) { c.ad = f.ad; c.checked = f.checked; c.fair = f.fair; c.gone = f.gone; }
    if (f.info && (!c.info || (f.infoT || 0) > (c.infoT || 0))) { c.info = f.info; c.infoT = f.infoT; }
    upd++;
  }
  FAV.save(cur);
  const subs = SUBS.load(); (Array.isArray(o.subareas) ? o.subareas : []).forEach(x => { if (x && x.id && x.slug && x.name && !subs.some(y => y.id === x.id)) subs.push(x); }); SUBS.save(subs);
  return { add, upd };
}

function initFavs() {
  document.getElementById("savebtn").onclick = saveCurrentFav;
  document.getElementById("fav-q").oninput = renderFavs;
  const fl = document.getElementById("favlist"); let infoT;
  fl.addEventListener("input", e => { const card = e.target.closest(".fav"); if (!card || !e.target.closest("details.info")) return; clearTimeout(infoT); infoT = setTimeout(() => saveInfo(card), 350); });
  fl.addEventListener("change", e => { const card = e.target.closest(".fav"); if (!card || !e.target.closest("details.info")) return; clearTimeout(infoT); saveInfo(card); });
  fl.addEventListener("toggle", e => { const d = e.target; if (!d.matches || !d.matches("details.info")) return; const t = d.closest(".fav").dataset.token; if (d.open) OPENINFO.add(t); else OPENINFO.delete(t); }, true);
  document.getElementById("fav-export").onclick = async () => {
    const msg = document.getElementById("fav-bkmsg"), favs = FAV.load(); if (!favs.length) { msg.textContent = "هنوز چیزی ذخیره نشده."; return; }
    const txt = JSON.stringify({ app: "fair-price", v: 1, t: Date.now(), favs, subareas: SUBS.load() });
    try { msg.textContent = (await clipWrite(txt)) ? `پشتیبان ${fa(favs.length)} آگهی کپی شد؛ آن را جایی بچسبانید و نگه دارید.` : "کپی خودکار ممکن نبود."; } catch { msg.textContent = "کپی خودکار ممکن نبود."; }
  };
  document.getElementById("fav-import").onclick = async () => {
    const msg = document.getElementById("fav-bkmsg"); let t = ""; try { t = await clipRead(); } catch {}
    const r = t ? importBackup(t) : null;
    if (!r) { msg.textContent = "در کلیپ‌بورد پشتیبان معتبری پیدا نشد. ابتدا متن پشتیبان را کپی کنید."; return; }
    FAVMSG = `بازیابی شد: ${fa(r.add)} آگهی جدید، ${fa(r.upd)} آگهی ادغام‌شده.`; renderFavs();
  };
  document.getElementById("favall").onclick = refreshAllFavs;
  document.getElementById("favlist").onclick = async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const card = b.closest(".fav"), token = card.dataset.token, act = b.dataset.act;
    if (act === "sel") {
      FAVSEL = FAVSEL.filter(t => t !== token); if (b.checked) FAVSEL.push(token); if (FAVSEL.length > 2) FAVSEL.shift();
      return renderFavs();
    }
    if (act === "xadd" || act === "xdel") {
      const favs = FAV.load(), f = favByToken(favs, token); if (!f) return;
      collectInfo(card, f); f.info.extra = f.info.extra || [];
      if (act === "xadd") f.info.extra.push({ k: b.dataset.k || "", v: "" }); else f.info.extra.splice(+b.dataset.n, 1);
      FAV.save(favs); OPENINFO.add(token); renderFavs();
      if (act === "xadd") { const rows = document.querySelectorAll(`.fav[data-token="${token}"] .xrow`), last = rows[rows.length - 1]; if (last) last.querySelector(b.dataset.k ? '[data-x="v"]' : '[data-x="k"]').focus(); }
      return;
    }
    if (act === "open") return openFav(token);
    if (act === "del") { if (!confirm("این آگهی از علاقه‌مندی‌ها و تاریخچه‌اش حذف شود؟")) return; FAV.save(FAV.load().filter(f => f.token !== token)); return renderFavs(); }
    if (act === "refresh") {
      b.disabled = true; b.textContent = "…"; FX = FX || await getRate();
      const favs = FAV.load(), f = favByToken(favs, token), r = await refreshFav(f); FAV.save(favs);
      FAVMSG = r === "changed" ? "تغییر جدید ثبت شد." : r === "same" ? "تغییری نکرده است." : r === "gone" ? "آگهی در دیوار حذف شده است." : "بروزرسانی انجام نشد.";
      renderFavs();
    }
  };
}

// ---------- theme: auto (follows the phone) / light / dark
const THEME_ICON = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>' };
const THEME_NAME = { auto: "خودکار (مطابق گوشی)", light: "روز", dark: "شب" };
function toast(t) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 1500);
}
function applyTheme(t) {
  const r = document.documentElement; if (t === "light" || t === "dark") r.setAttribute("data-theme", t); else r.removeAttribute("data-theme");
  const b = document.getElementById("theme"); b.innerHTML = THEME_ICON[t]; b.setAttribute("aria-label", "تم: " + THEME_NAME[t]); b.title = "تم: " + THEME_NAME[t];
}
function initTheme() {
  let t = store.get("theme", "auto"); if (!THEME_ICON[t]) t = "auto"; applyTheme(t);
  document.getElementById("theme").onclick = () => { t = t === "auto" ? "light" : t === "light" ? "dark" : "auto"; store.set("theme", t); applyTheme(t); toast("تم: " + THEME_NAME[t]); };
}

// ---------- boot
window.addEventListener("DOMContentLoaded", () => {
  PANE.link.root = document.getElementById("report"); PANE.manual.root = document.getElementById("mreport");
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => showTab(b.dataset.tab));
  initTheme(); initManual(); initFavs();
  const _analyzeToken = analyzeToken;
  analyzeToken = async function (t) { await _analyzeToken(t); PANE.link.AD = AD; PANE.link.TOKEN = TOKEN; updateSaveBar(); document.getElementById("savemsg").textContent = ""; };
  new MutationObserver(updateSaveBar).observe(PANE.link.root, { childList: true });
});
