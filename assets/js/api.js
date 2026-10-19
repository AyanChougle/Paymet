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

const isLocalDev = (location.hostname === '127.0.0.1' || location.hostname === 'localhost' || location.protocol === 'file:');

// Seed realistic fallback data for local testing if running on localhost and storage is blank
(function seedLocalDevStorage() {
    if (!isLocalDev) return;
    if (!localStorage.getItem('pp_ops_managers')) {
        localStorage.setItem('pp_ops_managers', JSON.stringify([
            { id: 1, name: 'Rushikesh Budar', target: 3500000, monthly_target: 3500000 },
            { id: 2, name: 'Arshad Majothi', target: 3500000, monthly_target: 3500000 }
        ]));
    }
    if (!localStorage.getItem('pp_team_leaders')) {
        localStorage.setItem('pp_team_leaders', JSON.stringify([
            { id: 1, name: 'Mayur Kaskar', ops_manager: 'Rushikesh Budar', target: 1500000, monthly_target: 1500000 },
            { id: 2, name: 'Viren Gupta', ops_manager: 'Rushikesh Budar', target: 1750000, monthly_target: 1750000 },
            { id: 3, name: 'Ritik Shukla', ops_manager: 'Arshad Majothi', target: 1500000, monthly_target: 1500000 },
            { id: 4, name: 'Saif Shaikh', ops_manager: 'Arshad Majothi', target: 1750000, monthly_target: 1750000 }
        ]));
    }
    if (!localStorage.getItem('pp_agents')) {
        localStorage.setItem('pp_agents', JSON.stringify([
            { id: 1, ecode: 'EMP001', agent_name: 'Selina Khan', tl: 'Mayur Kaskar', ops_manager: 'Rushikesh Budar', is_active: 1 },
            { id: 2, ecode: 'EMP002', agent_name: 'Sumit Verma', tl: 'Viren Gupta', ops_manager: 'Rushikesh Budar', is_active: 1 },
            { id: 3, ecode: 'EMP003', agent_name: 'Rohit Sharma', tl: 'Ritik Shukla', ops_manager: 'Arshad Majothi', is_active: 1 },
            { id: 4, ecode: 'EMP004', agent_name: 'Priya Patel', tl: 'Saif Shaikh', ops_manager: 'Arshad Majothi', is_active: 1 },
            { id: 5, ecode: 'EMP005', agent_name: 'Amit Kumar', tl: 'Mayur Kaskar', ops_manager: 'Rushikesh Budar', is_active: 1 }
        ]));
    }
})();

