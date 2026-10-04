
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from "./config.js";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

const authView = $("authView");
const homeView = $("homeView");
const message = $("message");

let currentMode = "login";
let recoveryMode = false;

const forms = {
  login: $("loginForm"),
  register: $("registerForm"),
  forgot: $("forgotForm"),
  reset: $("resetForm")
};

const titles = {
  login: ["Welcome back", "Sign in to continue to your account."],
  register: ["Create account", "Start your journey with Nova."],
  forgot: ["Reset password", "We'll email you a password reset link."],
  reset: ["New password", "Choose a new password for your account."]
};

function showMessage(text, type = "success") {
  message.textContent = text;
  message.classList.toggle("error", type === "error");
  message.hidden = false;
}

function clearMessage() {
  message.hidden = true;
  message.textContent = "";
  message.classList.remove("error");
}

function setMode(mode) {
  currentMode = mode;

  Object.entries(forms).forEach(([name, form]) => {
    form.hidden = name !== mode;
  });

  $("formTitle").textContent = titles[mode][0];
  $("formSubtitle").textContent = titles[mode][1];

  const showOAuth = mode === "login" || mode === "register";
  $("divider").hidden = !showOAuth;
  $("googleBtn").hidden = !showOAuth;

  $("switchText").hidden = mode === "forgot" || mode === "reset";

  if (mode === "login") {
    $("switchText").innerHTML =
      `Don't have an account? <button type="button" class="text-btn" id="switchLink">Create account</button>`;
  } else if (mode === "register") {
    $("switchText").innerHTML =
      `Already have an account? <button type="button" class="text-btn" id="switchLink">Sign in</button>`;
  }

  $("switchLink")?.addEventListener("click", () => {
    clearMessage();
    setMode(currentMode === "login" ? "register" : "login");
  });

  clearMessage();
}

function showAuth(mode = "login") {
  authView.hidden = false;
  homeView.hidden = true;
  setMode(mode);
}

function showHome(session) {
  if (!session?.user) {
    showAuth("login");
    return;
  }

  authView.hidden = true;
  homeView.hidden = false;

  const user = session.user;
  const name = user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split("@")[0]
    || "User";

  $("userName").textContent = name;
  $("userEmail").textContent = user.email || "";
  $("avatar").textContent = name.charAt(0).toUpperCase();
}

function friendlyError(error) {
  const msg = error?.message || "Something went wrong.";

  if (/invalid login credentials/i.test(msg)) {
    return "Incorrect email or password.";
  }

  if (/user already registered/i.test(msg)) {
    return "This email already has an account. Please sign in.";
  }

  if (/email not confirmed/i.test(msg)) {
    return "Please confirm your email using the link we sent you.";
  }

  return msg;
}

function setBusy(buttonId, busy, busyText) {
  const button = $(buttonId);

  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || "Continue";
    button.disabled = false;
  }
}

async function runAction(buttonId, busyText, action) {
  setBusy(buttonId, true, busyText);

  try {
    await action();
  } catch (error) {
    showMessage(friendlyError(error), "error");
  } finally {
    setBusy(buttonId, false);
  }
}

// Login
forms.login.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  await runAction("loginSubmit", "Signing in...", async () => {
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    showHome(data.session);
  });
});

// Register
forms.register.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  await runAction("registerSubmit", "Creating account...", async () => {
    const name = $("registerName").value.trim();
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: window.location.origin
      }
    });

    if (error) throw error;

    if (data.session) {
      showHome(data.session);
    } else {
      showAuth("login");
      showMessage(
        "Account created. Check your email to confirm your account before signing in."
      );
    }
  });
});

// Forgot password
$("forgotLink").addEventListener("click", () => {
  $("forgotEmail").value = $("loginEmail").value.trim();
  showAuth("forgot");
});

forms.forgot.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  await runAction("forgotSubmit", "Sending link...", async () => {
    const email = $("forgotEmail").value.trim();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });

    if (error) throw error;

    showMessage(
      "If an account exists for that email, a password reset link will be sent."
    );
  });
});

// Handle a password recovery link
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    showAuth("reset");
    showMessage("Enter and confirm your new password.");
    return;
  }

  if (recoveryMode) return;

  if (session?.user) {
    showHome(session);
  } else if (event === "SIGNED_OUT") {
    showAuth("login");
  }
});

// Save new password
forms.reset.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  await runAction("resetSubmit", "Updating...", async () => {
    const password = $("newPassword").value;
    const confirm = $("confirmPassword").value;

    if (password !== confirm) {
      throw new Error("The passwords do not match.");
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) throw error;

    recoveryMode = false;
    $("newPassword").value = "";
    $("confirmPassword").value = "";

    showAuth("login");
    showMessage("Password updated successfully. Please sign in.");
  });
});

// Google OAuth
$("googleBtn").addEventListener("click", async () => {
  clearMessage();

  await runAction("googleBtn", "Connecting to Google...", async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
  });
});

// Logout
$("logoutBtn").addEventListener("click", async () => {
  $("logoutBtn").disabled = true;

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    recoveryMode = false;
    showAuth("login");
    showMessage("You have signed out.");
  } catch (error) {
    showMessage(friendlyError(error), "error");
  } finally {
    $("logoutBtn").disabled = false;
  }
});

// Restore an existing session after refresh
async function initialize() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    // A recovery event from the auth listener takes priority.
    if (!recoveryMode && data.session) {
      showHome(data.session);
    } else if (!recoveryMode) {
      showAuth("login");
    }
  } catch (error) {
    showAuth("login");
    showMessage(friendlyError(error), "error");
  }
}

setMode("login");
initialize();
