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

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInrInt = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtUsdt = (num) => Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let cachedDbTargets = [];

async function getTargets() {
    try {
        const [agRes] = await Promise.all([
            api('agents', {}).catch(() => ({}))
        ]);
        const list = [];
        (agRes.ops_managers || []).forEach(o => {
            const t = parseFloat(o.monthly_target || 0);
            if (t > 0 || o.name) list.push({ type: 'OPS', name: o.name, target: t });
        });
        (agRes.team_leaders || []).forEach(t => {
            const tgt = parseFloat(t.monthly_target || 0);
            if (tgt > 0 || t.name) list.push({ type: 'TL', name: t.name, target: tgt });
        });
        if (list.length) {
            cachedDbTargets = list;
            localStorage.setItem('pp_targets', JSON.stringify(list));
            return list;
        }
    } catch(e) {}
    cachedDbTargets = JSON.parse(localStorage.getItem('pp_targets') || '[]');
    return cachedDbTargets;
}

function saveTargets(targets) {
    localStorage.setItem('pp_targets', JSON.stringify(targets));
}

async function renderTargets() {
    const targets = await getTargets();
    targetList.innerHTML = targets.map(t => `<tr>
        <td><strong>${t.type === 'OPS' ? 'Ops Manager' : 'Team Leader (TL)'}</strong></td>
        <td><strong>${t.name}</strong></td>
        <td style="font-weight:700; color:var(--accent);">${t.target > 0 ? fmtInrInt(t.target) : '-'}</td>
        <td><button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteTarget(${escapeHtml(JSON.stringify(t.type))}, ${escapeHtml(JSON.stringify(t.name))})">Reset</button></td>
    </tr>`).join('') || '<tr><td colspan="4" class="text-muted" style="text-align:center; padding:16px;">No OPS or TL targets configured yet.</td></tr>';
}

window.deleteTarget = async function(type, name) {
    if (confirm(`Reset target for ${name} to 0 in the database?`)) {
        try {
            await api('update_target_node', { type, name, target: 0 });
            await renderTargets();
        } catch(e) {
            alert('Failed to reset target: ' + e.message);
        }
    }
};

targetForm.onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(targetForm));
    data.name = data.name.trim();
    data.target = parseFloat(data.target || 0);

    try {
        await api('update_target_node', data);
        targetMsg.textContent = 'Target saved to database!';
        targetForm.reset();
        await renderTargets();
        setTimeout(() => targetMsg.textContent = '', 3000);
    } catch(err) {
        alert('Error saving target: ' + err.message);
    }
};

async function load() {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user || String(user.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }

    renderTargets();

    const j = await api('admin');
    document.getElementById('users').textContent = j.stats.users;
    document.getElementById('payments').textContent = j.stats.payments;

    const [dash, accRes] = await Promise.all([
        api('dashboard', {}).catch(() => ({ rawPayments: [] })),
        api('accounts', {}).catch(() => ({ rows: [] }))
    ]);
    const raw = dash.rawPayments || [];

    let u = 0, i = 0;
    raw.forEach(p => {
        u += (parseFloat(p.usdt) || 0);
        i += (parseFloat(p.inr_amount) || 0);
    });

    const acc = accRes.rows || [];
    let c = 0;
    acc.forEach(x => {
        c += (parseFloat(x.amount) || 0);
    });

    document.getElementById('aUsdt').textContent = fmtUsdt(u);
    document.getElementById('aInr').textContent = fmtInr(i);
    document.getElementById('aCash').textContent = fmtInr(c);
    document.getElementById('aBal').textContent = fmtInr(i - c);

    userList.innerHTML = j.users.map(u => {
        const cUser = getCurrentUser();
        const isCurrent = cUser && (cUser.id === u.id || (u.email && cUser.email === u.email));
        const displayName = (u.name && u.name !== u.email) ? u.name : (u.name || u.username || 'System User');
        let r = (u.role && u.role.trim()) ? u.role.toUpperCase() : 'ENTRY_USER';
        if (r === 'AGENT' || r === 'TEAM_LEADER') r = 'ENTRY_USER';
        const displayRole = r;
        const displayEmail = u.email || u.username || '';
        const deleteBtn = isCurrent ? `<span style="font-size:11px; color:var(--text-muted);">Current User</span>` :
            `<button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteUser(${u.id}, '${displayName.replace(/'/g, "\\'")}')">Delete</button>`;
        return `<tr>
            <td><strong>${escapeHtml(displayName)}</strong></td>
            <td>${escapeHtml(displayEmail)}</td>
            <td><span style="font-weight:700; color:var(--accent); font-size:11.5px;">${escapeHtml(displayRole)}</span></td>
            <td style="text-align:right;">${deleteBtn}</td>
        </tr>`;
    }).join('');
}

window.deleteUser = async function(userId, name) {
    if (!confirm(`Are you sure you want to delete user "${name}"?`)) return;
    try {
        await api('delete_user', { userId: userId });
        load();
    } catch (e) {
        alert('Error: ' + e.message);
    }
};

userForm.onsubmit = async e => {
    e.preventDefault();
    userMsg.textContent = 'Creating user...';
    userMsg.style.color = 'var(--text-muted, #718096)';
    try {
        await api('create_user', Object.fromEntries(new FormData(userForm)));
        userMsg.style.color = '#38a169';
        userMsg.textContent = 'User created successfully!';
        userForm.reset();
        await load();
        setTimeout(() => { userMsg.textContent = ''; }, 4000);
    } catch (x) {
        userMsg.style.color = '#e53e3e';
        userMsg.textContent = x.message || 'Failed to create user.';
    }
};

// ==========================================
// MASTER WORKBOOK IMPORTER (TEMPLATE-DRIVEN)
// ==========================================
// Reads the "Master Portal Backup" workbook layout sheet by sheet, matching sheets and
// columns by their exact header names. Nothing is guessed or defaulted: a row that is
// missing a required value is skipped and reported, and nothing is saved until the
// preview below has been confirmed.
//
//   Payment Sheet     SR No | Date | E-Code | Agent Name | TL Name | Ops Manager | Client Name |
//                     Client Number | Email ID | Payment Mode | USDT | INR Amount | Ratio |
//                     PAN NO | AADHAR NO | STATE | Received Company | (Entered By | Entry Timestamp)
//   Agents Directory  SR.NO | EMP ID | Agent Name | Ops Manager | Team Leader | (Current Month Sales | Transactions)
//   Clients Directory / Sheet1
//                     Client Name | Client Number | Email ID | PAN NO | AADHAR NO
//   OPS & TL Targets  SR.NO | EMP ID | <Ops Manager Name / Team Leader Names> | Reporting Level 1 | Monthly Target
//                     (Ops managers first, then team leaders; SR.NO restarting at 1 starts the next group)
//   Accounts Handover (not imported: ledger entries are added on the Accounts page)
const IMPORT_COMPANY_ALIASES = { 
    dv: 'Digital Verse', 
    wok: 'World of Krypto', 
    wk: 'World of Krypto',
    'digital verse': 'Digital Verse',
    'world of krypto': 'World of Krypto',
    'world of crypto': 'World of Krypto'
};
const IMPORT_EMPTY_MARKERS = ['(blank)', '-', 'null', 'undefined'];