function handleLocalDevApi(action, data) {
    // 1. Login
    if (action === 'login') {
        const email = (data.email || data.username || 'admin@paymentportal.local').trim();
        const emailLower = email.toLowerCase();
        let role = 'ADMIN';
        if (emailLower.includes('ops')) {
            role = 'OPS_MANAGER';
        } else if (emailLower.includes('entry') || emailLower.includes('agent')) {
            role = 'ENTRY_USER';
        }

        const namePart = email.split('@')[0] || 'Administrator';
        const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        const user = {
            id: 1,
            name: displayName,
            email: email,
            username: namePart,
            role: role
        };
        sessionStorage.setItem('pp_user', JSON.stringify(user));
        return { success: true, user: user, local_mode: true };
    }

    // 1b. Forgot Password (Mock Local Dev)
    if (action === 'forgot_password') {
        return { success: true, message: 'Password reset link sent to your email address.', debug_otp: '123456' };
    }

    // 1c. Reset Password (Mock Local Dev)
    if (action === 'reset_password') {
        return { success: true, message: 'Password has been updated successfully. You can now log in.' };
    }

    // 2. Current User
    if (action === 'get_current_user') {
        const u = getCurrentUser();
        return { success: true, user: u };
    }

    // 3. Logout
    if (action === 'logout') {
        sessionStorage.removeItem('pp_user');
        return { success: true };
    }

    // 4. Dashboard / Reports
    if (action === 'dashboard' || action === 'reports') {
        let payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
        const u = getCurrentUser();
        const activeName = u ? (u.name || u.username) : 'Admin';
        let updated = false;
        payments = payments.map(p => {
            if (!p.created_by_name || p.created_by_name.toLowerCase() === 'staff' || p.created_by_name.toLowerCase() === 'system') {
                updated = true;
                return { ...p, created_by_name: activeName };
            }
            return p;
        });
        if (updated) {
            localStorage.setItem('pp_payments', JSON.stringify(payments));
        }
        return { success: true, rawPayments: payments, rows: payments, lastEntry: payments[0] || null };
    }

    // 5. Agents
    if (action === 'agents') {
        const agents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
        const ops = JSON.parse(localStorage.getItem('pp_ops_managers') || '[]');
        const tls = JSON.parse(localStorage.getItem('pp_team_leaders') || '[]');
        return { success: true, agents, ops_managers: ops, team_leaders: tls, rows: agents };
    }

    // 6. Clients
    if (action === 'clients') {
        const clients = JSON.parse(localStorage.getItem('pp_clients') || '[]');
        return { success: true, rows: clients };
    }

    // 7. Create Payment
    if (action === 'create_payment') {
        const payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
        const u = getCurrentUser();
        const activeName = u ? (u.name || u.username) : 'Admin';
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const localTimestamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        const newPayment = {
            id: Date.now(),
            created_by_name: data.created_by_name || activeName,
            ...data,
            created_at: localTimestamp
        };
        payments.unshift(newPayment);
        localStorage.setItem('pp_payments', JSON.stringify(payments));
        return { success: true, id: newPayment.id };
    }

    // 8. Delete Payment
    if (action === 'delete_payment') {
        let payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
        payments = payments.filter(p => String(p.id) !== String(data.id));
        localStorage.setItem('pp_payments', JSON.stringify(payments));
        return { success: true };
    }

    // 9. Upsert Client
    if (action === 'upsert_client_node') {
        const clients = JSON.parse(localStorage.getItem('pp_clients') || '[]');
        const idx = clients.findIndex(c => (data.id && String(c.id) === String(data.id)) || (data.client_number && c.client_number === data.client_number));
        if (idx >= 0) {
            clients[idx] = { ...clients[idx], ...data };
        } else {
            clients.unshift({ id: Date.now(), ...data });
        }
        localStorage.setItem('pp_clients', JSON.stringify(clients));
        return { success: true };
    }

    // 10. Toggle Agent Status
    if (action === 'toggle_agent_status') {
        const agents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
        const ag = agents.find(a => String(a.id) === String(data.id) || (a.agent_name && a.agent_name.toLowerCase() === (data.agent_name || '').toLowerCase()));
        if (ag) {
            ag.is_active = (data.is_active !== undefined) ? (data.is_active ? 1 : 0) : (ag.is_active === 0 ? 1 : 0);
            localStorage.setItem('pp_agents', JSON.stringify(agents));
        }
        return { success: true, is_active: ag ? ag.is_active : 1 };
    }

    // 11. Save User Settings
    if (action === 'save_user_settings') {
        return { success: true };
    }

    // 12. Accounts
    if (action === 'accounts') {
        return { success: true, rows: [] };
    }

    // 13. Admin
    if (action === 'admin') {
        const users = [
            { id: 1, name: 'Local Admin', email: 'admin@portal.local', role: 'ADMIN' },
            { id: 2, name: 'Ops Manager', email: 'ops@portal.local', role: 'OPS_MANAGER' },
            { id: 3, name: 'Entry User', email: 'entry@portal.local', role: 'ENTRY_USER' }
        ];
        const payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
        return { success: true, users: users, stats: { users: users.length, payments: payments.length } };
    }

    return { success: true };
}

const isStaticLiveServer = (isLocalDev && (location.port === '5500' || location.port === '5501' || location.protocol === 'file:'));

async function api(action, data = {}) {
    if (isStaticLiveServer) {
        return handleLocalDevApi(action, data);
    }
    try {
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

        const text = await r.text();
        let j = null;
        try {
            j = JSON.parse(text);
        } catch(parseErr) {
            // Live Server / local static dev server returns raw PHP string (starts with "<?php")
            if (isLocalDev) {
                return handleLocalDevApi(action, data);
            }
            throw new Error('Server returned invalid response. Check database connection in api.php.');
        }

        if (!j.success) {
            if (r.status === 403) {
                console.warn(`[403 Forbidden] Action '${action}' was rejected:`, j.message || 'Insufficient permissions for current role.');
            }
            throw new Error(j.message || 'API request failed');
        }
        return j;
    } catch(err) {
        if (isLocalDev) {
            return handleLocalDevApi(action, data);
        }
        throw err;
    }
}
