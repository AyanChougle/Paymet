(function() {
    const savedTheme = localStorage.getItem('pp_theme') || 'dark';
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
})();

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'light' ? 'dark' : 'light';
    if (newTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('pp_theme', newTheme);
    updateThemeButtonText();
}

function updateThemeButtonText() {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    btn.innerHTML = `<span>Theme</span> <strong>${isLight ? 'Light' : 'Dark'}</strong>`;
}

document.addEventListener('DOMContentLoaded', updateThemeButtonText);
