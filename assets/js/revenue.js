const monthFilter = document.getElementById('monthFilter');
const ftdDate = document.getElementById('ftdDate');
const applyBtn = document.getElementById('apply');
const clearBtn = document.getElementById('clearBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');

// Set default FTD date to today
ftdDate.value = new Date().toISOString().slice(0, 10);

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInrInt = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtUsdt = (num) => Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getAgentEcode(name) {
    if (!name) return '-';
    const agentsList = JSON.parse(localStorage.getItem('pp_agents') || localStorage.getItem('pp_mappings') || '[]');
    const found = agentsList.find(a => (a.agent_name || '').toLowerCase() === name.toLowerCase());
    return found && found.ecode ? found.ecode : '-';
}

function getRoleTarget(type, name) {
    if (!name) return 0;
    const targets = JSON.parse(localStorage.getItem('pp_targets') || '[]');
    const found = targets.find(t => t.type === type && (t.name || '').toLowerCase() === name.toLowerCase());
    return found && found.target ? parseFloat(found.target) : 0;
}

// Tab Switching
window.switchDashTab = function(tabName, el) {
    document.querySelectorAll('#dashTabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    } else if (window.event && window.event.target) {
        window.event.target.classList.add('active');
    }

    const secAgents = document.getElementById('sec-agents');
    const secMgmt = document.getElementById('sec-management');
    const secTls = document.getElementById('sec-tls');
    const secOps = document.getElementById('sec-ops');
    const secBifur = document.getElementById('sec-bifurcation');

    if (tabName === 'all') {
        if (secAgents) secAgents.style.display = 'block';
        if (secMgmt) secMgmt.style.display = 'grid';
        if (secTls) secTls.style.display = 'block';
        if (secOps) secOps.style.display = 'block';
        if (secBifur) secBifur.style.display = 'grid';
    } else if (tabName === 'agents') {
        if (secAgents) secAgents.style.display = 'block';
        if (secMgmt) secMgmt.style.display = 'none';
        if (secBifur) secBifur.style.display = 'none';
    } else if (tabName === 'tls') {
        if (secAgents) secAgents.style.display = 'none';
        if (secMgmt) secMgmt.style.display = 'block';
        if (secTls) secTls.style.display = 'block';
        if (secOps) secOps.style.display = 'none';
        if (secBifur) secBifur.style.display = 'none';
    } else if (tabName === 'ops') {
        if (secAgents) secAgents.style.display = 'none';
        if (secMgmt) secMgmt.style.display = 'block';
        if (secTls) secTls.style.display = 'none';
        if (secOps) secOps.style.display = 'block';
        if (secBifur) secBifur.style.display = 'none';
    } else if (tabName === 'bifurcation') {
        if (secAgents) secAgents.style.display = 'none';
        if (secMgmt) secMgmt.style.display = 'none';
        if (secBifur) secBifur.style.display = 'grid';
    }
};

