// ===== CONFIG =====
const API_BASE = "https://api-cowboyhat.ohmyglob.lol";

let turnstileToken = "";
let pendingEntryId = "";
let lastEmail = "";

// Cloudflare Turnstile callback
window.onTurnstileSuccess = function(token) {
  turnstileToken = token;
};

// Helper shortcuts
function $(id) { return document.getElementById(id); }
function show(el, yes = true) { el.hidden = !yes; }
function msgError(text) { $("error").textContent = text; show($("error")); }
function msgSuccess(text) { $("success").innerHTML = text; show($("success")); }

function fmtDate(ts) {
  // ts in seconds -> nice local string
  try { return new Date(ts * 1000).toLocaleString(); } catch { return String(ts); }
}

// --- Campaign bootstrap ---
async function loadCampaign() {
  const params = new URLSearchParams(location.search);
  const campaignId = params.get("campaign");

  if (!campaignId) {
    msgError("Missing campaign id in the URL.");
    $("submit-btn").disabled = true;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/campaigns/${encodeURIComponent(campaignId)}`, {
      method: "GET",
      headers: { "accept": "application/json" }
    });

    const out = await res.json();
    if (!res.ok || !out.ok) {
      msgError("That campaign link is invalid or not available.");
      $("submit-btn").disabled = true;
      return;
    }

    const c = out.campaign; // {id, product_id, product_name, starts_at, ends_at, is_open}
    // Fill hidden inputs
    $("campaign_id").value  = c.id;
    $("product_id").value   = c.product_id;
    $("product_name").value = c.product_name;

    // Update UI
    $("page-title").textContent = `Enter: ${c.product_name}`;
    $("campaign-subtext").innerHTML =
      `Entries window: <strong>${fmtDate(c.starts_at)}</strong> → <strong>${fmtDate(c.ends_at)}</strong>`;

    if (c.is_open !== true) {
      $("submit-btn").disabled = true;
      msgError("This campaign is not currently accepting entries.");
    } else {
      $("submit-btn").disabled = false;
    }
  } catch (e) {
    msgError("Failed to load campaign details.");
    $("submit-btn").disabled = true;
  }
}

// Collect form data
function collectForm() {
  const fd = new FormData($("entry-form"));
  const data = Object.fromEntries(fd.entries());
  data.turnstile_token = turnstileToken;
  return data;
}

// Basic validation
function validate(data) {
  if (!data.campaign_id) return "Missing campaign id";
  if (!data.product_id) return "Missing product id";
  if (!data.product_name) return "Missing product name";
  if (!data.full_name?.trim()) return "Full name required";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return "Valid email required";
  if (!data.mobile?.trim()) return "Mobile number required";
  if (!data.address1?.trim()) return "Address line 1 required";
  if (!data.city?.trim()) return "City required";
  if (!data.postcode?.trim()) return "Postcode required";
  if (!data.consent) return "You must confirm consent";
  if (!data.turnstile_token) return "Verification required (Turnstile)";
  return null;
}

// Submit entry
$("entry-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("error").hidden = true;
  $("success").hidden = true;

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
      // common server rejections
      if (out.error === "already_entered") {
        msgError("You’ve already entered this campaign with this email or mobile.");
      } else if (out.error === "campaign_not_started") {
        msgError("This campaign hasn’t started yet.");
      } else if (out.error === "campaign_ended") {
        msgError("This campaign has ended.");
      } else if (out.error === "turnstile_failed") {
        msgError("Verification failed. Please retry the Turnstile challenge.");
      } else {
        msgError(out.error || "Something went wrong.");
      }
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

// init
loadCampaign();
