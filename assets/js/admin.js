const userList = document.getElementById('userList');
const userForm = document.getElementById('userForm');
const userMsg = document.getElementById('userMsg');
const importFile = document.getElementById('importFile');
const importBtn = document.getElementById('importBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const targetForm = document.getElementById('targetForm');
const targetList = document.getElementById('targetList');
const targetMsg = document.getElementById('targetMsg');

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

// Excel and CSV Import Logic
importBtn.onclick = function() {
    const file = importFile.files[0];
    if (!file) {
        return alert('Please select an Excel or CSV file first.');
    }

    importBtn.textContent = 'Importing...';
    importBtn.disabled = true;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('payment') || n.toLowerCase().includes('sheet')) || workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (jsonRows.length === 0) throw new Error('File is empty or contains no records.');

            let successCount = 0;

            for (let i = 0; i < jsonRows.length; i++) {
                const row = jsonRows[i];
                let dbData = {};

                for (const key in row) {
                    const k = key.toLowerCase().trim();
                    const val = row[key];

                    if (k === 'date' || k.includes('payment date')) dbData.payment_date = val;
                    else if (k === 'agent name' || k.includes('agent')) dbData.agent_name = val;
                    else if (k.includes('emp code') || k.includes('e-code') || k === 'ecode') dbData.ecode = val;
                    else if (k.includes('ops manager') || k.includes('ops')) dbData.ops_manager = val;
                    else if (k === 'tl name' || k === 'tl' || k.includes('leader')) dbData.tl = val;
                    else if (k.includes('mode') || k.includes('payment mode')) dbData.payment_mode = val;
                    else if (k.includes('usdt')) dbData.usdt = val;
                    else if (k.includes('divided')) dbData.divided_by = val;
                    else if (k.includes('ratio')) dbData.ratio = val;
                    else if (k.includes('received company') || k.includes('received in') || k === 'company') dbData.received_in = val;
                    else if (k.includes('client name') || k === 'client') dbData.client_name = val;
                    else if (k.includes('client number') || k.includes('clientnumber') || k === 'number' || k.includes('phone')) dbData.client_number = val;
                    else if (k.includes('email')) dbData.email_id = val;
                    else if (k.includes('pan')) dbData.pan_no = val;
                    else if (k.includes('aadhar')) dbData.aadhar_no = val;
                    else if (k.includes('state')) dbData.state = val;
                    else if (k.includes('remark') || k.includes('ref')) dbData.remarks = val;
                }

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

                if (!dbData.payment_date || dbData.payment_date.includes('NaN')) {
                    dbData.payment_date = new Date().toISOString().split('T')[0];
                }

                if (!dbData.agent_name) dbData.agent_name = 'Unassigned Agent';

                const cleanNum = (val) => val ? String(val).replace(/[^0-9.-]+/g, '') : '0';
                if (dbData.usdt) dbData.usdt = cleanNum(dbData.usdt);
                if (dbData.divided_by) dbData.divided_by = cleanNum(dbData.divided_by) || '88';

                await api('create_payment', dbData);
                successCount++;
            }

            alert(`Successfully imported ${successCount} payment records!`);
            importFile.value = '';
            load();
        } catch (err) {
            alert('Import Error: ' + err.message);
        } finally {
            importBtn.textContent = 'Import Spreadsheet';
            importBtn.disabled = false;
        }
    };
    reader.readAsArrayBuffer(file);
};

// Clear Data
clearAllBtn.onclick = function() {
    if (confirm('Are you sure you want to wipe all local payment records? This cannot be undone.')) {
        localStorage.setItem('pp_payments', JSON.stringify([]));
        alert('All payment records wiped.');
        load();
    }
};

load().catch(e => console.error(e));