const impNorm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const impClean = v => {
    const s = String(v == null ? '' : v).replace(/[\u00A0\u200B\u200E\u200F]/g, ' ').replace(/\s+/g, ' ').trim();
    return IMPORT_EMPTY_MARKERS.includes(s.toLowerCase()) ? '' : s;
};
const impNum = v => {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
    if (!s) return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
};
const impPad = n => String(n).padStart(2, '0');
function impDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v.getTime())) {
        return `${v.getFullYear()}-${impPad(v.getMonth() + 1)}-${impPad(v.getDate())}`;
    }
    const num = (typeof v === 'number') ? v : (/^\d+(\.\d+)?$/.test(String(v).trim()) ? parseFloat(String(v).trim()) : null);
    if (num !== null && num > 20000 && num < 80000) { // Excel serial day number
        const d = new Date(Math.round((Math.floor(num) - 25569) * 86400000));
        return `${d.getUTCFullYear()}-${impPad(d.getUTCMonth() + 1)}-${impPad(d.getUTCDate())}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${impPad(m[2])}-${impPad(m[3])}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) return `${m[3]}-${impPad(m[2])}-${impPad(m[1])}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})/);
    if (m) return `20${m[3]}-${impPad(m[2])}-${impPad(m[1])}`;
    return null;
}
function impValidDate(iso) {
    if (!iso) return false;
    const parts = iso.split('-').map(Number);
    if (parts.length !== 3) return false;
    const [y, m, d] = parts;
    if (!y || !m || !d || y < 2000 || y > 2100) return false;
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const IMPORT_HEADER_ALIASES = {
    date: ['date', 'paymentdate', 'payment_date', 'entrydate', 'txndate'],
    agentname: ['agentname', 'agent_name', 'agent', 'representative', 'name'],
    usdt: ['usdt', 'usdtamount', 'usdt_amount'],
    inramount: ['inramount', 'inr_amount', 'amount', 'inr', 'totalinr'],
    ecode: ['ecode', 'e_code', 'empid', 'emp_id', 'agentcode'],
    empid: ['empid', 'emp_id', 'ecode', 'e_code'],
    tlname: ['tlname', 'tl', 'teamleader', 'teamleadername', 'tl_name', 'team_leader'],
    tl: ['tl', 'tlname', 'teamleader', 'teamleadername', 'tl_name', 'team_leader'],
    opsmanager: ['opsmanager', 'ops_manager', 'ops', 'manager', 'opsmanagername'],
    clientname: ['clientname', 'client_name', 'client', 'customer', 'customername'],
    clientnumber: ['clientnumber', 'client_number', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact'],
    emailid: ['emailid', 'email_id', 'email', 'mail'],
    paymentmode: ['paymentmode', 'payment_mode', 'mode', 'method', 'type'],
    dividedby: ['dividedby', 'divided_by', 'rate', 'fxrate', 'ratio'],
    ratio: ['ratio', 'rate', 'dividedby', 'divided_by'],
    panno: ['panno', 'pan_no', 'pan'],
    aadharno: ['aadharno', 'aadhar_no', 'aadhar', 'adhaar'],
    state: ['state', 'location', 'region'],
    receivedcompany: ['receivedcompany', 'received_company', 'receivedin', 'received_in', 'company'],
    receivedin: ['receivedin', 'received_in', 'receivedcompany', 'received_company', 'company'],
    monthlytarget: ['monthlytarget', 'monthly_target', 'target', 'targetamount'],
    target: ['target', 'monthlytarget', 'monthly_target', 'targetamount'],
    opsmanagername: ['opsmanagername', 'opsmanager', 'ops_manager', 'managername', 'name'],
    teamleadername: ['teamleadername', 'teamleader', 'tlname', 'tl', 'leadername', 'name'],
    reportingto: ['reportingto', 'reporting_to', 'reportinglevel1', 'reporting_level_1', 'parent', 'opsmanager', 'ops_manager'],
    reportinglevel1: ['reportinglevel1', 'reporting_level_1', 'reportingto', 'reporting_to', 'parent', 'opsmanager', 'ops_manager']
};

// Find a sheet by name (ignores case/punctuation), return its rows as arrays
function impSheet(wb, names) {
    const want = names.map(impNorm);
    const name = wb.SheetNames.find(n => want.includes(impNorm(n)));
    if (!name) return null;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
    return { name, rows };
}

function scanStackedSections(allRows) {
    const sections = {};
    let curr = null;
    let currKey = null;

    for (let r = 0; r < allRows.length; r++) {
        const row = allRows[r] || [];
        const s = row.map(c => impNorm(c)).join(' ');

        let sig = null;
        if ((s.includes('date') || s.includes('paymentdate')) && s.includes('usdt') && (s.includes('inr') || s.includes('amount'))) {
            sig = 'payments';
        } else if ((s.includes('agentname') || s.includes('agent')) && (s.includes('empid') || s.includes('ecode'))) {
            sig = 'agents';
        } else if (s.includes('clientname') && (s.includes('clientnumber') || s.includes('phone') || s.includes('panno') || s.includes('aadharno') || s.includes('emailid') || s.includes('email') || s.includes('state'))) {
            sig = 'clients';
        } else if (s.includes('target') || s.includes('monthlytarget')) {
            if (s.includes('teamleader') || s.includes('teamleadername') || s.includes('tlname') || s.includes('tl')) {
                sig = 'tls';
            } else if (s.includes('opsmanagername')) {
                sig = 'ops';
            } else if (s.includes('opsmanager') && s.includes('name')) {
                sig = 'tls';
            } else if (s.includes('opsmanager')) {
                sig = 'ops';
            } else if (s.includes('reportingto') || s.includes('reportinglevel1')) {
                sig = 'ops';
            }
        }

        if (sig) {
            currKey = sig;
            curr = { headerRow: r, cells: row, rows: [] };
            sections[currKey] = curr;
        } else if (curr && row.some(c => String(c).trim() !== '')) {
            curr.rows.push({ cells: row, rowNo: r + 1 });
        }
    }
    return sections;
}

function makeColMap(headerCells, required = [], optional = []) {
    const cells = (headerCells || []).map(impNorm);
    const col = {};
    [...required, ...optional].forEach(canonicalKey => {
        const aliases = IMPORT_HEADER_ALIASES[canonicalKey] || [canonicalKey];
        for (const alias of aliases) {
            const idx = cells.indexOf(impNorm(alias));
            if (idx >= 0) {
                col[canonicalKey] = idx;
                break;
            }
        }
    });
    return col;
}

// Locate the header row (first 35 rows) that contains every required header
function impTable(sheet, required, optional = []) {
    for (let r = 0; r < Math.min(sheet.rows.length, 35); r++) {
        const col = makeColMap(sheet.rows[r], required, optional);
        const allReqFound = required.every(h => col[h] != null);
        if (allReqFound) {
            return {
                headerRow: r,
                col,
                rows: sheet.rows.slice(r + 1).map((cells, i) => ({ cells, rowNo: r + i + 2 }))
            };
        }
    }
    return null;
}

// Canonical name resolver factory
function makeNameResolver(canonicalNames) {
    const list = (canonicalNames || []).map(impClean).filter(Boolean);
    return function(input) {
        if (!input) return '';
        const raw = impClean(input);
        if (!raw) return '';
        const clean = raw.toLowerCase();

        // 1. Exact match
        for (const name of list) {
            if (name.toLowerCase() === clean) return name;
        }

        // 2. Token / word matching
        const inTokens = clean.split(/[\s,.-]+/).filter(Boolean);
        if (!inTokens.length) return raw;

        const inFirst = inTokens[0];
        const inLast = inTokens.length > 1 ? inTokens[inTokens.length - 1] : null;

        let candidate = null;
        for (const name of list) {
            const cTokens = name.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
            const cFirst = cTokens[0];
            const cLast = cTokens.length > 1 ? cTokens[cTokens.length - 1] : null;

            if (!inLast) {
                if (cFirst === inFirst) {
                    if (candidate && candidate !== name) { candidate = null; break; }
                    candidate = name;
                }
            } else {
                if (cFirst === inFirst && cLast === inLast) return name;
                if (cTokens.every(t => inTokens.includes(t))) return name;
                if (inTokens.every(t => cTokens.includes(t))) return name;
            }
        }
        if (candidate) return candidate;

        // 3. Fallback: startsWith / contains
        for (const name of list) {
            const cLow = name.toLowerCase();
            if (cLow.startsWith(clean) || clean.startsWith(cLow)) return name;
        }

        return raw;
    };
}

async function parseMasterWorkbook(wb, report) {
    const out = { payments: [], agents: [], ops: [], tls: [], clients: [] };
    const err = (sheet, rowNo, msg) => report.errors.push(`${sheet} row ${rowNo}: ${msg}`);

    // Check if sections are stacked in a single sheet or CSV.
    // Multi-sheet workbooks (like Master Portal Backups) have dedicated sheets and must NOT trigger stacked mode!
    let stacked = null;
    if (wb.SheetNames.length === 1) {
        const sh = wb.Sheets[wb.SheetNames[0]];
        if (sh) {
            const rows2d = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: true });
            const found = scanStackedSections(rows2d);
            const count = (found.payments ? 1 : 0) + (found.agents ? 1 : 0) + (found.ops ? 1 : 0) + (found.tls ? 1 : 0) + (found.clients ? 1 : 0);
            if (count >= 2) {
                stacked = found;
            }
        }
    } else {
        // Multi-sheet workbook: only activate stacked mode if a specific sheet contains 2 or more distinct stacked sections
        for (const shName of wb.SheetNames) {
            const sh = wb.Sheets[shName];
            if (!sh) continue;
            const rows2d = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: true });
            const found = scanStackedSections(rows2d);
            const count = (found.payments ? 1 : 0) + (found.agents ? 1 : 0) + (found.ops ? 1 : 0) + (found.tls ? 1 : 0) + (found.clients ? 1 : 0);
            if (count >= 2) {
                stacked = found;
                break;
            }
        }
    }

    // ==========================================
    // STEP 1: OPS & TL TARGETS (ESTABLISH CANONICAL HIERARCHY)
    // ==========================================
    if (stacked && (stacked.ops || stacked.tls)) {
        if (stacked.ops) {
            const col = makeColMap(stacked.ops.cells, ['name', 'target'], ['opsmanagername', 'monthlytarget', 'empid', 'ecode', 'reportinglevel1', 'reportingto']);
            for (const r of stacked.ops.rows) {
                const name = impClean(r.cells[col['opsmanagername']] || r.cells[col['name']] || r.cells[3] || r.cells[2] || '');
                if (!name) continue;
                const ecode = impClean(r.cells[col['empid']] || r.cells[col['ecode']] || r.cells[1] || '');
                const parent = impClean(r.cells[col['reportinglevel1']] || r.cells[col['reportingto']] || r.cells[4] || r.cells[3] || '');
                const target = impNum(r.cells[col['monthlytarget']] || r.cells[col['target']] || r.cells[7] || r.cells[4]) || 0;
                out.ops.push({ name, ecode, parent, target });
            }
        }
        if (stacked.tls) {
            const col = makeColMap(stacked.tls.cells, ['name', 'target'], ['teamleadername', 'monthlytarget', 'empid', 'ecode', 'reportinglevel1', 'reportingto', 'opsmanager']);
            for (const r of stacked.tls.rows) {
                const name = impClean(r.cells[col['teamleadername']] || r.cells[col['name']] || r.cells[3] || r.cells[2] || '');
                if (!name) continue;
                const ecode = impClean(r.cells[col['empid']] || r.cells[col['ecode']] || r.cells[1] || '');
                const parent = impClean(r.cells[col['opsmanager']] || r.cells[col['reportinglevel1']] || r.cells[col['reportingto']] || r.cells[4] || '');
                const target = impNum(r.cells[col['monthlytarget']] || r.cells[col['target']] || r.cells[8] || r.cells[4]) || 0;
                out.tls.push({ name, ecode, parent, target });
            }
        }
    } else {
        // A. Check for separate Ops Manager sheet
        const opsSheet = impSheet(wb, ['Ops Managers', 'Ops Manager', 'OPS', 'Operations Managers', 'Operations Manager', 'Sheet3', 'Sheet 3', 'Sheet6', 'Sheet 6']);
        if (opsSheet) {
            for (let r = 0; r < Math.min(opsSheet.rows.length, 15); r++) {
                const cells = (opsSheet.rows[r] || []).map(impNorm);
                if (cells.some(c => c.includes('ops') || c.includes('manager') || c.includes('name')) && cells.some(c => c.includes('target'))) {
                    const col = makeColMap(opsSheet.rows[r], ['opsmanagername', 'monthlytarget'], ['empid', 'ecode', 'reportinglevel1', 'reportingto', 'name', 'target']);
                    for (let i = r + 1; i < opsSheet.rows.length; i++) {
                        const row = opsSheet.rows[i] || [];
                        const name = impClean(row[col['opsmanagername']] || row[col['name']] || row[2] || '');
                        if (!name) continue;
                        const ecode = impClean(row[col['empid']] || row[col['ecode']] || row[1] || '');
                        const parent = impClean(row[col['reportinglevel1']] || row[col['reportingto']] || row[3] || '');
                        const target = impNum(row[col['monthlytarget']] || row[col['target']] || row[4]) || 0;
                        out.ops.push({ name, ecode, parent, target });
                    }
                    break;
                }
            }
        }

        // B. Check for separate Team Leader sheet
        const tlSheet = impSheet(wb, ['Team Leaders', 'Team Leader', 'TL', 'TLs', 'Sheet4', 'Sheet 4', 'Sheet5', 'Sheet 5']);
        if (tlSheet) {
            for (let r = 0; r < Math.min(tlSheet.rows.length, 15); r++) {
                const cells = (tlSheet.rows[r] || []).map(impNorm);
                if (cells.some(c => c.includes('leader') || c.includes('tl') || c.includes('name')) && cells.some(c => c.includes('target'))) {
                    const col = makeColMap(tlSheet.rows[r], ['teamleadername', 'monthlytarget'], ['empid', 'ecode', 'reportinglevel1', 'reportingto', 'name', 'target']);
                    for (let i = r + 1; i < tlSheet.rows.length; i++) {
                        const row = tlSheet.rows[i] || [];
                        const name = impClean(row[col['teamleadername']] || row[col['name']] || row[2] || '');
                        if (!name) continue;
                        const ecode = impClean(row[col['empid']] || row[col['ecode']] || row[1] || '');
                        const parent = impClean(row[col['reportinglevel1']] || row[col['reportingto']] || row[3] || '');
                        const target = impNum(row[col['monthlytarget']] || row[col['target']] || row[4]) || 0;
                        out.tls.push({ name, ecode, parent, target });
                    }
                    break;
                }
            }
        }

        // C. If separate sheets were not found, check combined OPS & TL Targets sheet
        if (out.ops.length === 0 && out.tls.length === 0) {
            const tSheet = impSheet(wb, ['OPS & TL Targets', 'OPS and TL Targets', 'Targets', 'Sheet5', 'Sheet 5']);
            if (tSheet) {
                let hdr = -1, nameCols = [];
                for (let r = 0; r < Math.min(tSheet.rows.length, 30) && hdr < 0; r++) {
                    const cells = (tSheet.rows[r] || []).map(impNorm);
                    cells.forEach((c, i) => {
                        if (/^(opsmanagername|opsmanagernames|teamleadername|teamleadernames)$/.test(c)) nameCols.push({ i, type: c.startsWith('ops') ? 'OPS' : 'TL' });
                    });
                    if (nameCols.length) hdr = r; else nameCols = [];
                }
                if (hdr >= 0) {
                    const isSingleGroup = nameCols.length === 1;
                    const lastSr = nameCols.map(() => 0);
                    const section = nameCols.map(() => 0);
                    for (let r = hdr + 1; r < tSheet.rows.length; r++) {
                        const cells = tSheet.rows[r] || [];
                        nameCols.forEach((nc, k) => {
                            const name = impClean(cells[nc.i]);
                            if (!name) return;
                            const sr = impNum(cells[nc.i - 2]);
                            if (sr != null) { if (sr <= lastSr[k]) section[k]++; lastSr[k] = sr; }
                            const type = isSingleGroup ? (section[k] === 0 ? nc.type : 'TL') : nc.type;
                            const target = impNum(cells[nc.i + 2]) || 0;
                            const ecode = impClean(cells[nc.i - 1]);
                            const parent = impClean(cells[nc.i + 1]);
                            (type === 'OPS' ? out.ops : out.tls).push({ name, ecode, parent, target });
                        });
                    }
                }
            }
        }
    }

    const resolveOps = makeNameResolver(out.ops.map(o => o.name));
    const resolveTl = makeNameResolver(out.tls.map(t => t.name));

    out.tls.forEach(t => {
        if (t.parent) t.parent = resolveOps(t.parent);
    });

    // ==========================================
    // STEP 2: AGENTS DIRECTORY
    // ==========================================
    const agentByCode = {};
    const agentByName = {};

    if (stacked && stacked.agents) {
        const col = makeColMap(stacked.agents.cells, ['empid', 'agentname'], ['opsmanager', 'teamleader', 'tl']);
        for (const row of stacked.agents.rows) {
            const name = impClean(row.cells[col['agentname']] || row.cells[2] || '');
            const ecode = impClean(row.cells[col['empid']] || row.cells[1] || '');
            if (!name && !ecode) continue;
            const rawOps = impClean(row.cells[col['opsmanager']] || row.cells[3] || '');
            const rawTl = impClean(row.cells[col['teamleader']] || row.cells[col['tl']] || row.cells[4] || '');
            const ops_manager = resolveOps(rawOps);
            const tl = resolveTl(rawTl);
            const a = { name, ecode, ops_manager, tl };
            if (ecode) agentByCode[ecode.toLowerCase()] = a;
            if (name) agentByName[name.toLowerCase()] = a;
            out.agents.push(a);
        }
    } else {
        let agentsSheet = impSheet(wb, ['Agents Directory', 'Agents', 'Agent Directory', 'Agent', 'Agents List', 'Sheet2', 'Sheet 2', 'Sheet3', 'Sheet 3']);
        if (!agentsSheet) {
            for (const shName of wb.SheetNames) {
                const candidate = impSheet(wb, [shName]);
                if (candidate && impTable(candidate, ['empid', 'agentname'])) {
                    agentsSheet = candidate;
                    break;
                }
            }
        }
        if (agentsSheet) {
            const t = impTable(agentsSheet, ['empid', 'agentname'], ['opsmanager', 'teamleader', 'tl']);
            if (t) {
                for (const row of t.rows) {
                    const name = impClean(row.cells[t.col['agentname']]);
                    const ecode = impClean(row.cells[t.col['empid']]);
                    if (!name && !ecode) continue;
                    const rawOps = impClean(row.cells[t.col['opsmanager']]);
                    const rawTl = impClean(row.cells[t.col['teamleader']] || row.cells[t.col['tl']]);
                    const ops_manager = resolveOps(rawOps);
                    const tl = resolveTl(rawTl);
                    const a = { name, ecode, ops_manager, tl };
                    if (ecode) agentByCode[ecode.toLowerCase()] = a;
                    if (name) agentByName[name.toLowerCase()] = a;
                    out.agents.push(a);
                }
            }
        }
    }

    // ==========================================
    // STEP 3: CLIENTS DIRECTORY & KYC
    // ==========================================
    const clientMap = new Map();
    const sanitizePan = p => {
        if (!p) return '';
        const s = String(p).trim().toUpperCase();
        if (/mail|consent|received|test|none|null|pending|#|n\/a/i.test(s)) {
            return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(s) ? s : '';
        }
        const cleaned = s.replace(/[^A-Z0-9*]/g, '').slice(0, 10);
        if (cleaned.length < 10) return '';
        return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleaned) || cleaned.includes('*') ? cleaned : '';
    };
    const sanitizeAadhar = a => {
        if (!a) return '';
        const s = String(a).replace(/\D/g, '').slice(0, 12);
        return s.length === 12 ? s : '';
    };
    const addClient = (c, source) => {
        if (!c.client_name && !c.client_number) return;
        c.pan_no = sanitizePan(c.pan_no);
        c.aadhar_no = sanitizeAadhar(c.aadhar_no);
        const key = c.client_number ? 'n:' + c.client_number.toLowerCase().replace(/[^0-9]/g, '') : 'c:' + c.client_name.toLowerCase();
        const prev = clientMap.get(key);
        if (!prev) { clientMap.set(key, { ...c }); return; }
        for (const f of ['client_name', 'email_id', 'pan_no', 'aadhar_no', 'state']) {
            if (!prev[f] && c[f]) prev[f] = c[f];
        }
    };

    if (stacked && stacked.clients) {
        const col = makeColMap(stacked.clients.cells, ['clientname'], ['clientnumber', 'phone', 'mobile', 'emailid', 'panno', 'aadharno', 'state']);
        for (const row of stacked.clients.rows) {
            const name = impClean(row.cells[col['clientname']] || row.cells[0] || '');
            const num = impClean(row.cells[col['clientnumber']] || row.cells[col['phone']] || row.cells[col['mobile']] || row.cells[1] || '');
            if (!name && !num) continue;
            addClient({
                client_name: name,
                client_number: num,
                email_id: impClean(row.cells[col['emailid']] || row.cells[2] || ''),
                pan_no: impClean(row.cells[col['panno']] || row.cells[3] || '').toUpperCase(),
                aadhar_no: impClean(row.cells[col['aadharno']] || row.cells[4] || ''),
                state: impClean(row.cells[col['state']] || row.cells[5] || '')
            }, 'Clients');
        }
    } else {
        const clientSheetCandidates = [
            ['Clients KYC Directory'], ['Clients KYC'], ['Clients Directory & KYC'], ['Clients Directory'], ['Clients'], ['Client KYC Directory'], 
            ['Client Directory'], ['KYC Directory'], ['KYC'], ['Sheet1'], ['Sheet 1'], ['Sheet4'], ['Sheet 4']
        ];
        for (const names of clientSheetCandidates) {
            const sh = impSheet(wb, names);
            if (!sh) continue;
            let t = impTable(sh, ['clientname', 'clientnumber'], ['emailid', 'panno', 'aadharno', 'state']);
            if (!t) t = impTable(sh, ['clientname'], ['clientnumber', 'phone', 'mobile', 'emailid', 'panno', 'aadharno', 'state']);
            if (!t) continue;
            for (const row of t.rows) {
                const name = impClean(row.cells[t.col['clientname']]);
                const num = impClean(row.cells[t.col['clientnumber']] || row.cells[t.col['phone']] || row.cells[t.col['mobile']]);
                if (!name && !num) continue;
                addClient({
                    client_name: name,
                    client_number: num,
                    email_id: impClean(row.cells[t.col['emailid']]),
                    pan_no: impClean(row.cells[t.col['panno']]).toUpperCase(),
                    aadhar_no: impClean(row.cells[t.col['aadharno']]),
                    state: impClean(row.cells[t.col['state']])
                }, sh.name);
            }
        }
    }

    // ==========================================
    // STEP 4: PAYMENTS
    // ==========================================
    let payRows = [];
    let payCol = {};
    let paySheetName = 'Payment Sheet';

    if (stacked && stacked.payments) {
        payRows = stacked.payments.rows;
        payCol = makeColMap(stacked.payments.cells, ['date', 'agentname', 'usdt', 'inramount'],
            ['ecode', 'tlname', 'tl', 'opsmanager', 'clientname', 'clientnumber', 'emailid', 'paymentmode', 'ratio', 'panno', 'aadharno', 'state', 'receivedcompany', 'receivedin']);
        paySheetName = 'Payments';
    } else {
        let pSheet = impSheet(wb, ['Payment Import', 'Payment Sheet', 'Payments Import', 'Payments (Live DB)', 'Payments', 'Payment', 'Source Data (Corrected)', 'Source Data', 'Sheet1', 'Sheet 1', 'Sheet2', 'Sheet 2']);
        if (!pSheet) {
            for (const shName of wb.SheetNames) {
                const candidate = impSheet(wb, [shName]);
                if (candidate && impTable(candidate, ['date', 'agentname', 'usdt', 'inramount'])) {
                    pSheet = candidate;
                    break;
                }
            }
        }
        if (!pSheet) throw new Error('Could not find Payment data in workbook. Use Master Portal Backup or CSV format.');
        paySheetName = pSheet.name;
        const pt = impTable(pSheet, ['date', 'agentname', 'usdt', 'inramount'],
            ['ecode', 'tlname', 'tl', 'opsmanager', 'clientname', 'clientnumber', 'emailid', 'paymentmode', 'ratio', 'panno', 'aadharno', 'state', 'receivedcompany', 'receivedin']);
        if (!pt) throw new Error(`Sheet "${pSheet.name}" must have headers: Date, Agent Name, USDT, INR Amount.`);
        payRows = pt.rows;
        payCol = pt.col;
    }

    for (const row of payRows) {
        const g = k => (payCol[k] == null ? '' : row.cells[payCol[k]]);
        const raw = ['date', 'agentname', 'usdt', 'inramount', 'clientname'].map(k => g(k));
        if (raw.every(v => v === '' || v == null)) continue;

        const date = impDate(g('date'));
        if (!impValidDate(date)) { err(paySheetName, row.rowNo, `invalid Date "${g('date')}"`); continue; }
        const usdt = impNum(g('usdt')), inr = impNum(g('inramount'));
        if (usdt == null || usdt <= 0) { err(paySheetName, row.rowNo, 'USDT must be a positive number'); continue; }
        if (inr == null || inr <= 0) { err(paySheetName, row.rowNo, 'INR Amount must be a positive number'); continue; }

        let mode = impClean(g('paymentmode')) || 'P2P';
        if (mode.toLowerCase().includes('vendor')) mode = 'Vendor';
        else if (mode.toUpperCase().includes('D') && mode.toUpperCase().includes('P2P')) mode = 'D P2P';
        else if (mode.toUpperCase() === 'P2P') mode = 'P2P';

        const rc = impClean(g('receivedcompany') || g('receivedin'));
        let company = rc;
        if (rc.toLowerCase().includes('world') || rc.toLowerCase().includes('wk') || rc.toLowerCase().includes('wok') || rc.toLowerCase().includes('krypto') || rc.toLowerCase().includes('crypto')) {
            company = 'World of Krypto';
        } else if (rc.toLowerCase().includes('digital') || rc.toLowerCase().includes('dv') || !rc) {
            company = 'Digital Verse';
        }

        let agent = impClean(g('agentname'));
        let ops = resolveOps(g('opsmanager'));
        let tl = resolveTl(g('tlname') || g('tl'));
        let ecode = impClean(g('ecode'));

        if (!ecode && !agent) { err(paySheetName, row.rowNo, 'E-Code or Agent Name is required'); continue; }

        const dir = (ecode ? agentByCode[ecode.toLowerCase()] : null) || (agent ? agentByName[agent.toLowerCase()] : null);
        if (dir) {
            if ((dir.name && dir.name !== agent) || (dir.ecode && dir.ecode !== ecode) || (dir.ops_manager && dir.ops_manager !== ops) || (dir.tl && dir.tl !== tl)) {
                report.normalised++;
            }
            if (dir.name) agent = dir.name;
            if (dir.ecode) ecode = dir.ecode;
            if (dir.ops_manager) ops = dir.ops_manager;
            if (dir.tl) tl = dir.tl;
        }

        const rawNum = impClean(g('clientnumber'));
        let cleanNum = rawNum.replace(/\D/g, '');
        if (cleanNum.length === 12 && cleanNum.startsWith('91')) cleanNum = cleanNum.slice(2);
        else if (cleanNum.length === 11 && cleanNum.startsWith('0')) cleanNum = cleanNum.slice(1);
        cleanNum = cleanNum.slice(0, 10);

        const cleanPan = impClean(g('panno')).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
        const cleanAadhar = impClean(g('aadharno')).replace(/\D/g, '').slice(0, 12);
        const cleanEmail = impClean(g('emailid')).toLowerCase().trim();

        const p = {
            payment_date: date,
            ecode: ecode || (dir ? dir.ecode : ''),
            agent_name: agent || (dir ? dir.name : (ecode || 'Unassigned Agent')),
            tl: tl || '',
            ops_manager: ops || '',
            client_name: impClean(g('clientname')),
            client_number: cleanNum,
            email_id: cleanEmail,
            payment_mode: mode,
            usdt,
            inr_amount: inr,
            divided_by: Math.round((inr / usdt) * 100) / 100,
            ratio: impClean(g('ratio')),
            pan_no: cleanPan,
            aadhar_no: cleanAadhar,
            state: impClean(g('state')),
            received_in: company
        };
        out.payments.push(p);

        if (p.client_name || p.client_number) {
            addClient({
                client_name: p.client_name,
                client_number: p.client_number,
                email_id: p.email_id,
                pan_no: p.pan_no,
                aadhar_no: p.aadhar_no,
                state: p.state
            }, paySheetName);
        }
    }

    out.clients = [...clientMap.values()];
    return out;
}

