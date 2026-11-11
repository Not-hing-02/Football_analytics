import { passwordIssue } from "./password-policy.mjs";
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const username = document.getElementById("register-name");
const password = document.getElementById("register-password");
const confirmation = document.getElementById("register-confirm");
const loginStatus = document.getElementById("login-status");
const email = document.getElementById("register-email");
const passwordFeedback = document.getElementById("password-feedback");
const confirmFeedback = document.getElementById("confirm-feedback");
const registerStatus = document.getElementById("register-status");
let pageVersion = 0;
let registrationNotice = "";

function showPage(focusHeading = false) {
  pageVersion++;
  const registering = window.location.hash === "#register";
  document.getElementById("login-panel").hidden = registering;
  document.getElementById("register-panel").hidden = !registering;
  document.getElementById("tagline").textContent = registering
    ? "Create your account"
    : "Analyze. Compare. Explore.";
  document.title = (registering ? "Create Account" : "Log in") + " · Premier League Analytics";
  loginStatus.textContent = registering ? "" : registrationNotice;
  registerStatus.textContent = "";
  registrationNotice = "";

  // Clear password fields whenever the visitor changes forms.
  document.querySelectorAll('input[type="password"]').forEach(input => {
    input.value = "";
  });
  checkPassword();
  checkConfirmation();
  if (focusHeading) {
    document.getElementById(registering ? "register-title" : "login-title").focus();
  }
}

function checkPassword() {
  const message = passwordIssue(password.value, username.value, email.value);
  password.setCustomValidity(message);
  password.setAttribute("aria-invalid", String(Boolean(message)));
  passwordFeedback.textContent = message;
}

function checkConfirmation() {
  const mismatch = confirmation.value !== "" && confirmation.value !== password.value;
  const message = mismatch ? "Please enter the same password in both fields." : "";
  confirmation.setCustomValidity(message);
  confirmation.setAttribute("aria-invalid", String(mismatch));
  confirmFeedback.textContent = message;
}

username.addEventListener("input", () => {
  username.setCustomValidity("");
  checkPassword();
});
email.addEventListener("input", checkPassword);
password.addEventListener("input", () => {
  checkPassword();
  checkConfirmation();
});
confirmation.addEventListener("input", checkConfirmation);

async function submitCredentials(form, status, endpoint, credentials, onSuccess) {
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = "";
  const version = pageVersion;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials)
    });
    const result = await response.json();
    if (version !== pageVersion) return;
    if (response.ok) onSuccess();
    else status.textContent = result.error || "Please try again.";
  } catch {
    if (version === pageVersion) status.textContent = "Could not reach the login server. Please try again.";
  } finally {
    button.disabled = false;
  }
}

registerForm.addEventListener("submit", event => {
  event.preventDefault();
  username.setCustomValidity(username.value.trim().length < 2 ? "Enter a username of at least two characters." : "");
  checkPassword();
  checkConfirmation();
  if (!registerForm.reportValidity()) return;
  const credentials = { username: username.value.trim(), email: email.value.trim(), password: password.value };
  submitCredentials(registerForm, registerStatus, "/api/register", credentials, () => {
    document.getElementById("login-email").value = credentials.email;
    registrationNotice = "Account created. Log in with your email and password.";
    registerForm.reset();
    window.location.hash = "login";
  });
});

loginForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  const loginPassword = document.getElementById("login-password");
  const credentials = { email: document.getElementById("login-email").value, password: loginPassword.value };
  submitCredentials(loginForm, loginStatus, "/api/login", credentials, () => {
    loginPassword.value = "";
    loginStatus.textContent = "Login successful.";
  });
});

window.addEventListener("hashchange", () => showPage(true));
document.querySelectorAll('button[type="submit"]').forEach(button => {
  button.disabled = false;
});
showPage();
document.getElementById("startup-note").hidden = true;
