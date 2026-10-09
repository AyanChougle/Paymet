const opsForm = document.getElementById('opsForm');
const tlForm = document.getElementById('tlForm');
const unifiedForm = document.getElementById('unifiedMemberForm');
const list = document.getElementById('mappingList');
const foot = document.getElementById('mappingFoot');
const importHierarchyFile = document.getElementById('importHierarchyFile');
const importAgentsFile = document.getElementById('importAgentsFile');
const exportHierarchyBtn = document.getElementById('exportHierarchyBtn');
const exportAgentsBtn = document.getElementById('exportAgentsBtn');
const agentSearch = document.getElementById('agentSearch');

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInrInt = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

let cachedMappings = [];
let cachedOpsManagers = [];
let cachedTeamLeaders = [];
let cachedPayments = [];
let cachedTargets = [];

function getMappings() {
    return JSON.parse(localStorage.getItem('pp_agents') || localStorage.getItem('pp_mappings') || '[]');
}

function saveMappings(mappings) {
    localStorage.setItem('pp_agents', JSON.stringify(mappings));
    localStorage.setItem('pp_mappings', JSON.stringify(mappings));
}

function getOpsManagers() {
    return JSON.parse(localStorage.getItem('pp_ops_managers') || '[]');
}

function saveOpsManagers(opsList) {
    localStorage.setItem('pp_ops_managers', JSON.stringify(opsList));
}

function getTeamLeaders() {
    return JSON.parse(localStorage.getItem('pp_team_leaders') || '[]');
}

function saveTeamLeaders(tlList) {
    localStorage.setItem('pp_team_leaders', JSON.stringify(tlList));
}

function getTargets() {
    return JSON.parse(localStorage.getItem('pp_targets') || '[]');
}

function saveTargets(targets) {
    localStorage.setItem('pp_targets', JSON.stringify(targets));
}

function getRoleTarget(type, name) {
    if (!name) return 0;
    const targets = getTargets();
    const found = targets.find(t => t.type === type && (t.name || '').toLowerCase() === name.toLowerCase());
    return found && found.target ? parseFloat(found.target) : 0;
}

function setRoleTarget(type, name, targetVal) {
    if (!name) return;
    let targets = getTargets();
    const val = parseFloat(targetVal || 0);
    const idx = targets.findIndex(t => t.type === type && (t.name || '').toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
        targets[idx].target = val;
    } else if (val > 0) {
        targets.push({ type: type, name: name, target: val });
    }
    saveTargets(targets);
}

function renderTargetStatus(sales, target) {
    if (!target || target <= 0) return `<span class="status-none">-</span>`;
    const pct = Math.round((sales / target) * 100);
    const day = new Date().getDate();
    const isNearEnd = day >= 20;

    if (sales >= target) {
        return `<span class="status-met">MET (${pct}%)</span>`;
    } else {
        if (isNearEnd) {
            return `<span class="status-behind">BEHIND (${pct}%)</span>`;
        } else {
            return `<span class="status-progress">IN PROGRESS (${pct}%)</span>`;
        }
    }
}

// Tab Switching
window.switchAgentTab = function(tabKey, el) {
    document.querySelectorAll('#agentTabs .tab-btn').forEach(b => b.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    } else if (window.event && window.event.target) {
        window.event.target.classList.add('active');
    }

    const tabs = {
        'ops': document.getElementById('tab-ops'),
        'tls': document.getElementById('tab-tls'),
        'agents': document.getElementById('tab-agents'),
        'map': document.getElementById('tab-map')
    };

    Object.keys(tabs).forEach(k => {
        if (tabs[k]) tabs[k].style.display = (k === tabKey) ? 'block' : 'none';
    });
};

// Designation Selector on Unified Form
window.onDesignationChange = function() {
    const des = document.getElementById('inputDesignation').value;
    const grpOps = document.getElementById('grpOpsManager');
    const grpTl = document.getElementById('grpTlName');
    const grpTarget = document.getElementById('grpTarget');

    if (des === 'OPS') {
        grpOps.style.display = 'none';
        grpTl.querySelector('input').placeholder = 'e.g. Akash T (Reporting Level 1)';
        grpTl.querySelector('input').previousSibling.textContent = 'Reporting Level 1 (VP / Head)';
        grpTarget.style.display = 'flex';
    } else if (des === 'TL') {
        grpOps.style.display = 'flex';
        grpOps.querySelector('input').placeholder = 'Enter Full Name';
        grpTl.style.display = 'none';
        grpTarget.style.display = 'flex';
    } else {
        grpOps.style.display = 'flex';
        grpTl.style.display = 'flex';
        grpTl.querySelector('input').placeholder = 'Enter Full Name';
        grpTl.querySelector('input').previousSibling.textContent = 'Team Leader Name (TL)';
        grpTarget.style.display = 'none';
    }
};

