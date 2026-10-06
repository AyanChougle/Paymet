const userList = document.getElementById('userList');
const userForm = document.getElementById('userForm');
const userMsg = document.getElementById('userMsg');
const importFile = document.getElementById('importFile');
const importBtn = document.getElementById('importBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const targetForm = document.getElementById('targetForm');
const targetList = document.getElementById('targetList');
const targetMsg = document.getElementById('targetMsg');
const exportBackupBtn = document.getElementById('exportBackupBtn');

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInrInt = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtUsdt = (num) => Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getTargets() {
    return JSON.parse(localStorage.getItem('pp_targets') || '[]');
}

function saveTargets(targets) {
    localStorage.setItem('pp_targets', JSON.stringify(targets));
}

function renderTargets() {
    const targets = getTargets();
    targetList.innerHTML = targets.map((t, idx) => `<tr>
        <td><strong>${t.type === 'OPS' ? 'Ops Manager' : 'Team Leader (TL)'}</strong></td>
        <td><strong>${t.name}</strong></td>
        <td style="font-weight:700; color:var(--accent);">${fmtInrInt(t.target)}</td>
        <td><button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteTarget(${idx})">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="4" class="text-muted" style="text-align:center; padding:16px;">No OPS or TL targets configured yet.</td></tr>';
}

window.deleteTarget = function(idx) {
    if (confirm('Delete this target?')) {
        let targets = getTargets();
        targets.splice(idx, 1);
        saveTargets(targets);
        renderTargets();
    }
};

targetForm.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(targetForm));
    data.name = data.name.trim();
    data.target = parseFloat(data.target || 0);

    let targets = getTargets();
    const existingIndex = targets.findIndex(t => t.type === data.type && t.name.toLowerCase() === data.name.toLowerCase());

    if (existingIndex >= 0) {
        targets[existingIndex].target = data.target;
        targetMsg.textContent = 'Target updated!';
    } else {
        targets.push(data);
        targetMsg.textContent = 'Target saved!';
    }

    saveTargets(targets);
    targetForm.reset();
    renderTargets();
    setTimeout(() => targetMsg.textContent = '', 3000);
};

async function load() {
    renderTargets();

    const j = await api('admin');
    document.getElementById('users').textContent = j.stats.users;
    document.getElementById('payments').textContent = j.stats.payments;

    const dash = await api('dashboard', {});
    const raw = dash.rawPayments || [];

    let u = 0, i = 0;
    raw.forEach(p => {
        u += (parseFloat(p.usdt) || 0);
        i += (parseFloat(p.inr_amount) || 0);
    });

    const acc = JSON.parse(localStorage.getItem('pp_accounts') || '[]');
    let c = 0;
    acc.forEach(x => {
        c += (parseFloat(x.amount) || 0);
    });

    document.getElementById('aUsdt').textContent = fmtUsdt(u);
    document.getElementById('aInr').textContent = fmtInr(i);
    document.getElementById('aCash').textContent = fmtInr(c);
    document.getElementById('aBal').textContent = fmtInr(i - c);

    userList.innerHTML = j.users.map(u => `<tr>
        <td><strong>${u.name}</strong></td>
        <td>${u.email}</td>
        <td><span style="font-weight:700; color:var(--accent); font-size:11.5px;">${u.role}</span></td>
    </tr>`).join('');
}

userForm.onsubmit = async e => {
    e.preventDefault();
    userMsg.textContent = '';
    try {
        await api('create_user', Object.fromEntries(new FormData(userForm)));
        userMsg.textContent = 'User created successfully!';
        userForm.reset();
        load();
        setTimeout(() => userMsg.textContent = '', 3000);
    } catch (x) {
        userMsg.textContent = x.message;
    }
};

// ==========================================
// MASTER WORKBOOK IMPORTER (AUTO-BIFURCATOR)
// ==========================================
importBtn.onclick = function() {
    const file = importFile.files[0];
    if (!file) {
        return alert('Please select an Excel (.xlsx, .xls) or CSV file first.');
    }

    importBtn.textContent = 'Importing & Bifurcating...';
    importBtn.disabled = true;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // 1. Identify best sheet for raw payments (e.g. Payment Sheet, Payment, or Sheet 1)
            let paymentSheetName = workbook.SheetNames.find(n => {
                const ln = n.toLowerCase();
                return ln.includes('payment sheet') || ln.includes('payment') || ln.includes('raw') || ln.includes('data');
            }) || workbook.SheetNames[0];

            const sheet = workbook.Sheets[paymentSheetName];
            const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (jsonRows.length === 0) throw new Error('Selected spreadsheet is empty or contains no records.');

            let payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
            let agents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
            let clients = JSON.parse(localStorage.getItem('pp_clients') || '[]');

            let newPaymentsCount = 0;
            let newAgentsCount = 0;
            let newClientsCount = 0;

            const nextId = payments.length ? Math.max(...payments.map(p => p.id || 0)) + 1 : 1;

            jsonRows.forEach((row, idx) => {
                let dbData = {};

                for (const key in row) {
                    const k = key.toLowerCase().trim();
                    const val = String(row[key] || '').trim();

                    if (k === 'date' || k.includes('payment date')) dbData.payment_date = row[key];
                    else if (k.includes('emp code') || k.includes('e-code') || k === 'ecode') dbData.ecode = val;
                    else if (k === 'agent name' || k.includes('agent')) dbData.agent_name = val;
                    else if (k.includes('ops manager') || k.includes('ops')) dbData.ops_manager = val;
                    else if (k === 'tl name' || k === 'tl' || k.includes('leader')) dbData.tl = val;
                    else if (k.includes('client name') || k === 'client') dbData.client_name = val;
                    else if (k.includes('client number') || k.includes('clientnumber') || k === 'number' || k.includes('phone') || k.includes('mobile')) dbData.client_number = val;
                    else if (k.includes('email')) dbData.email_id = val;
                    else if (k.includes('mode') || k.includes('payment mode')) dbData.payment_mode = val;
                    else if (k.includes('usdt')) dbData.usdt = row[key];
                    else if (k.includes('divided') || k.includes('rate')) dbData.divided_by = row[key];
                    else if (k.includes('inr amount') || k === 'inr' || k.includes('inr')) dbData.inr_amount = row[key];
                    else if (k.includes('ratio')) dbData.ratio = val;
                    else if (k.includes('pan')) dbData.pan_no = val;
                    else if (k.includes('aadhar')) dbData.aadhar_no = val;
                    else if (k.includes('state')) dbData.state = val;
                    else if (k.includes('received company') || k.includes('received in') || k === 'company') dbData.received_in = val;
                    else if (k.includes('remark') || k.includes('ref')) dbData.remarks = val;
                }

                // Date normalization
                if (dbData.payment_date) {
                    if (typeof dbData.payment_date === 'number') {
                        const d = new Date(Math.round((dbData.payment_date - 25569) * 86400 * 1000));
                        dbData.payment_date = d.toISOString().split('T')[0];
                    } else {
                        const strDate = String(dbData.payment_date).trim();
                        if (strDate.includes('-')) {
                            const parts = strDate.split('-');
                            if (parts.length === 3) {
                                const monthNames = { 'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12' };
                                const mKey = parts[1].toLowerCase().slice(0, 3);
                                if (monthNames[mKey]) {
                                    let yr = parts[2].length === 2 ? '20' + parts[2] : parts[2];
                                    dbData.payment_date = `${yr}-${monthNames[mKey]}-${parts[0].padStart(2, '0')}`;
                                }
                            }
                        } else if (strDate.includes('/')) {
                            const parts = strDate.split('/');
                            if (parts.length === 3) {
                                let yr = parts[2].length === 2 ? '20' + parts[2] : parts[2];
                                dbData.payment_date = `${yr}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                            }
                        }
                    }
                }

                if (!dbData.payment_date || String(dbData.payment_date).includes('NaN')) {
                    dbData.payment_date = new Date().toISOString().split('T')[0];
                }

                if (!dbData.agent_name) dbData.agent_name = 'Unassigned Agent';

                const cleanNum = (v) => v ? parseFloat(String(v).replace(/[^0-9.-]+/g, '')) || 0 : 0;
                dbData.usdt = cleanNum(dbData.usdt);
                dbData.divided_by = cleanNum(dbData.divided_by) || 88;
                dbData.inr_amount = cleanNum(dbData.inr_amount) || Math.round((dbData.usdt * dbData.divided_by) * 100) / 100;
                dbData.payment_mode = (dbData.payment_mode || 'P2P').toUpperCase().includes('D') ? 'D P2P' : 'P2P';
                dbData.received_in = (dbData.received_in || '').toLowerCase().includes('world') || (dbData.received_in || '').toLowerCase().includes('wk') ? 'World of Crypto' : 'Digital Verse';

                // Assign ID & Creator
                dbData.id = nextId + idx;
                dbData.created_by_name = 'Excel Master Import';
                dbData.created_at = dbData.payment_date + ' 12:00:00';

                payments.push(dbData);
                newPaymentsCount++;

                // ==========================================
                // BIFURCATION 1: AGENTS DIRECTORY AUTO-SYNC
                // ==========================================
                if (dbData.agent_name && dbData.agent_name !== 'Unassigned Agent') {
                    const existingAgent = agents.find(a => (a.agent_name || '').toLowerCase() === dbData.agent_name.toLowerCase());
                    if (!existingAgent) {
                        agents.push({
                            ecode: dbData.ecode || `EMP-${100 + agents.length + 1}`,
                            agent_name: dbData.agent_name,
                            ops_manager: dbData.ops_manager || '',
                            tl: dbData.tl || ''
                        });
                        newAgentsCount++;
                    } else {
                        if (!existingAgent.ecode && dbData.ecode) existingAgent.ecode = dbData.ecode;
                        if (!existingAgent.ops_manager && dbData.ops_manager) existingAgent.ops_manager = dbData.ops_manager;
                        if (!existingAgent.tl && dbData.tl) existingAgent.tl = dbData.tl;
                    }
                }

                // ==========================================
                // BIFURCATION 2: CLIENTS DIRECTORY AUTO-SYNC
                // ==========================================
                if (dbData.client_name || dbData.client_number) {
                    const cNum = dbData.client_number || '';
                    const cName = dbData.client_name || '';
                    const existingClient = clients.find(c => (cNum && c.client_number === cNum) || (cName && (c.client_name || '').toLowerCase() === cName.toLowerCase()));
                    if (!existingClient) {
                        clients.push({
                            client_name: cName || 'Unknown Client',
                            client_number: cNum || '-',
                            email_id: dbData.email_id || '',
                            pan_no: dbData.pan_no || '',
                            aadhar_no: dbData.aadhar_no || '',
                            state: dbData.state || ''
                        });
                        newClientsCount++;
                    } else {
                        if (!existingClient.email_id && dbData.email_id) existingClient.email_id = dbData.email_id;
                        if (!existingClient.pan_no && dbData.pan_no) existingClient.pan_no = dbData.pan_no;
                        if (!existingClient.aadhar_no && dbData.aadhar_no) existingClient.aadhar_no = dbData.aadhar_no;
                        if (!existingClient.state && dbData.state) existingClient.state = dbData.state;
                    }
                }
            });

            // Save all bifurcated collections
            localStorage.setItem('pp_payments', JSON.stringify(payments));
            localStorage.setItem('pp_agents', JSON.stringify(agents));
            localStorage.setItem('pp_clients', JSON.stringify(clients));

            alert(`Master Import Successful!\n\n• ${newPaymentsCount} Payments Imported\n• ${newAgentsCount} New Agents Added to Directory\n• ${newClientsCount} New Clients Registered with KYC`);
            importFile.value = '';
            load();
        } catch (err) {
            alert('Import Error: ' + err.message);
        } finally {
            importBtn.textContent = 'Import Master Spreadsheet';
            importBtn.disabled = false;
        }
    };
    reader.readAsArrayBuffer(file);
};

