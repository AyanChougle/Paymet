const monthFilter = document.getElementById('monthFilter');
const ftdDate = document.getElementById('ftdDate');
const applyBtn = document.getElementById('apply');
const clearBtn = document.getElementById('clearBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');

// Set default FTD date to today
ftdDate.value = new Date().toISOString().slice(0, 10);

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

function getAgentEcode(name) {
    if (!name) return '-';
    const agentsList = JSON.parse(localStorage.getItem('pp_agents') || localStorage.getItem('pp_mappings') || '[]');
    const found = agentsList.find(a => (a.agent_name || '').toLowerCase() === name.toLowerCase());
    return found && found.ecode ? found.ecode : '-';
}

const CANONICAL_ROLE_TARGETS = {
    OPS: {
        'rushikesh': 3500000,
        'arshad': 3500000
    },
    TL: {
        'mayur': 1500000,
        'viren': 1750000,
        'ritik': 1500000,
        'saif': 1750000
    }
};

function getRoleTarget(type, name) {
    if (!name) return 0;
    const clean = (name || '').trim().toLowerCase();
    
    const list = type === 'OPS' ? (window.dbOps || JSON.parse(localStorage.getItem('pp_ops_managers') || '[]')) 
                                : (window.dbTls || JSON.parse(localStorage.getItem('pp_team_leaders') || '[]'));
    for (const item of list) {
        const iName = (item.name || '').trim().toLowerCase();
        if (iName === clean || iName.includes(clean) || clean.includes(iName)) {
            const tgt = parseFloat(item.monthly_target || item.target || 0);
            if (tgt > 0) return tgt;
        }
    }

    const targets = JSON.parse(localStorage.getItem('pp_targets') || '[]');
    for (const t of targets) {
        if (t.type === type) {
            const tName = (t.name || '').trim().toLowerCase();
            if (tName === clean || tName.includes(clean) || clean.includes(tName)) {
                const tgt = parseFloat(t.target || t.monthly_target || 0);
                if (tgt > 0) return tgt;
            }
        }
    }

    const defMap = CANONICAL_ROLE_TARGETS[type] || {};
    for (const [k, v] of Object.entries(defMap)) {
        if (clean.includes(k)) return v;
    }

    return 0;
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
    let payments = [];
    let dbOps = [];
    let dbTls = [];
    let dbAgents = [];
    let lastEntry = null;

    let apiSucceeded = false;
    try {
        const [dashRes, agentRes] = await Promise.all([
            api('dashboard', {}),
            api('agents', {})
        ]);
        payments = dashRes.rawPayments || [];
        lastEntry = dashRes.lastEntry || null;
        dbOps = agentRes.ops_managers || [];
        dbTls = agentRes.team_leaders || [];
        dbAgents = agentRes.agents || [];
        apiSucceeded = true;
    } catch (e) {
        console.warn('API fetch warning, reading local storage:', e);
        payments = JSON.parse(localStorage.getItem('pp_payments') || '[]');
        dbOps = JSON.parse(localStorage.getItem('pp_ops_managers') || '[]');
        dbTls = JSON.parse(localStorage.getItem('pp_team_leaders') || '[]');
        dbAgents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
        lastEntry = payments.length ? payments[payments.length - 1] : null;
    }

    if (apiSucceeded) {
        // Authoritative Database Sync
        window.dbOps = dbOps;
        window.dbTls = dbTls;
        localStorage.setItem('pp_payments', JSON.stringify(payments));
        localStorage.setItem('pp_ops_managers', JSON.stringify(dbOps));
        localStorage.setItem('pp_team_leaders', JSON.stringify(dbTls));
        localStorage.setItem('pp_agents', JSON.stringify(dbAgents));
        localStorage.setItem('pp_mappings', JSON.stringify(dbAgents));
    } else {
        window.dbOps = dbOps;
        window.dbTls = dbTls;
    }

    // Last Entry Audit Display
    const lastEntryBadge = document.getElementById('lastEntryBadge');
    if (lastEntryBadge && lastEntry) {
        const entryBy = lastEntry.created_by_name || 'System';
        const entryTime = lastEntry.created_at || lastEntry.payment_date || '-';
        lastEntryBadge.innerHTML = `Last Entry: <strong>${entryTime}</strong> by <span style="color:var(--accent); font-weight:700;">${entryBy}</span> (${fmtInr(lastEntry.inr_amount)})`;
    }

    // Helpers to resolve Ops Manager and TL names cleanly to canonical DB names
    function resolveCanonicalName(name, candidateList) {
        if (!name) return '';
        const raw = String(name).replace(/[\u00A0\u200B\u200E\u200F]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!raw) return '';
        const clean = raw.toLowerCase();
        if (clean.includes('unassigned')) return '';

        // 1. Exact match
        for (const c of candidateList) {
            const cName = (c.name || '').trim();
            if (cName.toLowerCase() === clean) return cName;
        }

        // 2. Token / word matching
        const inTokens = clean.split(/[\s,.-]+/).filter(Boolean);
        if (!inTokens.length) return raw;

        const inFirst = inTokens[0];
        const inLast = inTokens.length > 1 ? inTokens[inTokens.length - 1] : null;

        let candidate = null;
        for (const c of candidateList) {
            const cName = (c.name || '').trim();
            const cTokens = cName.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
            const cFirst = cTokens[0];
            const cLast = cTokens.length > 1 ? cTokens[cTokens.length - 1] : null;

            if (!inLast) {
                if (cFirst === inFirst) {
                    if (candidate && candidate !== cName) { candidate = null; break; }
                    candidate = cName;
                }
            } else {
                if (cFirst === inFirst && cLast === inLast) return cName;
                if (cTokens.every(t => inTokens.includes(t))) return cName;
                if (inTokens.every(t => cTokens.includes(t))) return cName;
            }
        }
        if (candidate) return candidate;

        // 3. Fallback: startsWith / contains
        for (const c of candidateList) {
            const cName = (c.name || '').trim();
            const cLow = cName.toLowerCase();
            if (cLow.startsWith(clean) || clean.startsWith(cLow)) return cName;
        }

        return raw;
    }

    function resolveOpsName(name) {
        if (!name) return '';
        if (String(name).toLowerCase().includes('unassigned')) return 'Unassigned Ops';
        return resolveCanonicalName(name, dbOps) || String(name).trim();
    }

    function resolveTlName(name) {
        if (!name) return '';
        if (String(name).toLowerCase().includes('unassigned')) return 'Unassigned TL';
        return resolveCanonicalName(name, dbTls) || String(name).trim();
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
        if (!sortedMonths.includes(currentM)) {
            const opt = document.createElement('option');
            opt.value = currentM;
            const [y, mon] = currentM.split('-');
            const d = new Date(parseInt(y), parseInt(mon) - 1, 1);
            opt.textContent = d.toLocaleString('default', { month: 'long', year: 'numeric' });
            monthFilter.appendChild(opt);
        }
        monthFilter.value = currentM;
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

    const opsDbNames = new Set();
    const tlDbNames = new Set();

    // 1. Initialize Ops Managers Map strictly from DB (pp_ops_managers)
    dbOps.forEach(o => {
        const name = (o.name || '').trim();
        if (name) {
            opsDbNames.add(name.toLowerCase());
            opsMap[name] = {
                name: name,
                mtd: 0,
                ftd: 0,
                teams: new Set(),
                target: (parseFloat(o.monthly_target || o.target || 0) || getRoleTarget('OPS', name)),
                modeMap: { 'P2P': 0, 'D P2P': 0 },
                compMap: { 'Digital Verse': 0, 'World of Crypto': 0 }
            };
        }
    });

    // 2. Initialize Team Leaders Map strictly from DB (pp_team_leaders)
    dbTls.forEach(t => {
        const name = (t.name || '').trim();
        if (name) {
            const canonicalName = resolveTlName(name);
            tlDbNames.add(canonicalName.toLowerCase());
            const resolvedOps = resolveOpsName(t.ops_manager || t.reporting_to || t.reporting_level_1 || '');
            tlMap[canonicalName] = {
                name: canonicalName,
                mtd: 0,
                ftd: 0,
                opsManager: resolvedOps,
                target: (parseFloat(t.monthly_target || t.target || 0) || getRoleTarget('TL', canonicalName) || getRoleTarget('TL', name))
            };
            if (resolvedOps && opsMap[resolvedOps]) {
                opsMap[resolvedOps].teams.add(canonicalName);
            }
        }
    });

    // 3. Build Agent Directory lookup maps from DB (pp_agents)
    const agentToTl = {};
    const agentToOps = {};
    const tlToOps = {};

    dbTls.forEach(t => {
        if (t.name) {
            const tlName = resolveTlName(t.name);
            const resolvedOps = resolveOpsName(t.ops_manager || t.reporting_to || t.reporting_level_1 || '');
            if (resolvedOps) tlToOps[tlName.toLowerCase()] = resolvedOps;
        }
    });

    dbAgents.forEach(a => {
        const agName = (a.agent_name || a.name || '').toLowerCase().trim();
        if (agName) {
            if (a.tl || a.team_leader) agentToTl[agName] = resolveTlName(a.tl || a.team_leader);
            if (a.ops_manager) agentToOps[agName] = resolveOpsName(a.ops_manager);

            const realName = (a.agent_name || a.name || '').trim();
            if (!agentMap[realName]) {
                agentMap[realName] = { name: realName, mtd: 0, ftd: 0 };
            }
        }
    });

    // Aggregate Payments
    payments.forEach(p => {
        const date = p.payment_date || '';
        const inr = parseFloat(p.inr_amount || 0);
        const usdt = parseFloat(p.usdt || 0);
        const mode = (p.payment_mode || 'P2P').trim();
        const comp = (p.received_in || 'Digital Verse').trim();

        const isMtd = (selMonth === 'overall') || date.startsWith(selMonth);
        const isFtd = (date === selFtd);

        const agName = (p.agent_name || '').trim() || 'Unassigned';

        // Resolve TL
        let rawTl = (p.tl || '').trim();
        if (!rawTl && agName !== 'Unassigned') {
            rawTl = agentToTl[agName.toLowerCase()] || '';
        }
        let tlName = resolveTlName(rawTl) || rawTl;
        if (!tlName || tlName.toLowerCase().includes('unassigned')) {
            tlName = 'Unassigned TL';
        }

        // Auto-create in tlMap if not present
        if (tlName !== 'Unassigned TL' && !tlMap[tlName]) {
            const resolvedOps = resolveOpsName(p.ops_manager || agentToOps[agName.toLowerCase()] || tlToOps[tlName.toLowerCase()] || '');
            tlMap[tlName] = {
                name: tlName,
                mtd: 0,
                ftd: 0,
                opsManager: resolvedOps,
                target: getRoleTarget('TL', tlName) || 0
            };
        }

        // Resolve Ops Manager
        let rawOps = (p.ops_manager || '').trim();
        if (!rawOps) {
            if (tlName && tlName !== 'Unassigned TL' && tlToOps[tlName.toLowerCase()]) {
                rawOps = tlToOps[tlName.toLowerCase()];
            }
            if (!rawOps && agName !== 'Unassigned') {
                rawOps = agentToOps[agName.toLowerCase()] || '';
            }
        }
        let opsName = resolveOpsName(rawOps) || rawOps;
        if (!opsName || opsName.toLowerCase().includes('unassigned')) {
            opsName = 'Unassigned Ops';
        }

        // Auto-create in opsMap if not present
        if (opsName !== 'Unassigned Ops' && !opsMap[opsName]) {
            opsMap[opsName] = {
                name: opsName,
                mtd: 0,
                ftd: 0,
                teams: new Set(),
                target: getRoleTarget('OPS', opsName) || 0,
                modeMap: { 'P2P': 0, 'D P2P': 0, 'Vendor': 0 },
                compMap: { 'Digital Verse': 0, 'World of Crypto': 0 }
            };
        }

        const modeKey = (mode.toLowerCase().includes('vendor') ? 'Vendor' : (mode.toUpperCase().includes('D') && mode.toUpperCase().includes('P2P') ? 'D P2P' : 'P2P'));
        const compKey = comp.toLowerCase().includes('world') || comp.toLowerCase().includes('wk') ? 'World of Crypto' : (comp.toLowerCase().includes('digital') || comp.toLowerCase().includes('dv') ? 'Digital Verse' : (comp || 'Digital Verse'));

        if (isMtd) {
            totalInr += inr;
            totalUsdt += usdt;
            totalTx++;

            if (!modeMap[modeKey]) modeMap[modeKey] = { usdt: 0, inr: 0, count: 0 };
            modeMap[modeKey].usdt += usdt;
            modeMap[modeKey].inr += inr;
            modeMap[modeKey].count++;

            if (!compMap[compKey]) compMap[compKey] = { usdt: 0, inr: 0, count: 0 };
            compMap[compKey].usdt += usdt;
            compMap[compKey].inr += inr;
            compMap[compKey].count++;
        }

        // Agent Sales
        if (!agentMap[agName]) agentMap[agName] = { name: agName, mtd: 0, ftd: 0 };
        if (isMtd) agentMap[agName].mtd += inr;
        if (isFtd) agentMap[agName].ftd += inr;

        // TL Sales
        if (tlMap[tlName]) {
            if (isMtd) tlMap[tlName].mtd += inr;
            if (isFtd) tlMap[tlName].ftd += inr;
        }

        // Ops Manager Sales
        if (opsMap[opsName]) {
            if (tlName !== 'Unassigned TL') opsMap[opsName].teams.add(tlName);
            if (isMtd) {
                opsMap[opsName].mtd += inr;
                opsMap[opsName].modeMap[modeKey] = (opsMap[opsName].modeMap[modeKey] || 0) + inr;
                opsMap[opsName].compMap[compKey] = (opsMap[opsName].compMap[compKey] || 0) + inr;
            }
            if (isFtd) opsMap[opsName].ftd += inr;
        }
    });

    // Update Minimal KPI Strip
    document.getElementById('kpiInr').textContent = fmtInr(totalInr);
    document.getElementById('kpiInrSub').textContent = `${totalTx} transactions`;
    document.getElementById('kpiUsdt').textContent = fmtUsdt(totalUsdt) + ' USDT';
    
    const dP2pUsdt = modeMap['D P2P'] ? modeMap['D P2P'].usdt : 0;
    const p2pUsdt = modeMap['P2P'] ? modeMap['P2P'].usdt : 0;
    const dP2pInr = modeMap['D P2P'] ? modeMap['D P2P'].inr : 0;
    const p2pInr = modeMap['P2P'] ? modeMap['P2P'].inr : 0;
    document.getElementById('kpiModes').textContent = `${fmtUsdt(dP2pUsdt)} / ${fmtUsdt(p2pUsdt)}`;
    document.getElementById('kpiModesSub').textContent = `Direct: ${fmtInrInt(dP2pInr)} | P2P: ${fmtInrInt(p2pInr)}`;

    const dvInr = compMap['Digital Verse'] ? compMap['Digital Verse'].inr : 0;
    const wkInr = compMap['World of Crypto'] ? compMap['World of Crypto'].inr : 0;
    const dvUsdt = compMap['Digital Verse'] ? compMap['Digital Verse'].usdt : 0;
    const wkUsdt = compMap['World of Crypto'] ? compMap['World of Crypto'].usdt : 0;
    document.getElementById('kpiCompany').textContent = `${fmtInrInt(dvInr)} / ${fmtInrInt(wkInr)}`;
    document.getElementById('kpiCompanySub').textContent = `DV: ${fmtUsdt(dvUsdt)} U | WK: ${fmtUsdt(wkUsdt)} U`;

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
    window.allAgentsData = Object.values(agentMap).map(ag => {
        return { ...ag, ecode: getAgentEcode(ag.name) };
    }).sort((a, b) => b.mtd - a.mtd);
    
    window.agentCurrentPage = 1;
    window.agentPageSize = 20;

    window.renderAgents = function() {
        const searchVal = (document.getElementById('agentSearchFilter')?.value || '').toLowerCase();
        let filtered = window.allAgentsData;
        if (searchVal) {
            filtered = filtered.filter(a => a.name.toLowerCase().includes(searchVal) || a.ecode.toLowerCase().includes(searchVal));
        }

        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / window.agentPageSize) || 1;
        if (window.agentCurrentPage > totalPages) window.agentCurrentPage = totalPages;
        
        const startIndex = (window.agentCurrentPage - 1) * window.agentPageSize;
        const pageData = filtered.slice(startIndex, startIndex + window.agentPageSize);

        let agentMtdTotal = 0, agentFtdTotal = 0;
        filtered.forEach(ag => { agentMtdTotal += ag.mtd; agentFtdTotal += ag.ftd; });

        const agentRows = pageData.map((ag, idx) => {
            const i = startIndex + idx;
            const rankColor = i === 0 ? 'color:var(--accent); font-weight:800;' : (i < 3 ? 'font-weight:700;' : 'color:var(--text-muted);');
            return `<tr>
                <td style="${rankColor} text-align: center;">${i + 1}</td>
                <td style="color:var(--text-muted); font-family:var(--font-mono); text-align: left;">${ag.ecode}</td>
                <td style="text-align: left;"><strong>${ag.name}</strong></td>
                <td style="font-weight:700; ${i===0 ? 'color:var(--accent);':''} text-align: right;">${fmtInr(ag.mtd)}</td>
                <td style="text-align: right;">${fmtInr(ag.ftd)}</td>
            </tr>`;
        }).join('');

        const agentBody = document.getElementById('agentTableBody');
        const agentFoot = document.getElementById('agentTableFoot');
        if (agentBody) agentBody.innerHTML = agentRows || '<tr><td colspan="5" class="text-muted" style="text-align:center; padding:18px;">No agents found.</td></tr>';
        if (agentFoot) agentFoot.innerHTML = `<tr>
            <td style="text-align: left;"><strong>Grand Total</strong></td>
            <td></td>
            <td></td>
            <td style="text-align: right; font-weight: 700;">${fmtInr(agentMtdTotal)}</td>
            <td style="text-align: right; font-weight: 700;">${fmtInr(agentFtdTotal)}</td>
        </tr>`;

        const pagContainer = document.getElementById('agentPagination');
        if (pagContainer) {
            let pagHtml = '';
            pagHtml += `<button class="pagination-btn" onclick="window.agentCurrentPage=1; window.renderAgents();" ${window.agentCurrentPage === 1 ? 'disabled' : ''}>First</button>`;
            pagHtml += `<button class="pagination-btn" onclick="window.agentCurrentPage--; window.renderAgents();" ${window.agentCurrentPage === 1 ? 'disabled' : ''}>Prev</button>`;
            pagHtml += `<span style="font-size:13px; color:var(--text-muted); margin:0 10px;">Page ${window.agentCurrentPage} of ${totalPages}</span>`;
            pagHtml += `<button class="pagination-btn" onclick="window.agentCurrentPage++; window.renderAgents();" ${window.agentCurrentPage === totalPages ? 'disabled' : ''}>Next</button>`;
            pagHtml += `<button class="pagination-btn" onclick="window.agentCurrentPage=${totalPages}; window.renderAgents();" ${window.agentCurrentPage === totalPages ? 'disabled' : ''}>Last</button>`;
            pagContainer.innerHTML = pagHtml;
        }
    };

    const searchInput = document.getElementById('agentSearchFilter');
    if (searchInput && !searchInput.hasAttribute('data-bound')) {
        searchInput.setAttribute('data-bound', 'true');
        searchInput.addEventListener('input', () => {
            window.agentCurrentPage = 1;
            window.renderAgents();
        });
    }

    window.renderAgents();

    // 2. Render Team Leaders Table (Fetched dynamically from DB table pp_team_leaders)
    const sortedTLs = Object.values(tlMap).filter(t => t.name !== 'Unassigned TL').sort((a, b) => b.mtd - a.mtd);
    let tlMtdTotal = 0, tlFtdTotal = 0;
    const tlRows = sortedTLs.map((tl, i) => {
        tlMtdTotal += tl.mtd;
        tlFtdTotal += tl.ftd;
        const target = tl.target || getRoleTarget('TL', tl.name);
        return `<tr>
            <td style="color:var(--text-muted);">${i + 1}</td>
            <td><strong>${tl.name}</strong></td>
            <td style="font-weight:700;">${fmtInr(tl.mtd)}</td>
            <td>${fmtInr(tl.ftd)}</td>
            <td>${target > 0 ? fmtInrInt(target) : '-'}</td>
            <td>${renderTargetStatus(tl.mtd, target)}</td>
        </tr>`;
    }).join('');

    const tlBody = document.getElementById('tlTableBody');
    const tlFoot = document.getElementById('tlTableFoot');
    if (tlBody) tlBody.innerHTML = tlRows || '<tr><td colspan="6" class="text-muted" style="text-align:center; padding:18px;">No TL records.</td></tr>';
    if (tlFoot) tlFoot.innerHTML = `<tr>
        <td colspan="2">Grand Total</td>
        <td>${fmtInr(tlMtdTotal)}</td>
        <td>${fmtInr(tlFtdTotal)}</td>
        <td colspan="2">-</td>
    </tr>`;

    // 3. Render Ops Managers Table (Fetched dynamically from DB table pp_ops_managers)
    const sortedOps = Object.values(opsMap).filter(o => o.name !== 'Unassigned Ops').sort((a, b) => b.mtd - a.mtd);
    let opsMtdTotal = 0, opsFtdTotal = 0;
    const opsRows = sortedOps.map((op, i) => {
        opsMtdTotal += op.mtd;
        opsFtdTotal += op.ftd;
        const target = op.target || getRoleTarget('OPS', op.name);
        const teamCount = op.teams.size;
        const modeSub = `Direct: ${fmtInrInt(op.modeMap['D P2P'] || 0)} | P2P: ${fmtInrInt(op.modeMap['P2P'] || 0)}`;
        const compSub = `DV: ${fmtInrInt(op.compMap['Digital Verse'] || 0)} | WK: ${fmtInrInt(op.compMap['World of Crypto'] || 0)}`;

        return `<tr>
            <td style="color:var(--text-muted);">${i + 1}</td>
            <td>
                <strong>${op.name}</strong>
                <div style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">${modeSub} &bull; ${compSub}</div>
            </td>
            <td>${teamCount > 0 ? `${teamCount} Teams` : '-'}</td>
            <td style="font-weight:700;">${fmtInr(op.mtd)}</td>
            <td>${fmtInr(op.ftd)}</td>
            <td>${target > 0 ? fmtInrInt(target) : '-'}</td>
            <td>${renderTargetStatus(op.mtd, target)}</td>
        </tr>`;
    }).join('');

    const opsBody = document.getElementById('opsTableBody');
    const opsFoot = document.getElementById('opsTableFoot');
    if (opsBody) opsBody.innerHTML = opsRows || '<tr><td colspan="7" class="text-muted" style="text-align:center; padding:18px;">No Ops records.</td></tr>';
    if (opsFoot) opsFoot.innerHTML = `<tr>
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
    const modeBody = document.getElementById('modeTableBody');
    if (modeBody) modeBody.innerHTML = modeRows || '<tr><td colspan="4" class="text-muted" style="text-align:center; padding:18px;">No transaction records found.</td></tr>';

    // 5. Render Company Bifurcation
    const compRows = Object.entries(compMap).map(([comp, data]) => `<tr>
        <td><strong>${comp}</strong></td>
        <td>${fmtUsdt(data.usdt)} USDT</td>
        <td style="font-weight:700; color:var(--accent);">${fmtInr(data.inr)}</td>
        <td>${data.count}</td>
    </tr>`).join('');
    const compBody = document.getElementById('companyTableBody');
    if (compBody) compBody.innerHTML = compRows || '<tr><td colspan="4" class="text-muted" style="text-align:center; padding:18px;">No transaction records found.</td></tr>';
    window.currentReportData = { sortedAgents: window.allAgentsData, sortedTLs, sortedOps, modeMap, compMap, selMonth, selFtd };
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
        if (sortedAgents) {
            const wsAgents = XLSX.utils.json_to_sheet(sortedAgents.map((a, i) => ({
                'Rank': i + 1,
                'Emp Code': getAgentEcode(a.name),
                'Agent Name': a.name,
                'MTD / Filter Sales (INR)': a.mtd,
                'FTD Sales (INR)': a.ftd
            })));
            XLSX.utils.book_append_sheet(wb, wsAgents, 'Agents Performance');
        }

        // Sheet 2: Team Leaders Report
        if (sortedTLs) {
            const wsTLs = XLSX.utils.json_to_sheet(sortedTLs.map((t, i) => ({
                'Rank': i + 1,
                'TL Name': t.name,
                'MTD / Filter Sales (INR)': t.mtd,
                'FTD Sales (INR)': t.ftd,
                'Monthly Target': t.target || getRoleTarget('TL', t.name)
            })));
            XLSX.utils.book_append_sheet(wb, wsTLs, 'Team Leaders');
        }

        // Sheet 3: Ops Managers Report
        if (sortedOps) {
            const wsOps = XLSX.utils.json_to_sheet(sortedOps.map((o, i) => ({
                'Rank': i + 1,
                'Ops Manager': o.name,
                'TL Teams Count': o.teams.size,
                'MTD / Filter Sales (INR)': o.mtd,
                'FTD Sales (INR)': o.ftd,
                'Direct P2P Sales': o.modeMap['D P2P'] || 0,
                'P2P Sales': o.modeMap['P2P'] || 0,
                'Digital Verse Sales': o.compMap['Digital Verse'] || 0,
                'World of Crypto Sales': o.compMap['World of Crypto'] || 0,
                'Monthly Target': o.target || getRoleTarget('OPS', o.name)
            })));
            XLSX.utils.book_append_sheet(wb, wsOps, 'Ops Managers');
        }

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