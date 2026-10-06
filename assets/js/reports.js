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
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                let payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
                let count = 0;
                const nextId = payments.length ? Math.max(...payments.map(p => p.id || 0)) + 1 : 1;

                rows.forEach((r, i) => {
                    let d = r['Date'] || r['payment_date'] || new Date().toISOString().slice(0, 10);
                    let ag = r['Agent Name'] || r['agent_name'] || 'Unassigned';
                    let u = parseFloat(r['USDT'] || r['usdt'] || 0);
                    let inr = parseFloat(r['INR Amount'] || r['inr_amount'] || 0);

                    if (ag) {
                        payments.push({
                            id: nextId + i,
                            payment_date: d,
                            ecode: r['E-Code'] || r['ecode'] || '',
                            agent_name: ag,
                            tl: r['TL Name'] || r['tl'] || '',
                            ops_manager: r['Ops Manager'] || r['ops_manager'] || '',
                            client_name: r['Client Name'] || r['client_name'] || '',
                            client_number: r['Client Number'] || r['client_number'] || '',
                            email_id: r['Email ID'] || r['email_id'] || '',
                            payment_mode: r['Payment Mode'] || r['payment_mode'] || 'P2P',
                            usdt: u,
                            divided_by: parseFloat(r['Divided By'] || 88),
                            inr_amount: inr || (u * 88),
                            ratio: r['Ratio'] || '',
                            pan_no: r['PAN NO'] || r['pan_no'] || '',
                            aadhar_no: r['AADHAR NO'] || r['aadhar_no'] || '',
                            state: r['STATE'] || r['state'] || '',
                            received_in: r['Received Company'] || r['received_in'] || 'Digital Verse',
                            created_by_name: 'Reports Importer',
                            created_at: d + ' 12:00:00'
                        });
                        count++;
                    }
                });

                localStorage.setItem('pp_payments', JSON.stringify(payments));
                await loadData();
                alert(`Successfully imported ${count} payment records!`);
                importReportsFile.value = '';
            } catch (err) {
                alert('Import Error: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };
}

loadData().catch(e => console.error(e));