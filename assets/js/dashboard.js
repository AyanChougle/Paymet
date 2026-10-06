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

        const currentM = new Date().toISOString().slice(0, 7);
        if (sortedMonths.includes(currentM)) {
            monthFilter.value = currentM;
        } else if (sortedMonths.length > 0) {
            monthFilter.value = sortedMonths[0];
        }
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

    // Aggregations
    let totalInr = 0;
    let totalUsdt = 0;
    let totalTx = 0;

    const agentMap = {};
    const tlMap = {};
    const opsMap = {};
    const modeMap = { 'P2P': { usdt: 0, inr: 0, count: 0 }, 'D P2P': { usdt: 0, inr: 0, count: 0 } };
    const compMap = { 'Digital Verse': { usdt: 0, inr: 0, count: 0 }, 'World of Crypto': { usdt: 0, inr: 0, count: 0 } };

    payments.forEach(p => {
        const date = p.payment_date || '';
        const inr = parseFloat(p.inr_amount || 0);
        const usdt = parseFloat(p.usdt || 0);
        const mode = (p.payment_mode || 'P2P').trim();
        const comp = (p.received_in || 'Digital Verse').trim();

        const isMtd = (selMonth === 'overall') || date.startsWith(selMonth);
        const isFtd = (date === selFtd);

        if (isMtd) {
            totalInr += inr;
            totalUsdt += usdt;
            totalTx++;

            const modeKey = mode.toUpperCase().includes('D') ? 'D P2P' : 'P2P';
            if (!modeMap[modeKey]) modeMap[modeKey] = { usdt: 0, inr: 0, count: 0 };
            modeMap[modeKey].usdt += usdt;
            modeMap[modeKey].inr += inr;
            modeMap[modeKey].count++;

            const compKey = comp.toLowerCase().includes('world') || comp.toLowerCase().includes('wk') ? 'World of Crypto' : 'Digital Verse';
            if (!compMap[compKey]) compMap[compKey] = { usdt: 0, inr: 0, count: 0 };
            compMap[compKey].usdt += usdt;
            compMap[compKey].inr += inr;
            compMap[compKey].count++;
        }

        const agName = p.agent_name || 'Unassigned';
        if (!agentMap[agName]) agentMap[agName] = { name: agName, mtd: 0, ftd: 0 };
        if (isMtd) agentMap[agName].mtd += inr;
        if (isFtd) agentMap[agName].ftd += inr;

        const tlName = p.tl || 'Unassigned';
        if (!tlMap[tlName]) tlMap[tlName] = { name: tlName, mtd: 0, ftd: 0 };
        if (isMtd) tlMap[tlName].mtd += inr;
        if (isFtd) tlMap[tlName].ftd += inr;

        const opsName = p.ops_manager || 'Unassigned';
        if (!opsMap[opsName]) opsMap[opsName] = { name: opsName, mtd: 0, ftd: 0, teams: new Set() };
        if (p.tl) opsMap[opsName].teams.add(p.tl);
        if (isMtd) opsMap[opsName].mtd += inr;
        if (isFtd) opsMap[opsName].ftd += inr;
    });

    // Update Minimal KPI Strip
    document.getElementById('kpiInr').textContent = fmtInr(totalInr);
    document.getElementById('kpiInrSub').textContent = `${totalTx} transactions`;
    document.getElementById('kpiUsdt').textContent = fmtUsdt(totalUsdt) + ' USDT';
    
    document.getElementById('kpiModes').textContent = `${fmtUsdt(modeMap['D P2P'].usdt)} / ${fmtUsdt(modeMap['P2P'].usdt)}`;
    document.getElementById('kpiModesSub').textContent = `Direct: ${fmtInrInt(modeMap['D P2P'].inr)} | P2P: ${fmtInrInt(modeMap['P2P'].inr)}`;

    document.getElementById('kpiCompany').textContent = `${fmtInrInt(compMap['Digital Verse'].inr)} / ${fmtInrInt(compMap['World of Crypto'].inr)}`;
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

    // 1. Render Agents Table
    const sortedAgents = Object.values(agentMap).sort((a, b) => b.mtd - a.mtd);
    let agentMtdTotal = 0, agentFtdTotal = 0;
    const agentRows = sortedAgents.map((ag, i) => {
        agentMtdTotal += ag.mtd;
        agentFtdTotal += ag.ftd;
        const ecode = getAgentEcode(ag.name);
        const rankColor = i === 0 ? 'color:var(--accent); font-weight:800;' : (i < 3 ? 'font-weight:700;' : 'color:var(--text-muted);');
        return `<tr>
            <td style="${rankColor}">${i + 1}</td>
            <td style="color:var(--text-muted); font-family:var(--font-mono);">${ecode}</td>
            <td><strong>${ag.name}</strong></td>
            <td style="font-weight:700; ${i===0 ? 'color:var(--accent);':''}">${fmtInr(ag.mtd)}</td>
            <td>${fmtInr(ag.ftd)}</td>
        </tr>`;
    }).join('');

    document.getElementById('agentTableBody').innerHTML = agentRows || '<tr><td colspan="5" class="text-muted" style="text-align:center; padding:18px;">No payments found for this period.</td></tr>';
    document.getElementById('agentTableFoot').innerHTML = `<tr>
        <td colspan="3">Grand Total</td>
        <td>${fmtInr(agentMtdTotal)}</td>
        <td>${fmtInr(agentFtdTotal)}</td>
    </tr>`;

    // 2. Render Team Leaders Table
    const sortedTLs = Object.values(tlMap).sort((a, b) => b.mtd - a.mtd);
    let tlMtdTotal = 0, tlFtdTotal = 0;
    const tlRows = sortedTLs.map((tl, i) => {
        tlMtdTotal += tl.mtd;
        tlFtdTotal += tl.ftd;
        const target = getRoleTarget('TL', tl.name);
        return `<tr>
            <td style="color:var(--text-muted);">${i + 1}</td>
            <td><strong>${tl.name}</strong></td>
            <td style="font-weight:700;">${fmtInr(tl.mtd)}</td>
            <td>${fmtInr(tl.ftd)}</td>
            <td>${target > 0 ? fmtInrInt(target) : '-'}</td>
            <td>${renderTargetStatus(tl.mtd, target)}</td>
        </tr>`;
    }).join('');

    document.getElementById('tlTableBody').innerHTML = tlRows || '<tr><td colspan="6" class="text-muted" style="text-align:center; padding:18px;">No TL records.</td></tr>';
    document.getElementById('tlTableFoot').innerHTML = `<tr>
        <td colspan="2">Grand Total</td>
        <td>${fmtInr(tlMtdTotal)}</td>
        <td>${fmtInr(tlFtdTotal)}</td>
        <td colspan="2">-</td>
    </tr>`;

    // 3. Render Ops Managers Table (with TL Teams count)
    const sortedOps = Object.values(opsMap).sort((a, b) => b.mtd - a.mtd);
    let opsMtdTotal = 0, opsFtdTotal = 0;
    const opsRows = sortedOps.map((op, i) => {
        opsMtdTotal += op.mtd;
        opsFtdTotal += op.ftd;
        const target = getRoleTarget('OPS', op.name);
        const teamCount = op.teams.size;
        return `<tr>
            <td style="color:var(--text-muted);">${i + 1}</td>
            <td><strong>${op.name}</strong></td>
            <td>${teamCount > 0 ? `${teamCount} Teams` : '-'}</td>
            <td style="font-weight:700;">${fmtInr(op.mtd)}</td>
            <td>${fmtInr(op.ftd)}</td>
            <td>${target > 0 ? fmtInrInt(target) : '-'}</td>
            <td>${renderTargetStatus(op.mtd, target)}</td>
        </tr>`;
    }).join('');

    document.getElementById('opsTableBody').innerHTML = opsRows || '<tr><td colspan="7" class="text-muted" style="text-align:center; padding:18px;">No Ops records.</td></tr>';
    document.getElementById('opsTableFoot').innerHTML = `<tr>
        <td colspan="3">Grand Total</td>
        <td>${fmtInr(opsMtdTotal)}</td>
        <td>${fmtInr(opsFtdTotal)}</td>
        <td colspan="2">-</td>
    </tr>`;

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

        // Sheet 1: Agents Report
        const wsAgents = XLSX.utils.json_to_sheet(sortedAgents.map((a, i) => ({
            'Rank': i + 1,
            'Emp Code': getAgentEcode(a.name),
            'Agent Name': a.name,
            'MTD / Filter Sales (INR)': a.mtd,
            'FTD Sales (INR)': a.ftd
        })));
        XLSX.utils.book_append_sheet(wb, wsAgents, 'Agents Performance');

        // Sheet 2: Team Leaders Report
        const wsTLs = XLSX.utils.json_to_sheet(sortedTLs.map((t, i) => ({
            'Rank': i + 1,
            'TL Name': t.name,
            'MTD / Filter Sales (INR)': t.mtd,
            'FTD Sales (INR)': t.ftd,
            'Monthly Target': getRoleTarget('TL', t.name)
        })));
        XLSX.utils.book_append_sheet(wb, wsTLs, 'Team Leaders');

        // Sheet 3: Ops Managers Report
        const wsOps = XLSX.utils.json_to_sheet(sortedOps.map((o, i) => ({
            'Rank': i + 1,
            'Ops Manager': o.name,
            'TL Teams Count': o.teams.size,
            'MTD / Filter Sales (INR)': o.mtd,
            'FTD Sales (INR)': o.ftd,
            'Monthly Target': getRoleTarget('OPS', o.name)
        })));
        XLSX.utils.book_append_sheet(wb, wsOps, 'Ops Managers');

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