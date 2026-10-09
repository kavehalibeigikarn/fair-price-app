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
function fillSelect(sel, list, keep) {
  sel.innerHTML = list.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join("");
  if (keep && list.some(([v]) => v === keep)) sel.value = keep;
}
function manualHoods(city, kind) {
  let keys;
  if (city === "tehran") keys = Array.from(new Set(Object.keys(DFP_COEF.nb).concat(Object.keys(DFP_RENT.nb))));
  else { const c = DFP_IRAN[kind].city[city]; keys = c ? Object.keys(c.nb) : []; }
  const nm = k => city === "tehran" ? (DFP_FA[k] || k) : k;
  return [["", city === "tehran" ? "نامشخص (سطح کل تهران)" : "نامشخص (سطح کل شهر)"]].concat(keys.map(k => [k, nm(k)]).sort((a, b) => a[1].localeCompare(b[1], "fa")));
}
function manualCities(kind) {
  const ks = Object.keys(DFP_IRAN[kind].city);
  return [["tehran", "تهران"]].concat(ks.map(k => [k, cityName(k)]).sort((a, b) => a[1].localeCompare(b[1], "fa")));
}
function initManual() {
  const g = id => document.getElementById(id);
  const kindEl = g("m-kind"), cityEl = g("m-city"), hoodEl = g("m-hood");
  const syncHood = () => { fillSelect(hoodEl, manualHoods(cityEl.value, kindEl.value === "rent" ? "rent" : "sale")); };
  const syncCity = () => { fillSelect(cityEl, manualCities(kindEl.value === "rent" ? "rent" : "sale"), cityEl.value); syncHood(); };
  const syncPrice = () => { const r = kindEl.value === "rent"; g("m-sale-price").hidden = r; g("m-rent-price").hidden = !r; };
  kindEl.onchange = () => { syncCity(); syncPrice(); };
  cityEl.onchange = syncHood;
  syncCity(); syncPrice();
  g("m-go").onclick = async () => {
    const err = t => { g("m-err").textContent = t || ""; };
    const area = +g("m-area").value; if (!(area >= 10 && area <= 5000)) return err("متراژ را وارد کنید (۱۰ تا ۵۰۰۰ متر).");
    const year = +g("m-year").value, fl = g("m-floor").value;
    if (g("m-year").value && !(year > 1300 && year < 1500)) return err("سال ساخت را شمسی و چهار رقمی وارد کنید (مثلاً ۱۳۹۵).");
    err("");
    const tri = id => { const v = g(id).value; return v === "" ? null : v === "1"; };
    const rent = kindEl.value === "rent", city = cityEl.value, slug = hoodEl.value;
    const hoodFa = slug ? (city === "tehran" ? (DFP_FA[slug] || slug) : slug).replace(/\s*\(.*\)\s*$/, "") : "";
    const mil = id => { const v = parseFloat(g(id).value); return v >= 0 ? v : NaN; };
    const ad = { title: `تخمین دستی — ${hoodFa || cityName(city)}`, type: rent ? "rent" : "sale", ppm: NaN, total: NaN, area, year: year > 1300 ? year : null,
      floor: fl === "" ? null : parseInt(fl, 10), deposit: NaN, rent: NaN, elevator: tri("m-elev"), parking: tri("m-park"), warehouse: tri("m-ware"), npark: 0,
      slug, hood: hoodFa, city, cityFa: cityName(city), src: "", cat: "", comCat: "", iran: city !== "tehran" };
    if (rent) { const dep = mil("m-dep"), rn = mil("m-rent"); if (dep >= 0 || rn >= 0) { ad.deposit = dep >= 0 ? dep * 1e6 : 0; ad.rent = rn >= 0 ? rn * 1e6 : 0; } }
    else { const t = mil("m-total"); if (t > 0) { ad.total = t * 1e9; ad.ppm = ad.total / area; } }
    store.set("q:manual", { street: "", plan: "", npark: "" });
    FX = FX || await getRate();
    PANE.manual.root = g("mreport"); setRoot(PANE.manual.root);
    AD = ad; TOKEN = "manual"; PANE.manual.AD = AD; PANE.manual.TOKEN = TOKEN;
    render();
    g("mreport").scrollIntoView({ behavior: "smooth" });
  };
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
    <text x="10" y="${H + 11}" font-size="10" fill="var(--muted)">${fmtPrice(vals[0], rent)}</text><text x="${W - 10}" y="${H + 11}" font-size="10" fill="var(--muted)" text-anchor="end">${fmtPrice(vals[vals.length - 1], rent)}</text></svg>`;
}
const pctTxt = p => (p > 0.0005 ? "+" : p < -0.0005 ? "−" : "") + Math.abs(p * 100).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + "٪";
const pctCls = (p, rent) => Math.abs(p) < 0.005 ? "" : p > 0 ? "up" : "down";

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
  el.innerHTML = favs.length ? favs.map(favCard).join("") : `<p class="muted">هنوز آگهی‌ای ذخیره نشده. در تب «تحلیل لینک» یک آگهی را باز کنید و دکمه «ذخیره در علاقه‌مندی‌ها» را بزنید.</p>`;
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

function initFavs() {
  document.getElementById("savebtn").onclick = saveCurrentFav;
  document.getElementById("favall").onclick = refreshAllFavs;
  document.getElementById("favlist").onclick = async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const card = b.closest(".fav"), token = card.dataset.token, act = b.dataset.act;
    if (act === "sel") {
      FAVSEL = FAVSEL.filter(t => t !== token); if (b.checked) FAVSEL.push(token); if (FAVSEL.length > 2) FAVSEL.shift();
      return renderFavs();
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

// ---------- boot
window.addEventListener("DOMContentLoaded", () => {
  PANE.link.root = document.getElementById("report"); PANE.manual.root = document.getElementById("mreport");
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => showTab(b.dataset.tab));
  initManual(); initFavs();
  const _analyzeToken = analyzeToken;
  analyzeToken = async function (t) { await _analyzeToken(t); PANE.link.AD = AD; PANE.link.TOKEN = TOKEN; updateSaveBar(); document.getElementById("savemsg").textContent = ""; };
  new MutationObserver(updateSaveBar).observe(PANE.link.root, { childList: true });
});