async function load() {
    const res = await api('dashboard', {});
    const payments = res.rawPayments || [];

    // Last Entry Audit Display
    const lastEntryBadge = document.getElementById('lastEntryBadge');
    if (lastEntryBadge && res.lastEntry) {
        const le = res.lastEntry;
        const entryBy = le.created_by_name || 'System';
        const entryTime = le.created_at || le.payment_date || '-';
        lastEntryBadge.innerHTML = `Last Entry: <strong>${entryTime}</strong> by <span style="color:var(--accent); font-weight:700;">${entryBy}</span> (${fmtInr(le.inr_amount)})`;
    }

    // Populate months in dropdown if needed
    if (monthFilter.options.length <= 1) {
        const monthSet = new Set();
        payments.forEach(p => {
            if (p.payment_date && p.payment_date.length >= 7) {
                monthSet.add(p.payment_date.slice(0, 7));
            }
        });
        const sortedMonths = Array.from(monthSet).sort().reverse();
        sortedMonths.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            const [y, mon] = m.split('-');
            const d = new Date(parseInt(y), parseInt(mon) - 1, 1);
            opt.textContent = d.toLocaleString('default', { month: 'long', year: 'numeric' });
            monthFilter.appendChild(opt);
        });

        monthFilter.value = 'overall';
    }

    const selMonth = monthFilter.value;
    const selFtd = ftdDate.value;

    let isNearEnd = false;
    let daysInMonth = 30;
    let currentDayNum = new Date().getDate();

    if (selMonth !== 'overall') {
        const [y, m] = selMonth.split('-').map(Number);
        daysInMonth = new Date(y, m, 0).getDate();
        
        const now = new Date();
        const thisMonthStr = now.toISOString().slice(0, 7);
        if (selMonth === thisMonthStr) {
            currentDayNum = now.getDate();
            if (currentDayNum >= 20 || (currentDayNum / daysInMonth) >= 0.65) {
                isNearEnd = true;
            }
        } else if (selMonth < thisMonthStr) {
            isNearEnd = true;
            currentDayNum = daysInMonth;
        }
    } else {
        if (currentDayNum >= 20) isNearEnd = true;
    }

    // Update Pace Badge in Header
    const paceBadge = document.getElementById('monthPaceBadge');
    if (paceBadge) {
        if (selMonth !== 'overall') {
            const [y, m] = selMonth.split('-').map(Number);
            const mName = new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' });
            const pctPassed = Math.min(100, Math.round((currentDayNum / daysInMonth) * 100));
            paceBadge.innerHTML = `<span style="font-size:11px; font-weight:600; color:${isNearEnd ? 'var(--danger)' : 'var(--text-muted)'};">
                ${mName} Day ${currentDayNum}/${daysInMonth} (${pctPassed}% elapsed)
            </span>`;
        } else {
            paceBadge.innerHTML = `<span style="font-size:11px; font-weight:600; color:var(--text-muted);">All Time Total</span>`;
        }
    }

    document.getElementById('kpiCompanySub').textContent = `DV: ${fmtUsdt(compMap['Digital Verse'].usdt)} U | WK: ${fmtUsdt(compMap['World of Crypto'].usdt)} U`;

    function renderTargetStatus(sales, target) {
        if (!target || target <= 0) {
            return `<span class="status-none">-</span>`;
        }
        const pct = (sales / target) * 100;
        const pctFormatted = Math.round(pct);

        if (sales >= target) {
            return `<span class="status-met">MET (${pctFormatted}%)</span>`;
        } else {
            if (isNearEnd) {
                return `<span class="status-behind">BEHIND (${pctFormatted}%)</span>`;
            } else {
                return `<span class="status-progress">IN PROGRESS (${pctFormatted}%)</span>`;
            }
        }
    }

    // 4. Render Payment Mode Bifurcation
    const modeRows = Object.entries(modeMap).map(([mode, data]) => `<tr>
        <td><strong>${mode}</strong></td>
        <td>${fmtUsdt(data.usdt)} USDT</td>
        <td style="font-weight:700; color:var(--accent);">${fmtInr(data.inr)}</td>
        <td>${data.count}</td>
    </tr>`).join('');
    document.getElementById('modeTableBody').innerHTML = modeRows;

    // 5. Render Company Bifurcation
    const compRows = Object.entries(compMap).map(([comp, data]) => `<tr>
        <td><strong>${comp}</strong></td>
        <td>${fmtUsdt(data.usdt)} USDT</td>
        <td style="font-weight:700; color:var(--accent);">${fmtInr(data.inr)}</td>
        <td>${data.count}</td>
    </tr>`).join('');
    document.getElementById('companyTableBody').innerHTML = compRows;

    window.currentReportData = { sortedAgents, sortedTLs, sortedOps, modeMap, compMap, selMonth, selFtd };
}

applyBtn.onclick = load;

clearBtn.onclick = () => {
    monthFilter.value = 'overall';
    ftdDate.value = new Date().toISOString().slice(0, 10);
    load();
};

// Export Summary Excel (.xlsx) Multi-Sheet
if (exportExcelBtn) {
    exportExcelBtn.onclick = function() {
        if (!window.currentReportData) return alert('No report data to export.');
        const { sortedAgents, sortedTLs, sortedOps, modeMap, compMap, selMonth } = window.currentReportData;

        const wb = XLSX.utils.book_new();

        // Sheet 4: Payment Mode Bifurcation
        const wsMode = XLSX.utils.json_to_sheet(Object.entries(modeMap).map(([mode, data]) => ({
            'Payment Mode': mode,
            'Total USDT': data.usdt,
            'Total INR': data.inr,
            'Transactions': data.count
        })));
        XLSX.utils.book_append_sheet(wb, wsMode, 'Payment Mode Bifurcation');

        // Sheet 5: Company Bifurcation
        const wsComp = XLSX.utils.json_to_sheet(Object.entries(compMap).map(([comp, data]) => ({
            'Received Company': comp,
            'Total USDT': data.usdt,
            'Total INR': data.inr,
            'Transactions': data.count
        })));
        XLSX.utils.book_append_sheet(wb, wsComp, 'Company Bifurcation');

        XLSX.writeFile(wb, `Sales_Summary_Workbook_${selMonth}.xlsx`);
    };
}

load().catch(err => console.error(err));


