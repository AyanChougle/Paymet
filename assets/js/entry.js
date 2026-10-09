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
    try {
        const [agRes, clRes] = await Promise.all([
            api('agents', {}).catch(() => ({ agents: [] })),
            api('clients', {}).catch(() => ({ rows: [] }))
        ]);
        if (agRes.agents && agRes.agents.length) {
            dbAgents = agRes.agents;
            localStorage.setItem('pp_agents', JSON.stringify(dbAgents));
        } else {
            dbAgents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
        }
        if (clRes.rows && clRes.rows.length) {
            dbClients = clRes.rows;
            localStorage.setItem('pp_clients', JSON.stringify(dbClients));
        } else {
            dbClients = JSON.parse(localStorage.getItem('pp_clients') || '[]');
        }
    } catch(e) {
        dbAgents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
        dbClients = JSON.parse(localStorage.getItem('pp_clients') || '[]');
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

f.ecode.addEventListener('input', () => autofillAgent('ecode', f.ecode.value.trim()));
f.agent_name.addEventListener('input', () => autofillAgent('agent_name', f.agent_name.value.trim()));

f.client_name.addEventListener('input', () => autofillClient('client_name', f.client_name.value.trim()));
f.client_number.addEventListener('input', () => autofillClient('client_number', f.client_number.value.trim()));
f.email_id.addEventListener('input', () => autofillClient('email_id', f.email_id.value.trim()));

// Submission
f.onsubmit = async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.className = '';

    const data = Object.fromEntries(new FormData(f));

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

        msg.textContent = 'Payment recorded successfully!';
        f.reset();
        f.payment_date.value = new Date().toISOString().slice(0, 10);
        f.divided_by.value = '88';
        f.payment_mode.value = 'P2P';
        f.received_in.value = 'Digital Verse';

        setTimeout(() => msg.textContent = '', 3500);
    } catch (err) {
        msg.className = 'error';
        msg.textContent = err.message || 'Failed to save payment';
    }
};
