// Ensure inputs are clean on load
window.addEventListener('DOMContentLoaded', () => {
  if (typeof email !== 'undefined' && email) email.value = '';
  if (typeof password !== 'undefined' && password) password.value = '';
});

const forgotPwdLink = document.getElementById('forgotPwdLink');
const forgotModal = document.getElementById('forgotModal');
const closeForgotBtn = document.getElementById('closeForgotBtn');
const forgotForm = document.getElementById('forgotForm');
const forgotInput = document.getElementById('forgotInput');
const forgotMsg = document.getElementById('forgotMsg');
const forgotSubmitBtn = document.getElementById('forgotSubmitBtn');

if (forgotPwdLink && forgotModal) {
  forgotPwdLink.addEventListener('click', () => {
    forgotModal.style.display = forgotModal.style.display === 'none' ? 'block' : 'none';
    if (forgotMsg) forgotMsg.textContent = '';
    if (forgotInput) {
      if (!forgotInput.value && email && email.value) {
        forgotInput.value = email.value.trim();
      }
      forgotInput.focus();
    }
  });
}

if (closeForgotBtn && forgotModal) {
  closeForgotBtn.addEventListener('click', () => {
    forgotModal.style.display = 'none';
  });
}

if (forgotForm) {
  forgotForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!forgotInput || !forgotInput.value.trim()) return;

    forgotMsg.textContent = 'Sending reset instructions...';
    forgotMsg.style.color = 'var(--text-muted)';
    if (forgotSubmitBtn) forgotSubmitBtn.disabled = true;

    try {
      const res = await api('forgot_password', {
        email: forgotInput.value.trim()
      });
      forgotMsg.textContent = res.message || 'Password reset link sent! Please check your email inbox.';
      forgotMsg.style.color = 'var(--accent)';
      forgotInput.value = '';
    } catch (err) {
      forgotMsg.textContent = err.message || 'Unable to process request. Please try again.';
      forgotMsg.style.color = 'var(--danger)';
    } finally {
      if (forgotSubmitBtn) forgotSubmitBtn.disabled = false;
    }
  };
}

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  loginMsg.textContent = "";
  try {
    const j = await api("login", {
      email: email.value.trim(),
      password: password.value,
    });
    sessionStorage.setItem("pp_user", JSON.stringify(j.user));

    const role = (j.user.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'OPS_MANAGER') {
      location.href = "dashboard.html";
    } else {
      location.href = "entry.html";
    }
  } catch (x) {
    loginMsg.textContent = x.message || 'Login failed. Please check your credentials.';
  }
};
