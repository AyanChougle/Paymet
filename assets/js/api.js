const USE_LOCAL_DB = true;

// Initialize default users if not present
if (!localStorage.getItem('pp_users')) {
    localStorage.setItem('pp_users', JSON.stringify([
        { id: 1, name: 'System Admin', email: 'admin@portal.com', role: 'ADMIN', password: 'admin', active: 1, created_at: '2026-10-01' },
        { id: 2, name: 'Arshad (Ops)', email: 'ops@portal.com', role: 'OPS_MANAGER', password: 'ops', active: 1, created_at: '2026-10-01' },
        { id: 3, name: 'Ayan (Entry)', email: 'entry@portal.com', role: 'ENTRY_USER', password: 'entry', active: 1, created_at: '2026-10-01' }
    ]));
}

if (!localStorage.getItem('pp_payments')) {
    localStorage.setItem('pp_payments', JSON.stringify([]));
}

function getCurrentUser() {
    let u = sessionStorage.getItem('pp_user');
    if (!u) {
        const users = JSON.parse(localStorage.getItem('pp_users') || '[]');
        u = JSON.stringify(users[0] || { id: 1, name: 'System Admin', email: 'admin@portal.com', role: 'ADMIN' });
        sessionStorage.setItem('pp_user', u);
    }
    return JSON.parse(u);
}

function setCurrentUser(user) {
    sessionStorage.setItem('pp_user', JSON.stringify(user));
}

async function api(action, data = {}) {
    if (!USE_LOCAL_DB) {
        const r = await fetch('api.php?action=' + encodeURIComponent(action), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.message || 'Request failed');
        return j;
    }

    await new Promise(resolve => setTimeout(resolve, 50));
    let payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
    let users = JSON.parse(localStorage.getItem('pp_users') || '[]');
    const currentUser = getCurrentUser();

    if (action === 'get_current_user') {
        return { success: true, user: currentUser, users: users };
    }

    if (action === 'switch_user') {
        const target = users.find(u => u.id === parseInt(data.userId));
        if (target) {
            setCurrentUser(target);
            return { success: true, user: target };
        }
        throw new Error('User not found');
    }

    if (action === 'create_payment') {
        if (!data.payment_date || !data.agent_name) throw new Error('Date and agent are required');
        const usdt = parseFloat(data.usdt || 0);
        const div = parseFloat(data.divided_by || 1);
        const inr = Math.round((usdt * div) * 100) / 100;

        const now = new Date();
        const timestampStr = now.toISOString().replace('T', ' ').slice(0, 19);

        const newPayment = {
            id: payments.length ? Math.max(...payments.map(p => p.id)) + 1 : 1,
            payment_date: data.payment_date,
            ecode: data.ecode || null,
            agent_name: data.agent_name,
            tl: data.tl || null,
            ops_manager: data.ops_manager || null,
            client_name: data.client_name || null,
            client_number: data.client_number || null,
            email_id: data.email_id || null,
            pan_no: data.pan_no || null,
            aadhar_no: data.aadhar_no || null,
            state: data.state || null,
            payment_mode: data.payment_mode || 'P2P',
            usdt: usdt,
            divided_by: div,
            inr_amount: inr,
            ratio: data.ratio || null,
            received_in: data.received_in || 'Digital Verse',
            remarks: data.remarks || null,
            created_at: timestampStr,
            created_by_id: currentUser.id,
            created_by_name: currentUser.name,
            created_by_email: currentUser.email,
            created_by_role: currentUser.role
        };

        payments.push(newPayment);
        localStorage.setItem('pp_payments', JSON.stringify(payments));
        return { success: true, id: newPayment.id };
    }

    if (action === 'dashboard') {
        let filtered = payments;
        if (data.from) filtered = filtered.filter(p => p.payment_date >= data.from);
        if (data.to) filtered = filtered.filter(p => p.payment_date <= data.to);

        // Find last recorded payment
        const lastEntry = payments.length ? payments[payments.length - 1] : null;

        return {
            success: true,
            rawPayments: payments,
            lastEntry: lastEntry
        };
    }

    if (action === 'reports') {
        let filtered = payments.slice();
        filtered.sort((a, b) => new Date(b.created_at || b.payment_date) - new Date(a.created_at || a.payment_date) || b.id - a.id);
        return { success: true, rows: filtered };
    }

    if (action === 'admin') {
        return {
            success: true,
            users: users,
            stats: { users: users.length, payments: payments.length }
        };
    }

    if (action === 'create_user') {
        const newUser = {
            id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
            name: data.name,
            email: data.email,
            password: data.password,
            role: data.role || 'ENTRY_USER',
            active: 1,
            created_at: new Date().toISOString().split('T')[0]
        };
        users.push(newUser);
        localStorage.setItem('pp_users', JSON.stringify(users));
        return { success: true, id: newUser.id };
    }

    throw new Error('Unknown action ' + action);
}