function downloadImportAuditReport(sourceLabel, report, failures, ok, totalCounts) {
    const lines = [
        `Import Audit Report - ${sourceLabel}`,
        `Generated: ${new Date().toLocaleString()}`,
        `----------------------------------------`,
        `Summary:`,
        `- Payments: ${ok.payments} saved, ${totalCounts.duplicates || 0} duplicates skipped, ${totalCounts.paymentsTotal} total in file`,
        `- Ops Managers: ${ok.ops} saved`,
        `- Team Leaders: ${ok.tls} saved`,
        `- Agents: ${ok.agents} saved`,
        `- Clients: ${ok.clients} saved`,
        `- Normalised Rows: ${report.normalised || 0}`,
        ``
    ];
    if (failures.length > 0) {
        lines.push(`Failures & Errors (${failures.length}):`);
        failures.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
        lines.push(``);
    }
    if (report.errors && report.errors.length > 0) {
        lines.push(`Workbook Skipped Rows (${report.errors.length}):`);
        report.errors.forEach((e, i) => lines.push(`  ${i + 1}. ${e}`));
        lines.push(``);
    }
    if (report.warnings && report.warnings.length > 0) {
        lines.push(`Workbook Warnings (${report.warnings.length}):`);
        report.warnings.forEach((w, i) => lines.push(`  ${i + 1}. ${w}`));
        lines.push(``);
    }

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_audit_report_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const impPaymentKey = p => [
    String(p.payment_date || '').slice(0, 10),
    impClean(p.ecode || p.e_code || p.agent_name).toLowerCase(),
    impClean(p.client_number || p.client_name).toLowerCase(),
    Number(p.usdt || 0).toFixed(2),
    Number(p.inr_amount || 0).toFixed(2),
    impClean(p.payment_mode || 'P2P').toUpperCase(),
    impClean(p.received_in || p.received_company || '').toLowerCase()
].join('|');

async function executeMasterImport(wb, sourceLabel) {
    const report = { errors: [], warnings: [], normalised: 0 };
    const data = await parseMasterWorkbook(wb, report);

    // Skip payments that are already in the database
    const existing = await api('dashboard', {}).catch(() => ({ rawPayments: [] }));
    const have = new Set((existing.rawPayments || []).map(impPaymentKey));
    const fresh = data.payments.filter(p => !have.has(impPaymentKey(p)));
    const duplicates = data.payments.length - fresh.length;

    // Fill blank client fields from existing DB records
    const exClients = (await api('clients', {}).catch(() => ({ rows: [] }))).rows || [];
    for (const c of data.clients) {
        const old = exClients.find(x => (c.client_number && x.client_number === c.client_number) || (!c.client_number && x.client_name && x.client_name.toLowerCase() === c.client_name.toLowerCase()));
        if (old) {
            for (const f of ['client_name', 'email_id', 'pan_no', 'aadhar_no', 'state']) {
                if (!c[f] && old[f] && !String(old[f]).includes('*')) {
                    c[f] = old[f];
                }
            }
        }
        c.pan_no = sanitizePan(c.pan_no);
        c.aadhar_no = sanitizeAadhar(c.aadhar_no);
    }

    const lines = [
        `Ready to import from "${sourceLabel}":`,
        `• ${fresh.length} new payments (${duplicates} already in database, skipped)`,
        `• ${data.ops.length} ops managers and ${data.tls.length} team leaders with targets`,
        `• ${data.agents.length} agents`,
        `• ${data.clients.length} clients`,
    ];
    if (report.normalised) lines.push(`• ${report.normalised} payment rows had Ops/TL/Agent names aligned to directory`);
    if (report.errors.length) lines.push('', `${report.errors.length} rows will be SKIPPED:`, ...report.errors.slice(0, 10).map(x => '  - ' + x));
    if (report.warnings.length) lines.push('', `${report.warnings.length} warnings:`, ...report.warnings.slice(0, 5).map(x => '  - ' + x));
    lines.push('', 'Save these to the database?');

    if (!confirm(lines.join('\n'))) return false;

    let ok = { ops: 0, tls: 0, agents: 0, clients: 0, payments: 0 };
    const failures = [];

    if (importBtn) importBtn.textContent = 'Saving master data to database...';

    // 1. Primary: Fast, transactional single-connection bulk import
    let bulkSuccess = false;
    try {
        const bulkRes = await api('bulk_import', {
            ops: data.ops,
            tls: data.tls,
            agents: data.agents,
            clients: data.clients,
            payments: fresh
        });

        if (bulkRes && bulkRes.saved) {
            ok = bulkRes.saved;
            bulkSuccess = true;
        }
        if (bulkRes && bulkRes.errors && bulkRes.errors.length) {
            failures.push(...bulkRes.errors);
        }
    } catch (bulkErr) {
        console.warn('Bulk import failed, attempting sequential fallback with safe delay:', bulkErr);
        bulkSuccess = false;
    }

    // 2. Fallback: Sequential execution with 50ms delay to prevent MySQL connection exhaustion
    if (!bulkSuccess) {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const run = async (label, key, action, payload) => {
            try { 
                await api(action, payload); 
                ok[key]++; 
            } catch (x) { 
                failures.push(`${label}: ${x.message}`); 
            }
            await sleep(50);
        };

        if (importBtn) importBtn.textContent = 'Saving targets & agents...';
        for (const o of data.ops) await run(`Ops ${o.name}`, 'ops', 'upsert_ops_node', { name: o.name, ecode: o.ecode, reporting_to: o.parent, target: o.target });
        for (const t of data.tls) await run(`TL ${t.name}`, 'tls', 'upsert_tl_node', { name: t.name, ecode: t.ecode, ops_manager: t.parent, target: t.target });
        for (const a of data.agents) await run(`Agent ${a.name}`, 'agents', 'upsert_agent_node', a);

        if (importBtn) importBtn.textContent = 'Saving clients...';
        for (const c of data.clients) await run(`Client ${c.client_name || c.client_number}`, 'clients', 'upsert_client_node', c);

        // Check which payments might have already committed before blind retry
        const recheck = await api('dashboard', {}).catch(() => ({ rawPayments: [] }));
        const savedKeys = new Set((recheck.rawPayments || []).map(impPaymentKey));
        const stillNeed = fresh.filter(p => !savedKeys.has(impPaymentKey(p)));
        const alreadySaved = fresh.length - stillNeed.length;
        if (alreadySaved > 0) {
            ok.payments += alreadySaved;
        }

        let n = 0;
        for (const p of stillNeed) {
            if (importBtn) importBtn.textContent = `Saving payments ${++n}/${stillNeed.length}...`;
            await run(`Payment ${p.payment_date} ${p.agent_name}`, 'payments', 'create_payment', p);
        }
    }

    // Refresh authoritative caches in localStorage
    try {
        const [freshDash, freshAgents, freshClients] = await Promise.all([
            api('dashboard', {}).catch(() => ({ rawPayments: [] })),
            api('agents', {}).catch(() => ({ agents: [], ops_managers: [], team_leaders: [] })),
            api('clients', {}).catch(() => ({ rows: [] }))
        ]);
        localStorage.setItem('pp_payments', JSON.stringify(freshDash.rawPayments || []));
        localStorage.setItem('pp_agents', JSON.stringify(freshAgents.agents || []));
        localStorage.setItem('pp_mappings', JSON.stringify(freshAgents.agents || []));
        localStorage.setItem('pp_ops_managers', JSON.stringify(freshAgents.ops_managers || []));
        localStorage.setItem('pp_team_leaders', JSON.stringify(freshAgents.team_leaders || []));
        localStorage.setItem('pp_clients', JSON.stringify(freshClients.rows || []));

        // Post-import verification
        console.log(`Database post-import verification: ${(freshDash.rawPayments || []).length} total payments retrieved.`);
    } catch(e) {}

    let msg = `Import finished.\n\n• ${ok.payments}/${fresh.length} payments saved\n• ${ok.ops} ops managers, ${ok.tls} team leaders\n• ${ok.agents} agents\n• ${ok.clients} clients`;
    if (failures.length) { msg += `\n\n${failures.length} items FAILED:\n` + failures.slice(0, 8).map(x => '  - ' + x).join('\n'); }
    alert(msg);

    if (failures.length > 0 || report.errors.length > 0) {
        if (confirm('Would you like to download a detailed audit and error report file?')) {
            downloadImportAuditReport(sourceLabel, report, failures, ok, { duplicates, paymentsTotal: data.payments.length });
        }
    }

    load();
    return true;
}

if (importBtn) {
    importBtn.onclick = function() {
        const file = importFile.files[0];
        if (!file) return alert('Please select an Excel (.xlsx, .xls) or CSV (.csv) file first.');

        importBtn.textContent = 'Reading file...';
        importBtn.disabled = true;

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                await executeMasterImport(wb, file.name);
                importFile.value = '';
            } catch (error) {
                alert('Import stopped, nothing was saved:\n\n' + error.message);
                if (importFile) importFile.value = '';
            } finally {
                importBtn.textContent = 'Import Master File';
                importBtn.disabled = false;
            }
        };
        reader.readAsArrayBuffer(file);
    };
}

