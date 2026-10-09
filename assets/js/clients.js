const form = document.getElementById('clientForm');
const list = document.getElementById('clientList');
const msg = document.getElementById('msg');
const paidBody = document.getElementById('paidClientsBody');
const paidFoot = document.getElementById('paidClientsFoot');
const importClientsFile = document.getElementById('importClientsFile');
const exportClientsBtn = document.getElementById('exportClientsBtn');

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let cachedClients = [];

async function getClientsData() {
    try {
        const res = await api('clients', {});
        cachedClients = res.rows || [];
        localStorage.setItem('pp_clients', JSON.stringify(cachedClients));
        return cachedClients;
    } catch(e) {
        cachedClients = JSON.parse(localStorage.getItem('pp_clients') || '[]');
        return cachedClients;
    }
}

async function render() {
    // 1. Render Registered Clients
    const clients = await getClientsData();
    list.innerHTML = clients.map((c, idx) => `<tr>
        <td><strong>${c.client_name || ''}</strong></td>
        <td>${c.client_number || '-'}</td>
        <td>${c.email_id || '-'}</td>
        <td><code>${c.pan_no || '-'}</code></td>
        <td><code>${c.aadhar_no || '-'}</code></td>
        <td>${c.state || '-'}</td>
        <td><button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteClient(${c.id || 0}, '${(c.client_number||'').replace(/'/g, "\\'")}', '${(c.client_name||'').replace(/'/g, "\\'")}')">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="text-muted" style="text-align:center; padding:20px;">No registered clients found.</td></tr>';

    // 2. Render Paid Clients Breakdown (Sheet 3 from Excel)
    const dash = await api('dashboard', {}).catch(() => ({ rawPayments: [] }));
    const rawPayments = dash.rawPayments || [];

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

    window.currentPaidClientsGroup = groupArray;
}

window.deleteClient = async function(id, clientNumber, clientName) {
    if (confirm(`Delete client "${clientName || clientNumber}" from database?`)) {
        try {
            await api('remove_client_node', { id, client_number: clientNumber, client_name: clientName });
            await render();
        } catch(e) {
            alert('Failed to delete client: ' + e.message);
        }
    }
};

form.onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    try {
        await api('upsert_client_node', data);
        msg.textContent = 'Client saved to database!';
        form.reset();
        await render();
        setTimeout(() => msg.textContent = '', 3000);
    } catch(err) {
        alert('Error saving client: ' + err.message);
    }
};

// Import Clients Excel
if (importClientsFile) {
    importClientsFile.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                let count = 0;

                for (const r of rows) {
                    let name = r['Client Name'] || r['client_name'] || r['Name'] || r['Client'] || '';
                    let num = r['Client Number'] || r['client_number'] || r['Phone'] || r['Mobile'] || '';
                    let email = r['Email ID'] || r['email_id'] || r['Email'] || '';
                    let pan = r['PAN NO'] || r['pan_no'] || r['PAN'] || '';
                    let aadhar = r['AADHAR NO'] || r['aadhar_no'] || r['Aadhar'] || '';
                    let state = r['STATE'] || r['state'] || r['State'] || '';

                    if (name || num) {
                        try {
                            await api('upsert_client_node', {
                                client_name: name || 'Unknown Client',
                                client_number: String(num || ''),
                                email_id: email,
                                pan_no: pan,
                                aadhar_no: aadhar,
                                state: state
                            });
                            count++;
                        } catch(e) {}
                    }
                }

                await render();
                alert(`Successfully imported ${count} clients into the database!`);
                importClientsFile.value = '';
            } catch (err) {
                alert('Import Error: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };
}

// Export Clients Excel
if (exportClientsBtn) {
    exportClientsBtn.onclick = function() {
        const clients = cachedClients || [];
        const paidGroups = window.currentPaidClientsGroup || [];

        const wb = XLSX.utils.book_new();

        // Sheet 1: Master Directory
        const wsDir = XLSX.utils.json_to_sheet(clients);
        XLSX.utils.book_append_sheet(wb, wsDir, 'Clients Directory');

        // Sheet 2: Paid Summary (Sheet 3)
        if (paidGroups.length) {
            const wsPaid = XLSX.utils.json_to_sheet(paidGroups.map(g => ({
                'Agent Name': g.agent,
                'Client Name': g.client,
                'Client Number': g.number,
                'Email ID': g.email,
                'Digital Verse (INR)': g.dv,
                'World of Crypto (INR)': g.wk,
                'Grand Total (INR)': g.total
            })));
            XLSX.utils.book_append_sheet(wb, wsPaid, 'Paid Clients Breakdown');
        }

        XLSX.writeFile(wb, `Clients_KYC_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
}

render();
