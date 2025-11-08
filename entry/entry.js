// ===== CONFIG =====
const API_BASE = "https://cowboyhat.ohmyglob.lol/api";
let turnstileToken = ""0x4AAAAAAB_0Zo98m-rj3y0o;
let pendingEntryId = "";
let lastEmail = "";

// Turnstile callback
window.onTurnstileSuccess = function(token) {
  turnstileToken = token;
};

// Helpers
function $(id) { return document.getElementById(id); }
function show(el, yes = true) { el.hidden = !yes; }
function msgError(text) { $("error").textContent = text; show($("error")); }
function msgSuccess(text) { $("success").innerHTML = text; show($("success")); }

// Gather form data
function collectForm() {
  const fd = new FormData($("entry-form"));
  const data = Object.fromEntries(fd.entries());
  data.turnstile_token = turnstileToken;
  return data;
}

// Basic validation
function validate(data) {
  if (!data.full_name.trim()) return "Full name required";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return "Valid email required";
  if (!data.mobile.trim()) return "Mobile number required";
  if (!data.address1.trim()) return "Address line 1 required";
  if (!data.city.trim()) return "City required";
  if (!data.postcode.trim()) return "Postcode required";
  if (!data.consent) return "You must confirm consent";
  if (!data.turnstile_token) return "Verification required";
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
    const res = await fetch(`${API_BASE}/entries/start`, {
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
      msgSuccess(`A one-time passcode has been sent to ${data.email}`);
      show($("otp-step"), true);
    } else {
      msgSuccess(
        `Entry received! <br><br>Track your status here:<br>
         <a href="${out.status_url}" target="_blank">${out.status_url}</a>`
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
    const res = await fetch(`${API_BASE}/entries/${pendingEntryId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ otp: code })
    });

    const out = await res.json();
    if (!res.ok) return msgError(out.error || "Incorrect code.");

    msgSuccess(
      `Entry confirmed! <br><br>Track your status:<br>
       <a href="${out.status_url}" target="_blank">${out.status_url}</a>`
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
    const res = await fetch(`${API_BASE}/entries/${pendingEntryId}/resend-otp`, {
      method: "POST"
    });
    if (!res.ok) return msgError("Could not resend code.");

    msgSuccess(`A new code has been sent to ${lastEmail}.`);

  } catch {
    msgError("Network error — try again.");
  }
});
