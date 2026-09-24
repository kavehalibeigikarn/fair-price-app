// App boot: report container, shared link (?share=...), paste button.
window.addEventListener("DOMContentLoaded", async () => {
  setRoot(document.getElementById("report"));
  const st = document.createElement("style"); st.textContent = REPORT_CSS; document.head.appendChild(st);
  document.getElementById("go").onclick = () => analyze(document.getElementById("link").value);
  document.getElementById("paste").onclick = async () => { try { const t = await navigator.clipboard.readText(); document.getElementById("link").value = t; analyze(t); } catch { document.getElementById("link").focus(); } };
  const shared = new URLSearchParams(location.search).get("share");
  if (shared) { document.getElementById("link").value = shared; analyze(shared); }
  FX = await getRate();
});