async function loadData() {
    const res = await api('dashboard', {});
    cachedPayments = res.rawPayments || [];

    if (!USE_LOCAL_DB) {
        try {
            const agRes = await api('agents', {});
            if (agRes.agents && agRes.agents.length) {
                localStorage.setItem('pp_agents', JSON.stringify(agRes.agents));
            }
            if (agRes.ops_managers && agRes.ops_managers.length) {
                localStorage.setItem('pp_ops_managers', JSON.stringify(agRes.ops_managers));
            }
            if (agRes.team_leaders && agRes.team_leaders.length) {
                localStorage.setItem('pp_team_leaders', JSON.stringify(agRes.team_leaders));
            }
        } catch(e) {
            console.warn('Could not fetch cloud agents:', e);
        }
    }

    cachedTargets = getTargets();
    cachedOpsManagers = getOpsManagers();
    cachedTeamLeaders = getTeamLeaders();
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Synchronize known agents from payments
    let mappings = getMappings();
    const knownAgentNames = new Set(mappings.map(m => (m.agent_name || '').toLowerCase()));

    cachedPayments.forEach(p => {
        const name = (p.agent_name || '').trim();
        if (name && !knownAgentNames.has(name.toLowerCase())) {
            mappings.push({
                ecode: p.ecode || '',
                agent_name: name,
                ops_manager: p.ops_manager || '',
                tl: p.tl || ''
            });
            knownAgentNames.add(name.toLowerCase());
        }

        // Auto-discover Ops Managers & TLs if not yet registered
        if (p.ops_manager) {
            const opName = p.ops_manager.trim();
            if (!cachedOpsManagers.some(o => (o.name || '').toLowerCase() === opName.toLowerCase())) {
                cachedOpsManagers.push({ ecode: '-', name: opName, reporting_to: '-' });
            }
        }
        if (p.tl) {
            const tlName = p.tl.trim();
            if (!cachedTeamLeaders.some(t => (t.name || '').toLowerCase() === tlName.toLowerCase())) {
                cachedTeamLeaders.push({ ecode: '-', name: tlName, ops_manager: p.ops_manager || '' });
            }
        }
    });

    saveOpsManagers(cachedOpsManagers);
    saveTeamLeaders(cachedTeamLeaders);

    // Populate Sales & Transactions per Agent
    mappings.forEach(m => {
        const agPayments = cachedPayments.filter(p => 
            (p.agent_name || '').toLowerCase() === (m.agent_name || '').toLowerCase() && 
            (p.payment_date || '').startsWith(currentMonth)
        );
        m.monthSales = agPayments.reduce((s, p) => s + (parseFloat(p.inr_amount) || 0), 0);
        m.txCount = agPayments.length;
    });

    // Auto-correct missing or misaligned ops_managers from TL relationships
    mappings.forEach(m => {
        if (m.tl) {
            const tlObj = cachedTeamLeaders.find(t => (t.name || '').toLowerCase() === m.tl.trim().toLowerCase());
            if (tlObj && tlObj.ops_manager) {
                m.ops_manager = tlObj.ops_manager.trim();
            }
        }
    });

    cachedMappings = mappings;
    saveMappings(mappings);

    updateDatalists();
    renderKPISummary(mappings);
    renderOpsHierarchy(mappings);
    renderTlHierarchy(mappings);
    renderAllAgentsTable(mappings);
}

function updateDatalists() {
    const opsSet = new Set(cachedOpsManagers.map(o => (o.name || '').trim()).filter(Boolean));
    const tlSet = new Set(cachedTeamLeaders.map(t => (t.name || '').trim()).filter(Boolean));

    cachedMappings.forEach(m => {
        if (m.ops_manager) opsSet.add(m.ops_manager.trim());
        if (m.tl) tlSet.add(m.tl.trim());
    });

    const opsListEl = document.getElementById('opsManagerList');
    if (opsListEl) {
        opsListEl.innerHTML = Array.from(opsSet).sort().map(o => `<option value="${o}">`).join('');
    }
    const tlListEl = document.getElementById('tlList');
    if (tlListEl) {
        tlListEl.innerHTML = Array.from(tlSet).sort().map(t => `<option value="${t}">`).join('');
    }
}

