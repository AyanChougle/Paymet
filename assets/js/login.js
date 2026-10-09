loginForm.onsubmit = async (e) => {
  e.preventDefault();
  loginMsg.textContent = "";
  try {
    const j = await api("login", {
      email: email.value,
      password: password.value,
    });
    sessionStorage.setItem("pp_user", JSON.stringify(j.user));
    location.href = "dashboard.html";
  } catch (x) {
    loginMsg.textContent = x.message;
  }
};
