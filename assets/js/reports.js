const searchFilter = document.getElementById('searchFilter');
const fromInput = document.getElementById('from');
const toInput = document.getElementById('to');
const modeFilter = document.getElementById('modeFilter');
const companyFilter = document.getElementById('companyFilter');
const filterBtn = document.getElementById('filterBtn');
const clearBtn = document.getElementById('clearBtn');
const exportCsvBtn = document.getElementById('exportCsv');
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

exportCsvBtn.onclick = () => {
    if (!filteredRows.length) return alert('No data to export.');

    const headers = [
        'SR No',
        'Date',
        'E-Code',
        'Agent Name',
        'TL Name',
        'Ops Manager',
        'Client Name',
        'Client Number',
        'Email ID',
        'Payment Mode',
        'USDT',
        'INR Amount',
        'Ratio',
        'PAN NO',
        'AADHAR NO',
        'STATE',
        'Received Company',
        'Entered By',
        'Entry Timestamp'
    ];

    const lines = [headers.join(',')];

    filteredRows.forEach((r, idx) => {
        const ecode = r.ecode || getAgentEcode(r.agent_name);
        const ops = r.ops_manager || getAgentOps(r.agent_name);
        lines.push([
            idx + 1,
            `"${r.payment_date || ''}"`,
            `"${ecode}"`,
            `"${r.agent_name || ''}"`,
            `"${r.tl || ''}"`,
            `"${ops}"`,
            `"${r.client_name || ''}"`,
            `"${r.client_number || ''}"`,
            `"${r.email_id || ''}"`,
            `"${r.payment_mode || ''}"`,
            r.usdt || 0,
            r.inr_amount || 0,
            `"${r.ratio || ''}"`,
            `"${r.pan_no || ''}"`,
            `"${r.aadhar_no || ''}"`,
            `"${r.state || ''}"`,
            `"${r.received_in || ''}"`,
            `"${r.created_by_name || ''}"`,
            `"${r.created_at || ''}"`
        ].join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Payment_Sheet_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
};

loadData().catch(e => console.error(e));