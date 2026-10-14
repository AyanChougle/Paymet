const f = document.getElementById('entryForm');
const msg = document.getElementById('entryMsg');

// Default date to today
f.payment_date.value = new Date().toISOString().slice(0, 10);

// Auto compute INR amount
function computeInr() {
    const u = parseFloat(f.usdt.value || 0);
    const d = parseFloat(f.divided_by.value || 0);
    const total = u * d;
    f.inr_amount.value = total > 0 ? total.toFixed(2) : '';
}

f.usdt.addEventListener('input', computeInr);
f.divided_by.addEventListener('input', computeInr);

// In-memory cache loaded from live DB
let dbAgents = [];
let dbClients = [];

async function initEntryData() {
    let apiSucceeded = false;
    try {
        const [agRes, clRes] = await Promise.all([
            api('agents', {}),
            api('clients', {})
        ]);
        dbAgents = agRes.agents || agRes.rows || [];
        dbClients = clRes.rows || [];
        apiSucceeded = true;
    } catch(e) {
        console.warn('API fetch warning in entry, reading local storage:', e);
        dbAgents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
        dbClients = JSON.parse(localStorage.getItem('pp_clients') || '[]');
    }

    if (apiSucceeded) {
        localStorage.setItem('pp_agents', JSON.stringify(dbAgents));
        localStorage.setItem('pp_mappings', JSON.stringify(dbAgents));
        localStorage.setItem('pp_clients', JSON.stringify(dbClients));
    }
}
initEntryData();

// Agent auto-fetch
function autofillAgent(key, value) {
    if (!value) return;
    const mappings = dbAgents.length ? dbAgents : JSON.parse(localStorage.getItem('pp_agents') || localStorage.getItem('pp_mappings') || '[]');
    const match = mappings.find(m => (m[key] || '').toLowerCase() === value.toLowerCase());
    if (match) {
        if (key !== 'ecode') f.ecode.value = match.ecode || '';
        if (key !== 'agent_name') f.agent_name.value = match.agent_name || '';
        if (match.ops_manager) f.ops_manager.value = match.ops_manager;
        if (match.tl) f.tl.value = match.tl;
    }
}

// Client auto-fetch
function autofillClient(key, value) {
    if (!value) return;
    const clients = dbClients.length ? dbClients : JSON.parse(localStorage.getItem('pp_clients') || '[]');
    const match = clients.find(c => (c[key] || '').toLowerCase() === value.toLowerCase());
    if (match) {
        if (key !== 'client_name' && match.client_name) f.client_name.value = match.client_name;
        if (key !== 'client_number' && match.client_number) f.client_number.value = match.client_number;
        if (key !== 'email_id' && match.email_id) f.email_id.value = match.email_id;
        if (match.pan_no) f.pan_no.value = match.pan_no;
        if (match.aadhar_no) f.aadhar_no.value = match.aadhar_no;
        if (match.state) f.state.value = match.state;
    }
}

// ========================================================
// REAL-TIME KYC INPUT FORMATTERS & VALIDATORS
// ========================================================
function formatClientPhone(val) {
    if (!val) return '';
    let digits = val.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
        digits = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith('0')) {
        digits = digits.slice(1);
    }
    return digits.slice(0, 10);
}

function formatClientAadhar(val) {
    if (!val) return '';
    const digits = val.replace(/\D/g, '').slice(0, 12);
    const parts = [];
    for (let i = 0; i < digits.length; i += 4) {
        parts.push(digits.slice(i, i + 4));
    }
    return parts.join(' ');
}