const importPasteBtn = document.getElementById('importPasteBtn');
if (importPasteBtn) {
    importPasteBtn.onclick = async function() {
        const pasteBox = document.getElementById('pasteDataInput');
        const text = (pasteBox ? pasteBox.value : '').trim();
        if (!text) return alert('Please paste your CSV or multi-table text into the box first.');

        importPasteBtn.textContent = 'Processing text...';
        importPasteBtn.disabled = true;

        try {
            const wb = XLSX.read(text, { type: 'string' });
            const success = await executeMasterImport(wb, 'Pasted Data');
            if (success && pasteBox) pasteBox.value = '';
        } catch (error) {
            alert('Import stopped:\n\n' + error.message);
        } finally {
            importPasteBtn.textContent = 'Import Pasted Text';
            importPasteBtn.disabled = false;
        }
    };
}

// ==========================================
// MASTER BACKUP GENERATOR (ALL MODULES IN 1 EXCEL)
// ==========================================
async function generateAndDownloadBackup(prefix = 'Hostinger_Master_DB_Backup') {
    const [dash, agRes, clRes, accRes] = await Promise.all([
        api('dashboard', {}).catch(() => ({ rawPayments: [] })),
        api('agents', {}).catch(() => ({ agents: [], ops_managers: [], team_leaders: [] })),
        api('clients', {}).catch(() => ({ rows: [] })),
        api('accounts', {}).catch(() => ({ rows: [] }))
    ]);

    const wb = XLSX.utils.book_new();

    const payments = dash.rawPayments || [];
    const agents = agRes.agents || [];
    const opsManagers = agRes.ops_managers || [];
    const teamLeaders = agRes.team_leaders || [];
    const clients = clRes.rows || [];
    const accounts = accRes.rows || [];

    // Sheet 1: Payments
    const wsPayments = XLSX.utils.json_to_sheet(payments);
    XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments (Live DB)');

    // Sheet 2: Agents
    const wsAgents = XLSX.utils.json_to_sheet(agents);
    XLSX.utils.book_append_sheet(wb, wsAgents, 'Agents Directory');

    // Sheet 3: Ops Managers
    const wsOps = XLSX.utils.json_to_sheet(opsManagers);
    XLSX.utils.book_append_sheet(wb, wsOps, 'Ops Managers');

    // Sheet 4: Team Leaders
    const wsTls = XLSX.utils.json_to_sheet(teamLeaders);
    XLSX.utils.book_append_sheet(wb, wsTls, 'Team Leaders');

    // Sheet 5: Clients KYC
    const wsClients = XLSX.utils.json_to_sheet(clients);
    XLSX.utils.book_append_sheet(wb, wsClients, 'Clients KYC Directory');

    // Sheet 6: Accounts Ledger
    const wsAccounts = XLSX.utils.json_to_sheet(accounts);
    XLSX.utils.book_append_sheet(wb, wsAccounts, 'Accounts Handover');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${prefix}_${timestamp}.xlsx`;
    XLSX.writeFile(wb, filename);
    return filename;
}

if (exportBackupBtn) {
    exportBackupBtn.onclick = async function() {
        exportBackupBtn.textContent = 'Generating Database Backup...';
        exportBackupBtn.disabled = true;

        try {
            await generateAndDownloadBackup('Hostinger_Master_DB_Backup');
        } catch(err) {
            alert('Backup Error: ' + err.message);
        } finally {
            exportBackupBtn.textContent = 'Export Complete System Backup (.xlsx)';
            exportBackupBtn.disabled = false;
        }
    };
}

// Complete System Wipe with Pre-Wipe Backup Download & Confirmation Dialog
if (clearAllBtn) {
    clearAllBtn.onclick = async function() {
        const confirmed = confirm(
            "[WARNING] ATTENTION: COMPLETE SYSTEM & DATABASE WIPE\n\n" +
            "This action will permanently wipe ALL data across the entire platform, including:\n" +
            "• All Payment Transactions & History\n" +
            "• All Accounts Handover Ledger entries\n" +
            "• All Registered Clients & KYC Records\n" +
            "• All Agents, Team Leaders & Ops Managers\n" +
            "• All Non-Admin Users\n" +
            "• All offline browser storage backups & caches\n\n" +
            "A full database backup spreadsheet (.xlsx) will be AUTOMATICALLY generated and downloaded to your computer BEFORE erasing anything.\n\n" +
            "Are you sure you want to proceed?"
        );

        if (!confirmed) return;

        const typed = prompt('Type DELETE ALL to confirm the wipe:');
        if (typed !== 'DELETE ALL') { alert('Wipe cancelled: confirmation text did not match.'); return; }
        const adminPassword = prompt('Enter your administrator password:');
        if (!adminPassword) { alert('Wipe cancelled: password required.'); return; }

        clearAllBtn.disabled = true;
        const originalText = clearAllBtn.textContent;
        clearAllBtn.textContent = 'Downloading Safety Backup...';

        try {
            // 1. Generate & drop the safety backup file before erasing anything
            const backupFilename = await generateAndDownloadBackup('SAFETY_BACKUP_BEFORE_WIPE');

            // Brief pause to allow the browser download handshake to initiate
            await new Promise(r => setTimeout(r, 600));

            clearAllBtn.textContent = 'Wiping Database & Caches...';

            // 2. Erase all records from MySQL database
            const res = await api('wipe_database_records', { scope: 'all', confirm: 'DELETE ALL', password: adminPassword });
            if (!res.success) {
                throw new Error(res.message || 'Server failed to wipe database records');
            }

            // 3. Purge all browser storage caches & offline backup copies
            const keysToPurge = [
                'pp_payments',
                'pp_accounts',
                'pp_clients',
                'pp_agents',
                'pp_mappings',
                'pp_ops_managers',
                'pp_team_leaders',
                'pp_targets'
            ];
            keysToPurge.forEach(k => {
                localStorage.removeItem(k);
                sessionStorage.removeItem(k);
            });

            const serverMsg = res.server_backup_file 
                ? `\n2. Server-side backup snapshot archived on Hostinger:\n   backups/${res.server_backup_file}\n`
                : '';

            alert(
                "[SUCCESS] ALL SYSTEM DATA WIPED SUCCESSFULLY!\n\n" +
                "1. Safety backup spreadsheet (.xlsx) was downloaded to your computer:\n   " + backupFilename + "\n" +
                serverMsg + "\n" +
                "3. Live MySQL database tables and browser storage caches were wiped clean.\n" +
                "4. Your active Admin session remains secure and logged in."
            );

            try {
                await load();
            } catch(refreshErr) {
                console.warn('Dashboard UI refresh warning:', refreshErr);
            }
        } catch(err) {
            alert('Wipe Operation Error: ' + err.message);
        } finally {
            clearAllBtn.disabled = false;
            clearAllBtn.textContent = originalText;
        }
    };
}

load().catch(e => console.error(e));