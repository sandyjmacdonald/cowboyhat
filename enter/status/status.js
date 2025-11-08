const API_BASE = "https://api-cowboyhat.ohmyglob.lol";

function $(id){ return document.getElementById(id); }
function show(el, yes = true){ el.hidden = !yes; }
function err(msg){ $("error").textContent = msg; show($("error"), true); }

function fmt(ts){
  if (!ts) return "—";
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString();
}

(async function init(){
  const token = new URLSearchParams(location.search).get("token");
  if (!token) return err("Missing token in URL.");

  try {
    const r = await fetch(`${API_BASE}/status?token=${encodeURIComponent(token)}`);
    const out = await r.json();

    if (!r.ok) {
      return err(out.error === "not_found" ? "Entry not found." : (out.error || "Error"));
    }

    const e = out.entry;
    $("product").textContent  = e.product_name || e.product_id || "—";
    $("name").textContent     = e.full_name || "—";
    $("email").textContent    = e.email || "—";
    $("submitted").textContent= fmt(e.created_at);
    $("status").textContent   = e.status || "—";

    if (e.otp_verified_at) {
      $("verified").textContent = fmt(e.otp_verified_at);
      show($("verified-row"), true);
    }
    if (e.purchased_at) {
      $("purchased").textContent = fmt(e.purchased_at);
      show($("purchased-row"), true);
    }

    show($("status-card"), true);
  } catch {
    err("Network error.");
  }
})();
