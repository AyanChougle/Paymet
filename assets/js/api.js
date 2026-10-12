const USE_LOCAL_DB = false;

function getCurrentUser() {
    let u = sessionStorage.getItem('pp_user');
    return u ? JSON.parse(u) : null;
}

function setCurrentUser(user) {
    sessionStorage.setItem('pp_user', JSON.stringify(user));
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

async function api(action, data = {}) {
    const r = await fetch('api.php?action=' + encodeURIComponent(action), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(data)
    });
    
    // Auto-handle session expiration / 401 Unauthorized
    if (r.status === 401 && action !== 'login') {
        sessionStorage.removeItem('pp_user');
        const page = location.pathname.split('/').pop() || '';
        if (page !== 'login.html') {
            location.href = 'login.html';
        }
        throw new Error('Your session has expired. Please log in again.');
    }

    let j;
    try {
        j = await r.json();
    } catch(err) {
        throw new Error('Server returned invalid response. Check database connection in api.php.');
    }
    
    if (!j.success) {
        throw new Error(j.message || 'API request failed');
    }
    return j;
}
