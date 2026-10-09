const searchFilter = document.getElementById('searchFilter');
const fromInput = document.getElementById('from');
const toInput = document.getElementById('to');
const modeFilter = document.getElementById('modeFilter');
const companyFilter = document.getElementById('companyFilter');
const filterBtn = document.getElementById('filterBtn');
const clearBtn = document.getElementById('clearBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const importReportsFile = document.getElementById('importReportsFile');
const pageSizeSelect = document.getElementById('pageSize');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageNumberSpan = document.getElementById('pageNumber');
const pageInfoDiv = document.getElementById('pageInfo');
const tableBody = document.getElementById('reportTableBody');

let allRows = [];
let filteredRows = [];
let currentPage = 1;

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsdt = (num) => Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getAgentEcode(agentName) {
    if (!agentName) return '-';
    const agents = JSON.parse(localStorage.getItem('pp_agents') || localStorage.getItem('pp_mappings') || '[]');
    const found = agents.find(a => (a.agent_name || '').toLowerCase() === agentName.toLowerCase());
    return found && found.ecode ? found.ecode : '-';
}

function getAgentOps(agentName) {
    if (!agentName) return '-';
    const agents = JSON.parse(localStorage.getItem('pp_agents') || localStorage.getItem('pp_mappings') || '[]');
    const found = agents.find(a => (a.agent_name || '').toLowerCase() === agentName.toLowerCase());
    return found && found.ops_manager ? found.ops_manager : '-';
}

async function loadData() {
    const res = await api('reports', {});
    allRows = res.rows || [];
    applyFilters();
}

function applyFilters() {
    const q = (searchFilter.value || '').toLowerCase().trim();
    const from = fromInput.value;
    const to = toInput.value;
    const mode = modeFilter.value;
    const comp = companyFilter.value;

    filteredRows = allRows.filter(r => {
        if (from && r.payment_date < from) return false;
        if (to && r.payment_date > to) return false;
        if (mode && (r.payment_mode || '') !== mode) return false;
        if (comp && !(r.received_in || '').toLowerCase().includes(comp.toLowerCase())) return false;

        if (q) {
            const ecode = r.ecode || getAgentEcode(r.agent_name);
            const ops = r.ops_manager || getAgentOps(r.agent_name);
            const searchHaystack = [
                r.client_name,
                r.client_number,
                r.agent_name,
                ecode,
                r.tl,
                ops,
                r.pan_no,
                r.aadhar_no,
                r.state,
                r.email_id,
                r.payment_mode,
                r.received_in,
                r.created_by_name,
                r.created_by_email
            ].map(x => (x || '').toLowerCase()).join(' ');

            if (!searchHaystack.includes(q)) return false;
        }

        return true;
    });

    currentPage = 1;
    renderTable();
}

function renderTable() {
    const total = filteredRows.length;
    const pageSizeVal = pageSizeSelect.value;
    const pageSize = pageSizeVal === 'all' ? total : parseInt(pageSizeVal, 10);
    const totalPages = Math.max(1, Math.ceil(total / (pageSize || 1)));

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = pageSizeVal === 'all' ? total : Math.min(startIdx + pageSize, total);
    const pageRows = filteredRows.slice(startIdx, endIdx);

    pageInfoDiv.textContent = total === 0 ? 'Showing 0 records' : `Showing ${startIdx + 1} to ${endIdx} of ${total} records`;
    pageNumberSpan.textContent = `${currentPage} / ${totalPages}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;

    if (pageRows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="19" class="text-muted" style="text-align:center; padding:30px;">No payments found matching filter criteria.</td></tr>';
        return;
    }

    tableBody.innerHTML = pageRows.map((r, i) => {
        const ecode = r.ecode || getAgentEcode(r.agent_name);
        const ops = r.ops_manager || getAgentOps(r.agent_name);
        const enteredBy = r.created_by_name ? `<strong>${r.created_by_name}</strong>` : '<span style="color:var(--text-dim);">-</span>';
        const entryTime = r.created_at ? `<span style="font-size:11px; color:var(--text-muted);">${r.created_at}</span>` : '-';

        return `<tr>
            <td style="color:var(--text-muted);">${startIdx + i + 1}</td>
            <td>${r.payment_date || ''}</td>
            <td style="color:var(--text-muted); font-family:var(--font-mono); font-size:12px;">${ecode}</td>
            <td><strong>${r.agent_name || ''}</strong></td>
            <td>${r.tl || '-'}</td>
            <td>${ops}</td>
            <td>${r.client_name || '-'}</td>
            <td>${r.client_number || '-'}</td>
            <td>${r.email_id || '-'}</td>
            <td><span style="font-weight:600;">${r.payment_mode || 'P2P'}</span></td>
            <td>${fmtUsdt(r.usdt)}</td>
            <td style="font-weight:700; color:var(--accent);">${fmtInr(r.inr_amount)}</td>
            <td>${r.ratio || '-'}</td>
            <td style="font-family:var(--font-mono); font-size:11.5px;">${r.pan_no || '-'}</td>
            <td style="font-family:var(--font-mono); font-size:11.5px;">${r.aadhar_no || '-'}</td>
            <td>${r.state || '-'}</td>
            <td>${r.received_in || '-'}</td>
            <td>${enteredBy}</td>
            <td>${entryTime}</td>
        </tr>`;
    }).join('');
}

// Event Listeners
filterBtn.onclick = applyFilters;
searchFilter.oninput = applyFilters;
modeFilter.onchange = applyFilters;
companyFilter.onchange = applyFilters;
fromInput.onchange = applyFilters;
toInput.onchange = applyFilters;

clearBtn.onclick = () => {
    searchFilter.value = '';
    fromInput.value = '';
    toInput.value = '';
    modeFilter.value = '';
    companyFilter.value = '';
    applyFilters();
};

pageSizeSelect.onchange = () => {
    currentPage = 1;
    renderTable();
};

prevPageBtn.onclick = () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
};

nextPageBtn.onclick = () => {
    currentPage++;
    renderTable();
};

// Export Excel (.xlsx)
if (exportExcelBtn) {
    exportExcelBtn.onclick = function() {
        if (!filteredRows.length) return alert('No records to export.');

        const exportData = filteredRows.map((r, idx) => ({
            'SR No': idx + 1,
            'Date': r.payment_date || '',
            'E-Code': r.ecode || getAgentEcode(r.agent_name),
            'Agent Name': r.agent_name || '',
            'TL Name': r.tl || '',
            'Ops Manager': r.ops_manager || getAgentOps(r.agent_name),
            'Client Name': r.client_name || '',
            'Client Number': r.client_number || '',
            'Email ID': r.email_id || '',
            'Payment Mode': r.payment_mode || 'P2P',
            'USDT': parseFloat(r.usdt || 0),
            'INR Amount': parseFloat(r.inr_amount || 0),
            'Ratio': r.ratio || '',
            'PAN NO': r.pan_no || '',
            'AADHAR NO': r.aadhar_no || '',
            'STATE': r.state || '',
            'Received Company': r.received_in || '',
            'Entered By': r.created_by_name || '',
            'Entry Timestamp': r.created_at || ''
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Payment Sheet');
        XLSX.writeFile(wb, `Payment_Sheet_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
}

// Import Payments Excel
if (importReportsFile) {
    importReportsFile.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });

                let extractedRows = [];

                // Sort sheet names: prioritize sheets with payment, txn, oct, data, raw in name
                const sheetNames = workbook.SheetNames.slice().sort((a, b) => {
                    const score = (name) => {
                        const n = name.toLowerCase();
                        if (n.includes('payment') || n.includes('raw') || n.includes('txn') || n.includes('data')) return 3;
                        if (n.includes('oct') || n.includes('sep') || n.includes('sheet') || n.includes('sales')) return 2;
                        return 1;
                    };
                    return score(b) - score(a);
                });

                for (const sName of sheetNames) {
                    const sheet = workbook.Sheets[sName];
                    if (!sheet || !sheet['!ref']) continue;

                    const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                    if (!rows2d || rows2d.length === 0) continue;

                    // Scan first 15 rows to find the actual header row
                    let headerRowIdx = 0;
                    let bestHeaderScore = 0;

                    for (let r = 0; r < Math.min(rows2d.length, 15); r++) {
                        const rowCells = rows2d[r].map(c => String(c).toLowerCase().trim());
                        let score = 0;
                        rowCells.forEach(cell => {
                            if (cell.includes('date')) score += 2;
                            if (cell.includes('agent') || cell.includes('executive') || cell.includes('caller')) score += 2;
                            if (cell.includes('usdt')) score += 3;
                            if (cell.includes('inr') || cell.includes('amount')) score += 2;
                            if (cell.includes('client') || cell.includes('customer') || cell.includes('party')) score += 2;
                            if (cell.includes('ecode') || cell.includes('e-code') || cell.includes('code')) score += 2;
                            if (cell.includes('tl') || cell.includes('leader')) score += 2;
                            if (cell.includes('ops') || cell.includes('manager')) score += 2;
                            if (cell.includes('mode')) score += 1;
                        });

                        if (score > bestHeaderScore && score >= 2) {
                            bestHeaderScore = score;
                            headerRowIdx = r;
                        }
                    }

                    const jsonRows = XLSX.utils.sheet_to_json(sheet, { range: headerRowIdx, defval: '' });
                    if (jsonRows && jsonRows.length > 0) {
                        // Check if these rows look like payment transactions
                        let validInSheet = 0;
                        jsonRows.forEach(row => {
                            let hasSignal = false;
                            for (const k in row) {
                                const lk = k.toLowerCase();
                                const lv = String(row[k]).trim();
                                if ((lk.includes('agent') || lk.includes('client') || lk.includes('usdt') || lk.includes('inr') || lk.includes('amount')) && lv) {
                                    hasSignal = true;
                                }
                            }
                            if (hasSignal) validInSheet++;
                        });

                        if (validInSheet > 0) {
                            extractedRows = jsonRows;
                            break; // Successfully found the primary payment sheet!
                        }
                    }
                }

                if (extractedRows.length === 0) {
                    throw new Error('No readable payment transaction rows found in the selected Excel file.');
                }

                let payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
                let agents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
                let clients = JSON.parse(localStorage.getItem('pp_clients') || '[]');

                let count = 0;
                const nextId = payments.length ? Math.max(...payments.map(p => p.id || 0)) + 1 : 1;

                for (const row of extractedRows) {
                    const dbData = {
                        payment_date: '',
                        ecode: '',
                        agent_name: '',
                        tl: '',
                        ops_manager: '',
                        client_name: '',
                        client_number: '',
                        email_id: '',
                        payment_mode: 'P2P',
                        usdt: 0,
                        divided_by: 88,
                        inr_amount: 0,
                        ratio: '',
                        pan_no: '',
                        aadhar_no: '',
                        state: '',
                        received_in: 'Digital Verse',
                        remarks: ''
                    };

                    for (const key of Object.keys(row)) {
                        const k = key.trim().toLowerCase();
                        const val = String(row[key] || '').trim();

                        if (k === 'date' || k.includes('payment date') || k.includes('txn date') || k.includes('tx date') || k.includes('value date') || k.includes('entry date')) dbData.payment_date = row[key];
                        else if (k.includes('emp code') || k.includes('e-code') || k === 'ecode' || k === 'code' || k.includes('emp id') || k === 'id') dbData.ecode = val;
                        else if (k.includes('agent name') || k === 'agent' || k.includes('executive') || k.includes('caller') || k.includes('emp name') || k === 'name') dbData.agent_name = val;
                        else if (k.includes('tl') || k.includes('team leader') || k.includes('lead') || k.includes('leader')) dbData.tl = val;
                        else if (k.includes('ops manager') || k.includes('ops') || k.includes('manager')) dbData.ops_manager = val;
                        else if (k.includes('client name') || k === 'client' || k.includes('customer') || k.includes('party')) dbData.client_name = val;
                        else if (k.includes('client number') || k.includes('client number') || k.includes('phone') || k.includes('mobile') || k.includes('contact') || k === 'number') dbData.client_number = val;
                        else if (k.includes('email') || k.includes('mail')) dbData.email_id = val;
                        else if (k.includes('mode') || k.includes('type')) dbData.payment_mode = val;
                        else if (k.includes('usdt')) dbData.usdt = row[key];
                        else if (k.includes('divided') || k.includes('rate') || k.includes('div')) dbData.divided_by = row[key];
                        else if (k.includes('inr amount') || k === 'inr' || k.includes('total inr') || k.includes('inr amt') || k === 'amount' || k.includes('amount') || k.includes('sales')) dbData.inr_amount = row[key];
                        else if (k.includes('ratio') || k.includes('split')) dbData.ratio = val;
                        else if (k.includes('pan')) dbData.pan_no = val;
                        else if (k.includes('aadhar') || k.includes('aadhaar')) dbData.aadhar_no = val;
                        else if (k.includes('state') || k.includes('city') || k.includes('location')) dbData.state = val;
                        else if (k.includes('received company') || k.includes('received in') || k.includes('company') || k.includes('entity')) dbData.received_in = val;
                        else if (k.includes('remark') || k.includes('ref') || k.includes('comment') || k.includes('note')) dbData.remarks = val;
                    }

                    // Date Normalization
                    if (dbData.payment_date) {
                        if (dbData.payment_date instanceof Date) {
                            dbData.payment_date = dbData.payment_date.toISOString().split('T')[0];
                        } else if (typeof dbData.payment_date === 'number') {
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
                                    } else if (!isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                                        let yr = parts[0].length === 4 ? parts[0] : (parts[2].length === 2 ? '20' + parts[2] : parts[2]);
                                        let mo = parts[0].length === 4 ? parts[1] : parts[1];
                                        let da = parts[0].length === 4 ? parts[2] : parts[0];
                                        dbData.payment_date = `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
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

                    const cleanNum = (v) => v ? parseFloat(String(v).replace(/[^0-9.-]+/g, '')) || 0 : 0;
                    dbData.usdt = cleanNum(dbData.usdt);
                    dbData.divided_by = cleanNum(dbData.divided_by) || 88;
                    dbData.inr_amount = cleanNum(dbData.inr_amount) || Math.round((dbData.usdt * dbData.divided_by) * 100) / 100;

                    // Only count as valid payment if it has an agent or client or money amount
                    if (dbData.agent_name || dbData.client_name || dbData.usdt > 0 || dbData.inr_amount > 0) {
                        if (!dbData.agent_name) dbData.agent_name = 'Unassigned Agent';
                        dbData.payment_mode = (dbData.payment_mode || 'P2P').toUpperCase().includes('D') ? 'D P2P' : 'P2P';
                        dbData.received_in = (dbData.received_in || '').toLowerCase().includes('world') || (dbData.received_in || '').toLowerCase().includes('wk') ? 'World of Crypto' : 'Digital Verse';

                        dbData.id = nextId + count;
                        dbData.created_by_name = 'Payment Sheet Import';
                        dbData.created_at = dbData.payment_date + ' 12:00:00';

                        payments.push(dbData);
                        count++;

                        if (!USE_LOCAL_DB) {
                            try {
                                await api('create_payment', dbData);
                            } catch(e) {
                                console.error('Cloud insert error:', e);
                            }
                        }

                        // Sync Agent
                        if (dbData.agent_name && dbData.agent_name !== 'Unassigned Agent') {
                            const exA = agents.find(a => (a.agent_name || '').toLowerCase() === dbData.agent_name.toLowerCase());
                            if (!exA) {
                                agents.push({
                                    ecode: dbData.ecode || `EMP-${100 + agents.length + 1}`,
                                    agent_name: dbData.agent_name,
                                    ops_manager: dbData.ops_manager || '',
                                    tl: dbData.tl || ''
                                });
                            } else {
                                if (!exA.ecode && dbData.ecode) exA.ecode = dbData.ecode;
                                if (!exA.ops_manager && dbData.ops_manager) exA.ops_manager = dbData.ops_manager;
                                if (!exA.tl && dbData.tl) exA.tl = dbData.tl;
                            }
                        }

                        // Sync Client
                        if (dbData.client_name || dbData.client_number) {
                            const cNum = dbData.client_number || '';
                            const cName = dbData.client_name || '';
                            const exC = clients.find(c => (cNum && c.client_number === cNum) || (cName && (c.client_name || '').toLowerCase() === cName.toLowerCase()));
                            if (!exC) {
                                clients.push({
                                    client_name: cName || 'Unknown Client',
                                    client_number: cNum || '-',
                                    email_id: dbData.email_id || '',
                                    pan_no: dbData.pan_no || '',
                                    aadhar_no: dbData.aadhar_no || '',
                                    state: dbData.state || ''
                                });
                            }
                        }
                    }
                }

                localStorage.setItem('pp_payments', JSON.stringify(payments));
                localStorage.setItem('pp_agents', JSON.stringify(agents));
                localStorage.setItem('pp_clients', JSON.stringify(clients));

                await loadData();
                alert(`Successfully imported ${count} payment transactions into Payment Reports!`);
                importReportsFile.value = '';
            } catch (err) {
                alert('Import Error: ' + err.message);
                if (importReportsFile) importReportsFile.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };
}

loadData().catch(e => console.error(e));