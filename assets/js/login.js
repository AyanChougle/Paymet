// Ensure inputs are clean on load
window.addEventListener('DOMContentLoaded', () => {
  if (email) email.value = '';
  if (password) password.value = '';
});

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
