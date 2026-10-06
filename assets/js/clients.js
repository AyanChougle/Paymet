const form = document.getElementById('clientForm');
const list = document.getElementById('clientList');
const msg = document.getElementById('msg');
const paidBody = document.getElementById('paidClientsBody');
const paidFoot = document.getElementById('paidClientsFoot');

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getClients() {
    return JSON.parse(localStorage.getItem('pp_clients') || '[]');
}

function saveClients(clients) {
    localStorage.setItem('pp_clients', JSON.stringify(clients));
}

async function render() {
    // 1. Render Registered Clients
    const clients = getClients();
    list.innerHTML = clients.map((c, idx) => `<tr>
        <td><strong>${c.client_name || ''}</strong></td>
        <td>${c.client_number || '-'}</td>
        <td>${c.email_id || '-'}</td>
        <td><code>${c.pan_no || '-'}</code></td>
        <td><code>${c.aadhar_no || '-'}</code></td>
        <td>${c.state || '-'}</td>
        <td><button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteClient(${idx})">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="text-muted" style="text-align:center; padding:20px;">No registered clients found.</td></tr>';

    // 2. Render Paid Clients Breakdown (Sheet 3 from Excel)
    const dash = await api('dashboard', {});
    const rawPayments = dash.rawPayments || [];

    // Group by Agent -> Client
    const groups = {};
    let grandDv = 0;
    let grandWk = 0;
    let grandTotal = 0;

    rawPayments.forEach(p => {
        const ag = p.agent_name || 'Unknown Agent';
        const cl = p.client_name || 'Unknown Client';
        const key = `${ag}:::${cl}`;
        const inr = parseFloat(p.inr_amount || 0);
        const comp = (p.received_in || 'Digital Verse').toLowerCase();

        if (!groups[key]) {
            groups[key] = {
                agent: ag,
                client: cl,
                number: p.client_number || '-',
                email: p.email_id || '-',
                dv: 0,
                wk: 0,
                total: 0
            };
        }

        if (comp.includes('world') || comp.includes('wk')) {
            groups[key].wk += inr;
            grandWk += inr;
        } else {
            groups[key].dv += inr;
            grandDv += inr;
        }

        groups[key].total += inr;
        grandTotal += inr;
    });

    const groupArray = Object.values(groups).sort((a, b) => b.total - a.total);

    paidBody.innerHTML = groupArray.map(g => `<tr>
        <td><strong>${g.agent}</strong></td>
        <td>${g.client}</td>
        <td>${g.number}</td>
        <td>${g.email}</td>
        <td>${g.dv > 0 ? fmtInr(g.dv) : '-'}</td>
        <td>${g.wk > 0 ? fmtInr(g.wk) : '-'}</td>
        <td style="font-weight:700; color:var(--accent);">${fmtInr(g.total)}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="text-muted" style="text-align:center; padding:20px;">No paid transactions recorded yet.</td></tr>';

    paidFoot.innerHTML = `<tr>
        <td colspan="4">Grand Total</td>
        <td>${fmtInr(grandDv)}</td>
        <td>${fmtInr(grandWk)}</td>
        <td style="color:var(--accent);">${fmtInr(grandTotal)}</td>
    </tr>`;
}

window.deleteClient = function(idx) {
    if (confirm('Delete this client?')) {
        let clients = getClients();
        clients.splice(idx, 1);
        saveClients(clients);
        render();
    }
};

form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let clients = getClients();

    const existingIndex = clients.findIndex(c => c.client_number === data.client_number || (data.email_id && c.email_id === data.email_id));
    if (existingIndex >= 0) {
        clients[existingIndex] = data;
        msg.textContent = 'Client profile updated!';
    } else {
        clients.push(data);
        msg.textContent = 'New client added!';
    }

    saveClients(clients);
    form.reset();
    render();
    setTimeout(() => msg.textContent = '', 3000);
};

render();