// ==========================================
// MASTER EXPORTER (ALL MODULES IN 1 EXCEL)
// ==========================================
if (exportBackupBtn) {
    exportBackupBtn.onclick = function() {
        const wb = XLSX.utils.book_new();

        const payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
        const agents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
        const clients = JSON.parse(localStorage.getItem('pp_clients') || '[]');
        const targets = JSON.parse(localStorage.getItem('pp_targets') || '[]');
        const accounts = JSON.parse(localStorage.getItem('pp_accounts') || '[]');

        // Sheet 1: Payments
        const wsPayments = XLSX.utils.json_to_sheet(payments);
        XLSX.utils.book_append_sheet(wb, wsPayments, 'Payment Sheet');

        // Sheet 2: Agents
        const wsAgents = XLSX.utils.json_to_sheet(agents);
        XLSX.utils.book_append_sheet(wb, wsAgents, 'Agents Directory');

        // Sheet 3: Clients
        const wsClients = XLSX.utils.json_to_sheet(clients);
        XLSX.utils.book_append_sheet(wb, wsClients, 'Clients Directory');

        // Sheet 4: Targets
        const wsTargets = XLSX.utils.json_to_sheet(targets);
        XLSX.utils.book_append_sheet(wb, wsTargets, 'OPS & TL Targets');

        // Sheet 5: Accounts Ledger
        const wsAccounts = XLSX.utils.json_to_sheet(accounts);
        XLSX.utils.book_append_sheet(wb, wsAccounts, 'Accounts Handover');

        XLSX.writeFile(wb, `Master_Portal_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
}

// Clear Data
clearAllBtn.onclick = function() {
    if (confirm('Are you sure you want to wipe all local records across payments, agents, and clients? This cannot be undone.')) {
        localStorage.setItem('pp_payments', JSON.stringify([]));
        localStorage.setItem('pp_agents', JSON.stringify([]));
        localStorage.setItem('pp_clients', JSON.stringify([]));
        localStorage.setItem('pp_targets', JSON.stringify([]));
        localStorage.setItem('pp_accounts', JSON.stringify([]));
        alert('All portal records reset to zero.');
        load();
    }
};

load().catch(e => console.error(e));