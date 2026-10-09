const USE_LOCAL_DB = false;

function getCurrentUser() {
    let u = sessionStorage.getItem('pp_user');
    return u ? JSON.parse(u) : null;
}

function setCurrentUser(user) {
    sessionStorage.setItem('pp_user', JSON.stringify(user));
}

async function api(action, data = {}) {
    const r = await fetch('api.php?action=' + encodeURIComponent(action), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
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
