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

const clientSearchInput = document.getElementById('clientSearchInput');

function renderClientRows(clients) {
    const q = (clientSearchInput?.value || '').toLowerCase().trim();
    const filtered = clients.filter(c => {
        if (!q) return true;
        return (c.client_name || '').toLowerCase().includes(q) ||
               (c.client_number || '').toLowerCase().includes(q) ||
               (c.email_id || '').toLowerCase().includes(q) ||
               (c.pan_no || '').toLowerCase().includes(q) ||
               (c.aadhar_no || '').toLowerCase().includes(q) ||
               (c.state || '').toLowerCase().includes(q);
    });

    list.innerHTML = filtered.map((c, idx) => {
        const hasPan = c.pan_no && String(c.pan_no).trim().length > 0;
        const hasAadhar = c.aadhar_no && String(c.aadhar_no).trim().length > 0;
        const kycBadge = (!hasPan || !hasAadhar)
            ? `<span class="tag tag-danger" style="font-size:11px; font-weight:700;">KYC Remaining</span>`
            : `<span class="tag tag-success" style="font-size:11px; font-weight:700;">KYC Verified</span>`;

        return `<tr>
            <td><strong>${escapeHtml(c.client_name || '')}</strong></td>
            <td>${escapeHtml(c.client_number || '-')}</td>
            <td>${escapeHtml(c.email_id || '-')}</td>
            <td><code>${escapeHtml(c.pan_no || '-')}</code></td>
            <td><code>${escapeHtml(c.aadhar_no || '-')}</code></td>
            <td>${escapeHtml(c.state || '-')}</td>
            <td>${kycBadge}</td>
            <td style="white-space:nowrap;">
                <button class="ghost" style="padding:4px 8px; font-size:11px; margin-right:4px;" onclick="editClient(${c.id || 0})">Edit</button>
                <button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteClient(${c.id || 0}, '${(c.client_number||'').replace(/'/g, "\\'")}', '${(c.client_name||'').replace(/'/g, "\\'")}')">Delete</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="8" class="text-muted" style="text-align:center; padding:20px;">No matching clients found.</td></tr>';
}

if (clientSearchInput) {
    clientSearchInput.addEventListener('input', () => {
        renderClientRows(cachedClients);
    });
}

async function render() {
    // 1. Render Registered Clients
    const clients = await getClientsData();
    renderClientRows(clients);

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
        <td><strong>${escapeHtml(g.agent)}</strong></td>
        <td>${escapeHtml(g.client)}</td>
        <td>${escapeHtml(g.number)}</td>
        <td>${escapeHtml(g.email)}</td>
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

window.editClient = function(id) {
    const c = cachedClients.find(item => Number(item.id) === Number(id));
    if (!c) {
        alert('Client not found.');
        return;
    }

    const idInput = document.getElementById('c_client_id');
    const nameInput = document.getElementById('c_client_name');
    const numInput = document.getElementById('c_client_number');
    const emailInput = document.getElementById('c_email_id');
    const panInput = document.getElementById('c_pan_no');
    const aadharInput = document.getElementById('c_aadhar_no');
    const stateInput = document.getElementById('c_state');
    const submitBtn = document.getElementById('submitClientBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');

    if (idInput) idInput.value = c.id || '';
    if (nameInput) nameInput.value = c.client_name || '';
    if (numInput) numInput.value = c.client_number || '';
    if (emailInput) emailInput.value = c.email_id || '';
    if (panInput) panInput.value = c.pan_no || '';
    if (aadharInput) aadharInput.value = formatClientAadhar(c.aadhar_no || '');
    if (stateInput) stateInput.value = c.state || '';

    if (submitBtn) submitBtn.textContent = 'Update Client Profile';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';

    nameInput?.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.cancelClientEdit = function() {
    const idInput = document.getElementById('c_client_id');
    const submitBtn = document.getElementById('submitClientBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');

    if (idInput) idInput.value = '';
    form.reset();
    if (submitBtn) submitBtn.textContent = 'Save Client Profile';
    if (cancelBtn) cancelBtn.style.display = 'none';
};

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

if (form.client_number) {
    form.client_number.addEventListener('input', () => {
        form.client_number.value = formatClientPhone(form.client_number.value);
    });
}
if (form.pan_no) {
    form.pan_no.addEventListener('input', () => {
        form.pan_no.value = formatClientPan(form.pan_no.value);
    });
}
if (form.aadhar_no) {
    form.aadhar_no.addEventListener('input', () => {
        form.aadhar_no.value = formatClientAadhar(form.aadhar_no.value);
    });
}
if (form.email_id) {
    form.email_id.addEventListener('blur', () => {
        form.email_id.value = form.email_id.value.trim().toLowerCase();
    });
}

form.onsubmit = async e => {
    e.preventDefault();
    msg.textContent = '';
    msg.className = '';

    const data = Object.fromEntries(new FormData(form));

    // Clean & Normalize
    data.client_number = formatClientPhone(data.client_number || '');
    data.pan_no = formatClientPan(data.pan_no || '');
    const rawAadhar = (data.aadhar_no || '').replace(/\D/g, '');
    data.aadhar_no = rawAadhar;
    data.email_id = (data.email_id || '').trim().toLowerCase();

    // 1. Phone validation (Indian 10-digit mobile starting with 6-9)
    if (data.client_number) {
        if (!/^[6-9]\d{9}$/.test(data.client_number)) {
            alert('Client phone number must be a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
            form.client_number.focus();
            return;
        }
    } else {
        alert('Client Phone Number is required.');
        form.client_number.focus();
        return;
    }

    // 2. PAN validation (5 letters, 4 digits, 1 letter)
    if (data.pan_no && !data.pan_no.includes('*')) {
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(data.pan_no)) {
            alert('PAN Card must be exactly 10 characters in the format ABCDE1234F (5 letters, 4 digits, 1 letter).');
            form.pan_no.focus();
            return;
        }
    }

    // 3. Aadhar validation (12 numeric digits, not all identical)
    if (rawAadhar && !rawAadhar.includes('*')) {
        if (rawAadhar.length !== 12) {
            alert('Aadhar Card must be exactly 12 numeric digits.');
            form.aadhar_no.focus();
            return;
        }
        if (/^(\d)\1{11}$/.test(rawAadhar)) {
            alert('Invalid Aadhar Number: cannot consist of all identical digits.');
            form.aadhar_no.focus();
            return;
        }
    }

    // 4. Email validation
    if (data.email_id) {
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(data.email_id)) {
            alert('Please provide a valid email address (e.g. name@domain.com).');
            form.email_id.focus();
            return;
        }
    }

    try {
        await api('upsert_client_node', data);
        msg.textContent = data.id ? 'Client profile updated successfully!' : 'Client profile saved successfully!';
        cancelClientEdit();
        await render();
        setTimeout(() => msg.textContent = '', 3500);
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
                    let name = String(r['Client Name'] || r['client_name'] || r['Name'] || r['Client'] || '').trim();
                    let rawNum = String(r['Client Number'] || r['client_number'] || r['Phone'] || r['Mobile'] || '').trim();
                    let num = formatClientPhone(rawNum);
                    let email = String(r['Email ID'] || r['email_id'] || r['Email'] || '').trim().toLowerCase();
                    let pan = formatClientPan(String(r['PAN NO'] || r['pan_no'] || r['PAN'] || ''));
                    let aadhar = String(r['AADHAR NO'] || r['aadhar_no'] || r['Aadhar'] || '').replace(/\D/g, '');
                    let state = String(r['STATE'] || r['state'] || r['State'] || '').trim();

                    if (name || num) {
                        try {
                            await api('upsert_client_node', {
                                client_name: name || 'Unknown Client',
                                client_number: num,
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
