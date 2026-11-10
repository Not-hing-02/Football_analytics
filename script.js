"use strict";

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const username = document.getElementById("register-name");
const password = document.getElementById("register-password");
const confirmation = document.getElementById("register-confirm");
const loginStatus = document.getElementById("login-status");
let registrationNotice = "";

function showPage(focusHeading = false) {
  const registering = window.location.hash === "#register";
  document.getElementById("login-panel").hidden = registering;
  document.getElementById("register-panel").hidden = !registering;
  document.getElementById("tagline").textContent = registering
    ? "Create your account"
    : "Analyze. Compare. Explore.";
  document.title = (registering ? "Create Account" : "Log in") + " · Premier League Analytics";
  loginStatus.textContent = registering ? "" : registrationNotice;
  registrationNotice = "";

  // Clear password fields whenever the visitor changes forms.
  document.querySelectorAll('input[type="password"]').forEach(input => {
    input.value = "";
  });
  confirmation.setCustomValidity("");
  if (focusHeading) {
    document.getElementById(registering ? "register-title" : "login-title").focus();
  }
}

function checkConfirmation() {
  const mismatch = confirmation.value !== "" && confirmation.value !== password.value;
  confirmation.setCustomValidity(mismatch ? "Please enter the same password in both fields." : "");
}

username.addEventListener("input", () => username.setCustomValidity(""));
password.addEventListener("input", checkConfirmation);
confirmation.addEventListener("input", checkConfirmation);

registerForm.addEventListener("submit", event => {
  event.preventDefault();
  username.setCustomValidity(username.value.trim().length < 2 ? "Enter a username of at least two characters." : "");
  checkConfirmation();
  if (!registerForm.reportValidity()) return;

  document.getElementById("login-email").value = document.getElementById("register-email").value.trim();
  registrationNotice = "Registration form validated. You can now try the login form.";
  registerForm.reset();
  window.location.hash = "login";
});

loginForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  document.getElementById("login-password").value = "";
  loginStatus.textContent = "Login form validated for this demo.";
});

window.addEventListener("hashchange", () => showPage(true));
document.querySelectorAll('button[type="submit"]').forEach(button => {
  button.disabled = false;
});
showPage();