function renderKPISummary(mappings) {
    const totalAgents = mappings.length;
    const activeAgents = mappings.filter(m => (m.monthSales || 0) > 0).length;
    
    const opsSet = new Set([
        ...cachedOpsManagers.map(o => (o.name || '').trim()),
        ...mappings.map(m => (m.ops_manager || '').trim())
    ].filter(Boolean));

    const tlSet = new Set([
        ...cachedTeamLeaders.map(t => (t.name || '').trim()),
        ...mappings.map(m => (m.tl || '').trim())
    ].filter(Boolean));
    
    const grandSales = mappings.reduce((sum, m) => sum + (m.monthSales || 0), 0);
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    document.getElementById('kpiAgentCount').textContent = totalAgents;
    document.getElementById('kpiActiveAgents').textContent = `${activeAgents} active this month`;
    
    document.getElementById('kpiOpsCount').textContent = opsSet.size;
    document.getElementById('kpiOpsSales').textContent = `${fmtInr(grandSales)} Total`;

    document.getElementById('kpiTlCount').textContent = tlSet.size;
    document.getElementById('kpiTlSales').textContent = `${tlSet.size} Teams`;

    document.getElementById('kpiTotalSales').textContent = fmtInr(grandSales);
    document.getElementById('kpiMonthLabel').textContent = `${monthName} MTD`;
}

