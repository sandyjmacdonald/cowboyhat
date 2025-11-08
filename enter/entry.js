// ===== CONFIG =====
const API_BASE = "https://api-cowboyhat.ohmyglob.lol";

let turnstileToken = "";
let pendingEntryId = "";
let lastEmail = "";

// Cloudflare Turnstile callback
window.onTurnstileSuccess = function(token) {
  turnstileToken = token;
};

// ------- helpers -------
function $(id) { return document.getElementById(id); }
function show(el, yes = true) { el.hidden = !yes; }
function msgError(text) { $("error").textContent = text; show($("error"), true); }
function msgSuccess(html) { $("success").innerHTML = html; show($("success"), true); }
function clearMsgs() { show($("error"), false); show($("success"), false); }
function iso(dtSec) {
  try {
    return new Date(Number(dtSec) * 1000).toLocaleString();
  } catch { return ""; }
}

// ------- campaign bootstrapping -------
(async function initFromQuery() {
  const params = new URLSearchParams(location.search);
  const campaignId = params.get("campaign");
  if (!campaignId) return; // no campaign param; keep defaults

  // Lock the submit until we know the campaign status
  $("submit-btn").disabled = true;

  try {
    // Expect your Worker to expose: GET /campaigns/:id  -> { ok, campaign: { id, product_id, product_name, starts_at, ends_at, quantity } }
    const res = await fetch(`${API_BASE}/campaigns/${encodeURIComponent(campaignId)}`);
    const out = await res.json();

    if (!res.ok || !out.ok || !out.campaign) {
      $("campaign-banner").className = "alert alert-error";
      $("campaign-banner").textContent = "That campaign link is invalid or not available.";
      show($("campaign-banner"), true);
      return;
    }

    const c = out.campaign;

    // Populate hidden inputs so the form POST carries campaign & product info
    $("campaign_id").value = c.id;
    $("product_id").value = c.product_id;
    $("product_name").value = c.product_name;

    // Human-friendly banner
    const now = Math.floor(Date.now() / 1000);
    let banner = `Campaign: ${c.product_name} (starts ${iso(c.starts_at)}, ends ${iso(c.ends_at)})`;
    let okToEnter = true;

    if (now < Number(c.starts_at)) {
      okToEnter = false;
      banner += " — not open yet.";
    } else if (now > Number(c.ends_at)) {
      okToEnter = false;
      banner += " — this campaign has ended.";
    }

    $("campaign-banner").className = okToEnter ? "alert alert-success" : "alert alert-error";
    $("campaign-banner").textContent = banner;
    show($("campaign-banner"), true);

    $("submit-btn").disabled = !okToEnter;

  } catch (e) {
    $("campaign-banner").className = "alert alert-error";
    $("campaign-banner").textContent = "Unable to load campaign details right now.";
    show($("campaign-banner"), true);
  }
})();

// Collect form data
function collectForm() {
  const fd = new FormData($("entry-form"));
  const data = Object.fromEntries(fd.entries());
  data.turnstile_token = turnstileToken;
  return data;
}

// Basic validation
function validate(data) {
  if (!data.full_name?.trim()) return "Full name required";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || "")) return "Valid email required";
  if (!String(data.mobile || "").trim()) return "Mobile number required";
  if (!String(data.address1 || "").trim()) return "Address line 1 required";
  if (!String(data.city || "").trim()) return "City required";
  if (!String(data.postcode || "").trim()) return "Postcode required";
  if (!data.consent) return "You must confirm consent";
  if (!data.turnstile_token) return "Verification required (Turnstile)";
  // If we arrived via a campaign link, ensure the hidden campaign_id is present.
  if (new URLSearchParams(location.search).get("campaign") && !data.campaign_id) {
    return "This campaign link is invalid.";
  }
  return null;
}

// Submit entry
$("entry-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearMsgs();

  const data = collectForm();
  const v = validate(data);
  if (v) return msgError(v);

  $("submit-btn").disabled = true;
  lastEmail = data.email;

  try {
    const res = await fetch(`${API_BASE}/enter/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    });

    const out = await res.json();
    if (!res.ok) {
      msgError(out.error || "Something went wrong.");
      $("submit-btn").disabled = false;
      return;
    }

    pendingEntryId = out.entry_id;

    if (out.otp_required) {
      msgSuccess(`A one-time passcode has been sent to ${data.email}.`);
      show($("otp-step"), true);
    } else {
      msgSuccess(
        `Entry received! <br><br>Track your status:<br>
         <a href="${out.status_url}" target="_blank" rel="noopener">${out.status_url}</a>`
      );
      $("entry-form").reset();
    }

  } catch (e) {
    msgError("Network error — please try again.");
  } finally {
    $("submit-btn").disabled = false;
  }
});

// Verify OTP
$("verify-otp-btn").addEventListener("click", async () => {
  clearMsgs();
  const code = $("otp").value.trim();
  if (!code) return msgError("Enter the code from your email.");

  try {
    const res = await fetch(`${API_BASE}/enter/${pendingEntryId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ otp: code })
    });

    const out = await res.json();
    if (!res.ok) return msgError(out.error || "Incorrect code.");

    msgSuccess(
      `Entry confirmed! <br><br>Track your status:<br>
       <a href="${out.status_url}" target="_blank" rel="noopener">${out.status_url}</a>`
    );

    $("entry-form").reset();
    show($("otp-step"), false);

  } catch {
    msgError("Network error — try again.");
  }
});

// Resend OTP
$("resend-otp-btn").addEventListener("click", async () => {
  clearMsgs();
  try {
    const res = await fetch(`${API_BASE}/enter/${pendingEntryId}/resend-otp`, {
      method: "POST"
    });

    if (!res.ok) return msgError("Could not resend code.");
    msgSuccess(`A new code has been sent to ${lastEmail}.`);

  } catch {
    msgError("Network error — try again.");
  }
});