function formatClientPan(val) {
    if (!val) return '';
    return val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

// Attach real-time formatting listeners
f.client_number.addEventListener('input', () => {
    f.client_number.value = formatClientPhone(f.client_number.value);
    autofillClient('client_number', f.client_number.value.trim());
});

f.pan_no.addEventListener('input', () => {
    f.pan_no.value = formatClientPan(f.pan_no.value);
});

f.aadhar_no.addEventListener('input', () => {
    f.aadhar_no.value = formatClientAadhar(f.aadhar_no.value);
});

f.email_id.addEventListener('blur', () => {
    f.email_id.value = f.email_id.value.trim().toLowerCase();
});

f.ecode.addEventListener('input', () => autofillAgent('ecode', f.ecode.value.trim()));
f.agent_name.addEventListener('input', () => autofillAgent('agent_name', f.agent_name.value.trim()));
f.client_name.addEventListener('input', () => autofillClient('client_name', f.client_name.value.trim()));
f.email_id.addEventListener('input', () => autofillClient('email_id', f.email_id.value.trim()));

// Submission with Strict Rules Verification
f.onsubmit = async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.className = '';

    const data = Object.fromEntries(new FormData(f));

    // Clean & Normalize
    data.client_number = formatClientPhone(data.client_number || '');
    data.pan_no = formatClientPan(data.pan_no || '');
    const rawAadhar = (data.aadhar_no || '').replace(/\D/g, '');
    data.aadhar_no = rawAadhar;
    data.email_id = (data.email_id || '').trim().toLowerCase();

    // 1. Phone validation (Indian 10-digit mobile starting with 6-9)
    if (data.client_number) {
        if (!/^[6-9]\d{9}$/.test(data.client_number)) {
            msg.className = 'error';
            msg.textContent = 'Client phone number must be a valid 10-digit mobile number starting with 6, 7, 8, or 9.';
            f.client_number.focus();
            return;
        }
    }

    // 2. PAN validation (5 letters, 4 digits, 1 letter)
    if (data.pan_no && !data.pan_no.includes('*')) {
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(data.pan_no)) {
            msg.className = 'error';
            msg.textContent = 'PAN Card must be exactly 10 characters in the format ABCDE1234F (5 letters, 4 digits, 1 letter).';
            f.pan_no.focus();
            return;
        }
    }

    // 3. Aadhar validation (12 numeric digits, not all identical)
    if (rawAadhar && !rawAadhar.includes('*')) {
        if (rawAadhar.length !== 12) {
            msg.className = 'error';
            msg.textContent = 'Aadhar Card must be exactly 12 numeric digits.';
            f.aadhar_no.focus();
            return;
        }
        if (/^(\d)\1{11}$/.test(rawAadhar)) {
            msg.className = 'error';
            msg.textContent = 'Invalid Aadhar Number: cannot consist of all identical digits.';
            f.aadhar_no.focus();
            return;
        }
    }

    // 4. Email validation
    if (data.email_id) {
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(data.email_id)) {
            msg.className = 'error';
            msg.textContent = 'Please provide a valid email address (e.g. name@domain.com).';
            f.email_id.focus();
            return;
        }
    }

    // 5. Amount validation
    const usdt = parseFloat(data.usdt || 0);
    const div = parseFloat(data.divided_by || 0);
    if (usdt <= 0) {
        msg.className = 'error';
        msg.textContent = 'USDT amount must be greater than zero.';
        f.usdt.focus();
        return;
    }
    if (div <= 0) {
        msg.className = 'error';
        msg.textContent = 'Divided By (Exchange Rate) must be greater than zero.';
        f.divided_by.focus();
        return;
    }

    try {
        await api('create_payment', data);

        // Auto-save client directly to MySQL if new
        if (data.client_name || data.client_number) {
            try {
                await api('upsert_client_node', {
                    client_name: data.client_name || 'Unknown Client',
                    client_number: data.client_number || '',
                    email_id: data.email_id || '',
                    pan_no: data.pan_no || '',
                    aadhar_no: data.aadhar_no || '',
                    state: data.state || ''
                });
            } catch(e) {}
        }

        msg.className = '';
        msg.textContent = 'Payment recorded successfully!';
        f.reset();
        f.payment_date.value = new Date().toISOString().slice(0, 10);
        f.divided_by.value = '88';
        f.payment_mode.value = 'P2P';
        f.received_in.value = 'Digital Verse';

        setTimeout(() => msg.textContent = '', 4000);
    } catch (err) {
        msg.className = 'error';
        msg.textContent = err.message || 'Failed to save payment';
    }
};