// 1. Render Ops Manager Hierarchy Cards
function renderOpsHierarchy(mappings) {
    const container = document.getElementById('opsHierarchyContainer');
    if (!container) return;

    const opsGroups = {};

    // First ensure all configured Ops Managers are present
    cachedOpsManagers.forEach(op => {
        const name = (op.name || '').trim();
        if (name) {
            opsGroups[name] = {
                ecode: op.ecode || '-',
                name: name,
                reporting_to: op.reporting_to || '-',
                target: getRoleTarget('OPS', name) || parseFloat(op.target || 0),
                totalSales: 0,
                totalTx: 0,
                tls: {}
            };
        }
    });

    // Populate agents and TLs under Ops Managers
    mappings.forEach(m => {
        const ops = (m.ops_manager || '').trim() || 'Unassigned Ops Manager';
        const tl = (m.tl || '').trim() || 'Direct / Unassigned TL';

        if (!opsGroups[ops]) {
            opsGroups[ops] = {
                ecode: '-',
                name: ops,
                reporting_to: '-',
                target: getRoleTarget('OPS', ops === 'Unassigned Ops Manager' ? '' : ops),
                totalSales: 0,
                totalTx: 0,
                tls: {}
            };
        }

        if (!opsGroups[ops].tls[tl]) {
            opsGroups[ops].tls[tl] = {
                name: tl,
                target: getRoleTarget('TL', tl === 'Direct / Unassigned TL' ? '' : tl),
                totalSales: 0,
                totalTx: 0,
                agents: []
            };
        }

        opsGroups[ops].totalSales += (m.monthSales || 0);
        opsGroups[ops].totalTx += (m.txCount || 0);
        opsGroups[ops].tls[tl].totalSales += (m.monthSales || 0);
        opsGroups[ops].tls[tl].totalTx += (m.txCount || 0);
        opsGroups[ops].tls[tl].agents.push(m);
    });

    // Ensure all configured TLs assigned to this Ops are visible
    cachedTeamLeaders.forEach(t => {
        const opName = (t.ops_manager || '').trim();
        const tlName = (t.name || '').trim();
        if (opName && opsGroups[opName]) {
            if (!opsGroups[opName].tls[tlName]) {
                opsGroups[opName].tls[tlName] = {
                    name: tlName,
                    target: getRoleTarget('TL', tlName) || parseFloat(t.target || 0),
                    totalSales: 0,
                    totalTx: 0,
                    agents: []
                };
            }
        }
    });

    const sortedOps = Object.values(opsGroups).sort((a, b) => b.totalSales - a.totalSales);

    if (sortedOps.length === 0) {
        container.innerHTML = '<div class="panel" style="padding:20px; text-align:center; color:var(--text-muted);">No Ops Managers configured. Use the form above or Import Hierarchy (.xlsx) to create one.</div>';
        return;
    }

    container.innerHTML = sortedOps.map(ops => {
        const tlList = Object.values(ops.tls).sort((a, b) => b.totalSales - a.totalSales);
        const totalAgentsInOps = tlList.reduce((sum, t) => sum + t.agents.length, 0);

        return `
        <div class="hierarchy-card">
            <div class="hierarchy-head">
                <div>
                    <div class="hierarchy-title">
                        <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:var(--accent);"></span>
                        Ops Manager: ${ops.name}
                        ${ops.ecode && ops.ecode !== '-' ? `<code style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">[${ops.ecode}]</code>` : ''}
                    </div>
                    ${ops.reporting_to && ops.reporting_to !== '-' ? `<div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">Reporting Level 1: <strong>${ops.reporting_to}</strong></div>` : ''}
                </div>
                <div class="hierarchy-meta">
                    <div class="hierarchy-meta-item">Teams: <strong>${tlList.length}</strong></div>
                    <div class="hierarchy-meta-item">Agents: <strong>${totalAgentsInOps}</strong></div>
                    <div class="hierarchy-meta-item">MTD Sales: <strong style="color:var(--accent); font-size:13.5px;">${fmtInr(ops.totalSales)}</strong></div>
                    <div class="hierarchy-meta-item">Target: <strong>${ops.target > 0 ? fmtInrInt(ops.target) : '-'}</strong></div>
                    <div class="hierarchy-meta-item">${renderTargetStatus(ops.totalSales, ops.target)}</div>
                    <button class="ghost" style="padding:4px 10px; font-size:11px;" onclick="editOps('${ops.name}')">Edit Ops</button>
                    ${ops.name !== 'Unassigned Ops Manager' ? `<button class="ghost danger" style="padding:4px 10px; font-size:11px; color:var(--danger);" onclick="deleteOps('${ops.name}')">Delete</button>` : ''}
                </div>
            </div>

            <div style="display:grid; gap:12px;">
                ${tlList.length > 0 ? tlList.map(tl => `
                    <div class="tl-subcard">
                        <div class="tl-subcard-head">
                            <div>
                                <strong style="font-size:13px; color:var(--text);">Team Leader: ${tl.name}</strong>
                                <span style="font-size:11px; color:var(--text-muted); margin-left:6px;">(${tl.agents.length} Agents)</span>
                            </div>
                            <div style="display:flex; gap:12px; align-items:center; font-size:11.5px;">
                                <span>Team Sales: <strong style="color:var(--accent);">${fmtInr(tl.totalSales)}</strong></span>
                                <span>Target: <strong>${tl.target > 0 ? fmtInrInt(tl.target) : '-'}</strong></span>
                                <span>${renderTargetStatus(tl.totalSales, tl.target)}</span>
                            </div>
                        </div>

                        ${tl.agents.length > 0 ? `
                        <div class="table-wrap" style="border:none; background:transparent;">
                            <table style="min-width:100%;">
                                <thead>
                                    <tr>
                                        <th style="font-size:9.5px;">E-Code</th>
                                        <th style="font-size:9.5px;">Agent Name</th>
                                        <th style="font-size:9.5px;">MTD Sales</th>
                                        <th style="font-size:9.5px;">Txs</th>
                                        <th style="font-size:9.5px; text-align:right;">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tl.agents.map(ag => {
                                        const origIdx = cachedMappings.findIndex(m => m.agent_name === ag.agent_name);
                                        return `<tr>
                                            <td><code style="font-size:11px; color:var(--text-muted);">${ag.ecode || '-'}</code></td>
                                            <td><strong>${ag.agent_name}</strong></td>
                                            <td style="font-weight:700; ${ag.monthSales > 0 ? 'color:var(--accent);' : ''}">${fmtInr(ag.monthSales)}</td>
                                            <td>${ag.txCount || 0}</td>
                                            <td style="text-align:right;">
                                                <button class="ghost" style="padding:2px 8px; font-size:10.5px;" onclick="editAgent(${origIdx})">Reassign</button>
                                            </td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>` : '<div style="font-size:11.5px; color:var(--text-muted); padding:6px 0;">No agents assigned to this TL yet.</div>'}
                    </div>
                `).join('') : '<div style="font-size:12px; color:var(--text-muted); padding:10px 0;">No TL teams assigned to this Ops Manager.</div>'}
            </div>
        </div>
        `;
    }).join('');
}

// 2. Render Team Leader Hierarchy Cards
function renderTlHierarchy(mappings) {
    const container = document.getElementById('tlHierarchyContainer');
    if (!container) return;

    const tlGroups = {};

    cachedTeamLeaders.forEach(t => {
        const name = (t.name || '').trim();
        if (name) {
            tlGroups[name] = {
                ecode: t.ecode || '-',
                name: name,
                opsManager: t.ops_manager || 'Unassigned Ops',
                target: getRoleTarget('TL', name) || parseFloat(t.target || 0),
                totalSales: 0,
                totalTx: 0,
                agents: []
            };
        }
    });

    mappings.forEach(m => {
        const tl = (m.tl || '').trim() || 'Unassigned TL';
        const ops = (m.ops_manager || '').trim() || 'Unassigned Ops';

        if (!tlGroups[tl]) {
            tlGroups[tl] = {
                ecode: '-',
                name: tl,
                opsManager: ops,
                target: getRoleTarget('TL', tl === 'Unassigned TL' ? '' : tl),
                totalSales: 0,
                totalTx: 0,
                agents: []
            };
        }

        tlGroups[tl].totalSales += (m.monthSales || 0);
        tlGroups[tl].totalTx += (m.txCount || 0);
        tlGroups[tl].agents.push(m);
    });

    const sortedTLs = Object.values(tlGroups).sort((a, b) => b.totalSales - a.totalSales);

    if (sortedTLs.length === 0) {
        container.innerHTML = '<div class="panel" style="padding:20px; text-align:center; color:var(--text-muted);">No Team Leaders configured. Use the form above to create one.</div>';
        return;
    }

    container.innerHTML = sortedTLs.map(tl => `
        <div class="hierarchy-card">
            <div class="hierarchy-head">
                <div>
                    <div class="hierarchy-title">
                        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--accent);"></span>
                        Team Leader: ${tl.name}
                        ${tl.ecode && tl.ecode !== '-' ? `<code style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">[${tl.ecode}]</code>` : ''}
                    </div>
                    <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">
                        Reporting Ops Manager: <strong>${tl.opsManager}</strong>
                    </div>
                </div>
                <div class="hierarchy-meta">
                    <div class="hierarchy-meta-item">Agents: <strong>${tl.agents.length}</strong></div>
                    <div class="hierarchy-meta-item">MTD Sales: <strong style="color:var(--accent); font-size:13.5px;">${fmtInr(tl.totalSales)}</strong></div>
                    <div class="hierarchy-meta-item">Target: <strong>${tl.target > 0 ? fmtInrInt(tl.target) : '-'}</strong></div>
                    <div class="hierarchy-meta-item">${renderTargetStatus(tl.totalSales, tl.target)}</div>
                    <button class="ghost" style="padding:4px 10px; font-size:11px;" onclick="editTl('${tl.name}')">Edit TL</button>
                    ${tl.name !== 'Unassigned TL' && tl.name !== 'Direct / Unassigned TL' ? `<button class="ghost danger" style="padding:4px 10px; font-size:11px; color:var(--danger);" onclick="deleteTl('${tl.name}')">Delete</button>` : ''}
                </div>
            </div>

            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>E-Code</th>
                            <th>Agent Name</th>
                            <th>Current Month Sales</th>
                            <th>Transactions</th>
                            <th style="text-align:right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tl.agents.length > 0 ? tl.agents.map(ag => {
                            const origIdx = cachedMappings.findIndex(m => m.agent_name === ag.agent_name);
                            return `<tr>
                                <td><code style="color:var(--text-muted); font-family:var(--font-mono);">${ag.ecode || '-'}</code></td>
                                <td><strong>${ag.agent_name}</strong></td>
                                <td style="font-weight:700; ${ag.monthSales > 0 ? 'color:var(--accent);' : ''}">${fmtInr(ag.monthSales)}</td>
                                <td>${ag.txCount || 0}</td>
                                <td style="text-align:right;">
                                    <button class="ghost" style="padding:3px 8px; font-size:11px;" onclick="editAgent(${origIdx})">Reassign</button>
                                </td>
                            </tr>`;
                        }).join('') : '<tr><td colspan="5" style="text-align:center; padding:12px; color:var(--text-muted);">No agents assigned under this TL.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `).join('');
}

// 3. Render All Agents Table
function renderAllAgentsTable(mappings) {
    const q = (agentSearch?.value || '').toLowerCase().trim();
    const filtered = mappings.filter(m => {
        if (!q) return true;
        return (m.ecode || '').toLowerCase().includes(q) ||
               (m.agent_name || '').toLowerCase().includes(q) ||
               (m.ops_manager || '').toLowerCase().includes(q) ||
               (m.tl || '').toLowerCase().includes(q);
    });

    let totalSales = 0;
    let totalTx = 0;

    const rows = filtered.map((m, idx) => {
        totalSales += (m.monthSales || 0);
        totalTx += (m.txCount || 0);
        const originalIndex = mappings.findIndex(orig => orig.agent_name === m.agent_name);

        return `<tr>
            <td style="color:var(--text-muted);">${idx + 1}</td>
            <td><code style="color:var(--text-muted); font-family:var(--font-mono); font-weight:600;">${m.ecode || '-'}</code></td>
            <td><strong>${m.agent_name || ''}</strong></td>
            <td>${m.ops_manager ? `<span style="font-weight:600;">${m.ops_manager}</span>` : '<span class="status-none">Unassigned</span>'}</td>
            <td>${m.tl ? `<span style="color:var(--text-muted);">${m.tl}</span>` : '<span class="status-none">Unassigned</span>'}</td>
            <td style="font-weight:700; ${m.monthSales > 0 ? 'color:var(--accent);' : ''}">${fmtInr(m.monthSales || 0)}</td>
            <td>${m.txCount || 0}</td>
            <td style="text-align: right;">
                <button class="ghost" style="padding:4px 10px; font-size:11px; margin-right:4px;" onclick="editAgent(${originalIndex})">Edit</button>
                <button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteAgent(${originalIndex})">Delete</button>
            </td>
        </tr>`;
    }).join('');

    list.innerHTML = rows || '<tr><td colspan="8" class="text-muted" style="text-align:center; padding:24px;">No agents found.</td></tr>';
    
    if (foot) {
        foot.innerHTML = `<tr>
            <td colspan="5">Grand Total (${filtered.length} Agents)</td>
            <td style="font-weight:700; color:var(--accent);">${fmtInr(totalSales)}</td>
            <td>${totalTx} txs</td>
            <td>-</td>
        </tr>`;
    }
}

if (agentSearch) {
    agentSearch.addEventListener('input', () => {
        renderAllAgentsTable(cachedMappings);
    });
}

// Form Handlers
// 1. Ops Manager Form
if (opsForm) {
    opsForm.onsubmit = e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(opsForm));
        let opsList = getOpsManagers();
        
        const idx = opsList.findIndex(o => (o.name || '').toLowerCase() === (data.name || '').toLowerCase());
        if (idx >= 0) {
            opsList[idx] = { ...opsList[idx], ...data };
        } else {
            opsList.push(data);
        }

        saveOpsManagers(opsList);
        if (data.target) {
            setRoleTarget('OPS', data.name, data.target);
        }

        const msg = document.getElementById('opsMsg');
        msg.textContent = 'Ops Manager saved successfully!';
        opsForm.reset();
        loadData();
        setTimeout(() => msg.textContent = '', 3000);
    };
}

