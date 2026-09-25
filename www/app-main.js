// App boot: report container, shared link (?share=...), paste button.
window.addEventListener("DOMContentLoaded", async () => {
  setRoot(document.getElementById("report"));
  const st = document.createElement("style"); st.textContent = REPORT_CSS; document.head.appendChild(st);
  document.getElementById("go").onclick = () => analyze(document.getElementById("link").value);
  document.getElementById("paste").onclick = async () => {
    let t = "";
    try {                                                    // native clipboard plugin (Android WebView has no navigator.clipboard.readText)
      const cb = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Clipboard;
      t = cb ? (await cb.read()).value : await navigator.clipboard.readText();
    } catch (e) { t = ""; }
    if (t) { document.getElementById("link").value = t; analyze(t); }
    else { const el = document.getElementById("link"); el.focus(); el.placeholder = "کلیپ‌بورد خالی است یا دسترسی نداد؛ اینجا نگه دارید و Paste بزنید"; }
  };
  const shared = new URLSearchParams(location.search).get("share");
  if (shared) { document.getElementById("link").value = shared; analyze(shared); }
  FX = await getRate();
});