window.resetOpsForm = () => { opsForm.reset(); };

window.editOps = function(name) {
    const op = cachedOpsManagers.find(o => (o.name || '').toLowerCase() === name.toLowerCase()) || { name: name };
    document.getElementById('opsEcode').value = op.ecode || '';
    document.getElementById('opsName').value = op.name || '';
    document.getElementById('opsReporting').value = op.reporting_to || '';
    document.getElementById('opsTarget').value = getRoleTarget('OPS', op.name) || op.target || '';
    switchAgentTab('ops');
    document.getElementById('opsEcode').focus();
};

// 2. Team Leader Form
if (tlForm) {
    tlForm.onsubmit = e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(tlForm));
        let tlList = getTeamLeaders();

        const idx = tlList.findIndex(t => (t.name || '').toLowerCase() === (data.name || '').toLowerCase());
        if (idx >= 0) {
            tlList[idx] = { ...tlList[idx], ...data };
        } else {
            tlList.push(data);
        }

        saveTeamLeaders(tlList);
        if (data.target) {
            setRoleTarget('TL', data.name, data.target);
        }

        const msg = document.getElementById('tlMsg');
        msg.textContent = 'Team Leader saved successfully!';
        tlForm.reset();
        loadData();
        setTimeout(() => msg.textContent = '', 3000);
    };
}

window.resetTlForm = () => { tlForm.reset(); };

window.editTl = function(name) {
    const tl = cachedTeamLeaders.find(t => (t.name || '').toLowerCase() === name.toLowerCase()) || { name: name };
    document.getElementById('tlEcode').value = tl.ecode || '';
    document.getElementById('tlName').value = tl.name || '';
    document.getElementById('tlOpsManager').value = tl.ops_manager || '';
    document.getElementById('tlTarget').value = getRoleTarget('TL', tl.name) || tl.target || '';
    switchAgentTab('tls');
    document.getElementById('tlEcode').focus();
};

// 3. Unified Member Form
if (unifiedForm) {
    unifiedForm.onsubmit = e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(unifiedForm));
        const des = data.designation;

        if (des === 'OPS') {
            let opsList = getOpsManagers();
            const idx = opsList.findIndex(o => (o.name || '').toLowerCase() === data.name.toLowerCase());
            const item = { ecode: data.ecode, name: data.name, reporting_to: data.tl, target: data.target };
            if (idx >= 0) opsList[idx] = item; else opsList.push(item);
            saveOpsManagers(opsList);
            if (data.target) setRoleTarget('OPS', data.name, data.target);
        } else if (des === 'TL') {
            let tlList = getTeamLeaders();
            const idx = tlList.findIndex(t => (t.name || '').toLowerCase() === data.name.toLowerCase());
            const item = { ecode: data.ecode, name: data.name, ops_manager: data.ops_manager, target: data.target };
            if (idx >= 0) tlList[idx] = item; else tlList.push(item);
            saveTeamLeaders(tlList);
            if (data.target) setRoleTarget('TL', data.name, data.target);
        } else {
            let mappings = getMappings();
            const idx = mappings.findIndex(m => (m.agent_name || '').toLowerCase() === data.name.toLowerCase());
            const item = { ecode: data.ecode, agent_name: data.name, ops_manager: data.ops_manager, tl: data.tl };
            if (idx >= 0) mappings[idx] = item; else mappings.push(item);
            saveMappings(mappings);
        }

        const msg = document.getElementById('unifiedMsg');
        msg.textContent = `${des} saved successfully!`;
        unifiedForm.reset();
        loadData();
        setTimeout(() => msg.textContent = '', 3000);
    };
}

window.resetUnifiedForm = () => { unifiedForm.reset(); };

window.editAgent = function(idx) {
    const m = cachedMappings[idx];
    if (!m) return;

    document.getElementById('inputDesignation').value = 'AGENT';
    onDesignationChange();

    document.getElementById('inputEcode').value = m.ecode || '';
    document.getElementById('inputName').value = m.agent_name || '';
    document.getElementById('inputOpsManager').value = m.ops_manager || '';
    document.getElementById('inputTlName').value = m.tl || '';

    switchAgentTab('map');
    document.getElementById('inputEcode').focus();
};

window.deleteAgent = function(idx) {
    const m = cachedMappings[idx];
    if (!m) return;

    if (confirm(`Delete agent ${m.agent_name}?`)) {
        let mappings = getMappings();
        mappings = mappings.filter(item => (item.agent_name || '').toLowerCase() !== (m.agent_name || '').toLowerCase());
        saveMappings(mappings);
        loadData();
    }
};

window.deleteOps = function(name) {
    if (confirm(`Delete Ops Manager ${name}?\n(Agents will remain in the directory but their ops manager will be unassigned)`)) {
        let opsList = getOpsManagers();
        opsList = opsList.filter(o => (o.name || '').toLowerCase() !== name.toLowerCase());
        saveOpsManagers(opsList);
        
        let mappings = getMappings();
        mappings.forEach(m => {
            if ((m.ops_manager || '').toLowerCase() === name.toLowerCase()) {
                m.ops_manager = '';
            }
        });
        saveMappings(mappings);
        
        let tlList = getTeamLeaders();
        tlList.forEach(t => {
            if ((t.ops_manager || '').toLowerCase() === name.toLowerCase()) {
                t.ops_manager = '';
            }
        });
        saveTeamLeaders(tlList);
        
        loadData();
    }
};

window.deleteTl = function(name) {
    if (confirm(`Delete Team Leader ${name}?\n(Agents will remain in the directory but their TL will be unassigned)`)) {
        let tlList = getTeamLeaders();
        tlList = tlList.filter(t => (t.name || '').toLowerCase() !== name.toLowerCase());
        saveTeamLeaders(tlList);
        
        let mappings = getMappings();
        mappings.forEach(m => {
            if ((m.tl || '').toLowerCase() === name.toLowerCase()) {
                m.tl = '';
            }
        });
        saveMappings(mappings);
        loadData();
    }
};

// ========================================================
// EXCEL IMPORTERS: HIERARCHY & AGENTS
// ========================================================

// 1. Master Hierarchy Importer (EMP ID, Name, Reporting Level 1, Designation)
if (importHierarchyFile) {
    importHierarchyFile.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                let opsList = getOpsManagers();
                let tlList = getTeamLeaders();
                let mappings = getMappings();

                let opsAdded = 0, tlAdded = 0, agentsAdded = 0;

                rows.forEach(r => {
                    const ecode = r['EMP ID'] || r['Emp ID'] || r['EmpID'] || r['E-Code'] || r['ecode'] || r['Code'] || '';
                    const name = (r['Name'] || r['Agent Name'] || r['Employee Name'] || '').trim();
                    const rep1 = (r['Reporting Level 1'] || r['Reporting Manager'] || r['Reporting'] || '').trim();
                    const des = (r['Designation'] || r['Role'] || '').trim().toLowerCase();

                    if (!name) return;

                    if (des.includes('operations') || des.includes('ops')) {
                        // Register as Ops Manager
                        const ex = opsList.find(o => (o.name || '').toLowerCase() === name.toLowerCase());
                        if (ex) {
                            if (ecode) ex.ecode = ecode;
                            if (rep1) ex.reporting_to = rep1;
                        } else {
                            opsList.push({ ecode: ecode || '', name: name, reporting_to: rep1 });
                            opsAdded++;
                        }
                    } else if (des.includes('team leader') || des.includes('tl')) {
                        // Register as Team Leader
                        const ex = tlList.find(t => (t.name || '').toLowerCase() === name.toLowerCase());
                        if (ex) {
                            if (ecode) ex.ecode = ecode;
                            if (rep1) ex.ops_manager = rep1;
                        } else {
                            tlList.push({ ecode: ecode || '', name: name, ops_manager: rep1 });
                            tlAdded++;
                        }
                    } else {
                        // Register as Sales Agent
                        const ex = mappings.find(m => (m.agent_name || '').toLowerCase() === name.toLowerCase());
                        if (ex) {
                            if (ecode) ex.ecode = ecode;
                            if (rep1) ex.tl = rep1;
                        } else {
                            mappings.push({
                                ecode: ecode || '',
                                agent_name: name,
                                ops_manager: '',
                                tl: rep1
                            });
                            agentsAdded++;
                        }
                    }
                });

                saveOpsManagers(opsList);
                saveTeamLeaders(tlList);
                saveMappings(mappings);
                loadData();

                alert(`Hierarchy Imported Successfully!\n• Ops Managers: +${opsAdded}\n• Team Leaders: +${tlAdded}\n• Agents: +${agentsAdded}`);
                importHierarchyFile.value = '';
            } catch (err) {
                alert('Hierarchy Import Error: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };
}

// 2. Agents Importer
if (importAgentsFile) {
    importAgentsFile.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                let mappings = getMappings();
                let count = 0;

                rows.forEach(r => {
                    let ecode = r['EMP ID'] || r['Emp ID'] || r['E-Code'] || r['ecode'] || '';
                    let name = (r['Agent Name'] || r['Name'] || '').trim();
                    let ops = (r['Ops Manager'] || r['ops_manager'] || '').trim();
                    let tl = (r['TL Name'] || r['tl'] || r['Team Leader'] || '').trim();

                    if (name) {
                        const existing = mappings.find(m => (m.agent_name || '').toLowerCase() === name.toLowerCase());
                        if (existing) {
                            if (ecode) existing.ecode = ecode;
                            if (ops) existing.ops_manager = ops;
                            if (tl) existing.tl = tl;
                        } else {
                            mappings.push({ ecode: ecode || '', agent_name: name, ops_manager: ops, tl: tl });
                        }
                        count++;
                    }
                });

                saveMappings(mappings);
                loadData();
                alert(`Successfully imported ${count} agents into directory!`);
                importAgentsFile.value = '';
            } catch (err) {
                alert('Import Error: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };
}

// ========================================================
// EXCEL EXPORTERS
// ========================================================
if (exportAgentsBtn) {
    exportAgentsBtn.onclick = function() {
        const mappings = getMappings();
        if (!mappings.length) return alert('No agents configured to export.');

        const ws = XLSX.utils.json_to_sheet(mappings.map((m, i) => ({
            'Index': i + 1,
            'EMP ID': m.ecode || '',
            'Agent Name': m.agent_name || '',
            'Ops Manager': m.ops_manager || '',
            'Team Leader (TL)': m.tl || '',
            'MTD Sales (INR)': m.monthSales || 0,
            'Transactions': m.txCount || 0
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Agents Directory');
        XLSX.writeFile(wb, `Agents_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
}

if (exportHierarchyBtn) {
    exportHierarchyBtn.onclick = function() {
        const wb = XLSX.utils.book_new();

        // 1. Ops Managers Sheet
        const wsOps = XLSX.utils.json_to_sheet(cachedOpsManagers.map((o, i) => ({
            '#': i + 1,
            'EMP ID': o.ecode || '',
            'Ops Manager Name': o.name || '',
            'Reporting Level 1': o.reporting_to || '',
            'Monthly Target': getRoleTarget('OPS', o.name) || o.target || 0
        })));
        XLSX.utils.book_append_sheet(wb, wsOps, 'Ops Managers');

        // 2. Team Leaders Sheet
        const wsTL = XLSX.utils.json_to_sheet(cachedTeamLeaders.map((t, i) => ({
            '#': i + 1,
            'EMP ID': t.ecode || '',
            'TL Name': t.name || '',
            'Reporting Ops Manager': t.ops_manager || '',
            'Monthly Target': getRoleTarget('TL', t.name) || t.target || 0
        })));
        XLSX.utils.book_append_sheet(wb, wsTL, 'Team Leaders');

        // 3. All Agents Sheet
        const wsAgents = XLSX.utils.json_to_sheet(cachedMappings.map((m, i) => ({
            '#': i + 1,
            'EMP ID': m.ecode || '',
            'Agent Name': m.agent_name || '',
            'Ops Manager': m.ops_manager || 'Unassigned',
            'Team Leader': m.tl || 'Unassigned',
            'Current Month Sales': m.monthSales || 0,
            'Transactions': m.txCount || 0
        })));
        XLSX.utils.book_append_sheet(wb, wsAgents, 'All Agents');

        XLSX.writeFile(wb, `Organization_Hierarchy_Workbook_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
}

loadData().catch(err => console.error(err));
