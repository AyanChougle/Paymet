const f = document.getElementById('entryForm');
const msg = document.getElementById('entryMsg');
const ratioSelect = document.getElementById('ratioSelect');
const agent2Section = document.getElementById('agent2Section');
// Default date to today
f.payment_date.value = new Date().toISOString().slice(0, 10);
f.divided_by.value = '88';

// Auto compute INR amount (locked exchange rate 88)
function computeInr() {
    const u = parseFloat(f.usdt.value || 0);
    const d = 88;
    f.divided_by.value = '88';
    const total = u * d;
    f.inr_amount.value = total > 0 ? total.toFixed(2) : '';
}

f.usdt.addEventListener('input', computeInr);

// Title case helper
function toTitleCase(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .split(' ')
        .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
        .join(' ');
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function highlightMatch(text, query) {
    if (!text) return '';
    if (!query) return escapeHtml(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="omni-match">$1</span>');
}

// In-memory cache loaded from live DB
let dbAgents = [];
let dbClients = [];

async function initEntryData() {
    let apiSucceeded = false;
    try {
        const [agRes, clRes] = await Promise.all([
            api('agents', {}),
            api('clients', {})
        ]);
        dbAgents = agRes.agents || agRes.rows || [];
        dbClients = clRes.rows || [];
        apiSucceeded = true;
    } catch(e) {
        console.warn('API fetch warning in entry, reading local storage:', e);
        dbAgents = JSON.parse(localStorage.getItem('pp_agents') || '[]');
        dbClients = JSON.parse(localStorage.getItem('pp_clients') || '[]');
    }

    if (apiSucceeded) {
        localStorage.setItem('pp_agents', JSON.stringify(dbAgents));
        localStorage.setItem('pp_mappings', JSON.stringify(dbAgents));
        localStorage.setItem('pp_clients', JSON.stringify(dbClients));
    }
}
initEntryData();

function getActiveAgents() {
    const seen = new Set();
    const result = [];
    const active = dbAgents.filter(a => a.is_active !== 0 && a.is_active !== false && a.is_active !== '0');
    for (const a of active) {
        const name = (a.agent_name || a.name || '').trim();
        const code = (a.ecode || a.emp_id || '').trim();
        const key = `${name.toLowerCase()}__${code.toLowerCase()}`;
        if (name && !seen.has(key)) {
            seen.add(key);
            result.push(a);
        }
    }
    return result;
}

function filterAgents(query) {
    const list = getActiveAgents();
    if (!query) {
        return list.slice(0, 15);
    }
    const clean = query.trim().toLowerCase();
    const cleanAlpha = clean.replace(/[^a-z0-9]/g, '');

    const starts = [];
    const contains = [];
    const otherMatch = [];

    for (const a of list) {
        const name = (a.agent_name || a.name || '').trim().toLowerCase();
        const code = (a.ecode || a.emp_id || '').trim().toLowerCase();
        const tl = (a.tl || a.team_leader || '').trim().toLowerCase();
        const ops = (a.ops_manager || '').trim().toLowerCase();

        if (name.startsWith(clean) || (code && code.startsWith(clean))) {
            starts.push(a);
        } else if (name.includes(clean) || (code && code.includes(clean))) {
            contains.push(a);
        } else if (tl.includes(clean) || ops.includes(clean)) {
            otherMatch.push(a);
        } else if (cleanAlpha.length >= 2) {
            const nameAlpha = name.replace(/[^a-z0-9]/g, '');
            const codeAlpha = code.replace(/[^a-z0-9]/g, '');
            if (nameAlpha.includes(cleanAlpha) || (codeAlpha && codeAlpha.includes(cleanAlpha))) {
                otherMatch.push(a);
            }
        }
    }

    return [...starts, ...contains, ...otherMatch].slice(0, 20);
}

function filterClients(query) {
    const seen = new Set();
    const list = [];
    for (const c of dbClients) {
        const name = (c.client_name || '').trim();
        const num = (c.client_number || '').trim();
        const key = `${name.toLowerCase()}__${num}`;
        if (name && !seen.has(key)) {
            seen.add(key);
            list.push(c);
        }
    }

    if (!query) {
        return list.slice(0, 15);
    }

    const clean = query.trim().toLowerCase();
    const digits = clean.replace(/\D/g, '');

    return list.filter(c => {
        const cName = (c.client_name || '').toLowerCase();
        const cNum = (c.client_number || '');
        if (cName.includes(clean)) return true;
        if (digits && cNum.includes(digits)) return true;
        return false;
    }).slice(0, 20);
}

function setupOmniboxAutocomplete({ inputEl, dropdownEl, getSuggestions, renderItem, onSelect }) {
    if (!inputEl || !dropdownEl) return null;

    let activeIndex = -1;
    let currentItems = [];
    let isOpen = false;

    function open() {
        const query = (inputEl.value || '').trim();
        currentItems = getSuggestions(query);
        render();
        dropdownEl.classList.add('show');
        isOpen = true;
    }

    function close() {
        dropdownEl.classList.remove('show');
        dropdownEl.innerHTML = '';
        activeIndex = -1;
        currentItems = [];
        isOpen = false;
    }

    function render() {
        dropdownEl.innerHTML = '';
        if (!currentItems || currentItems.length === 0) {
            const query = (inputEl.value || '').trim();
            if (query) {
                const empty = document.createElement('div');
                empty.className = 'omni-empty';
                empty.textContent = `No matches for "${query}"`;
                dropdownEl.appendChild(empty);
            } else {
                close();
            }
            return;
        }

        currentItems.forEach((item, idx) => {
            const el = renderItem(item, (inputEl.value || '').trim(), idx === activeIndex);
            el.setAttribute('data-index', idx);
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectItem(idx);
            });
            el.addEventListener('mouseenter', () => {
                activeIndex = idx;
                updateActiveVisual();
            });
            dropdownEl.appendChild(el);
        });
    }

    function updateActiveVisual() {
        const children = dropdownEl.querySelectorAll('.omni-item');
        children.forEach((child, idx) => {
            if (idx === activeIndex) {
                child.classList.add('active');
                child.scrollIntoView({ block: 'nearest' });
            } else {
                child.classList.remove('active');
            }
        });
    }

    function selectItem(idx) {
        if (idx >= 0 && idx < currentItems.length) {
            const item = currentItems[idx];
            onSelect(item);
            close();
        }
    }

    inputEl.addEventListener('focus', () => {
        open();
    });

    inputEl.addEventListener('input', () => {
        activeIndex = 0;
        open();
    });

    inputEl.addEventListener('keydown', (e) => {
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            open();
            e.preventDefault();
            return;
        }

        if (!isOpen) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentItems.length > 0) {
                activeIndex = (activeIndex + 1) % currentItems.length;
                updateActiveVisual();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentItems.length > 0) {
                activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length;
                updateActiveVisual();
            }
        } else if (e.key === 'Enter') {
            if (isOpen && currentItems.length > 0) {
                e.preventDefault();
                const targetIdx = activeIndex >= 0 ? activeIndex : 0;
                selectItem(targetIdx);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'Tab') {
            if (isOpen && activeIndex >= 0) {
                selectItem(activeIndex);
            } else {
                close();
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
            close();
        }
    });

    return { open, close, refresh: () => { if (isOpen) open(); } };
}

function renderAgentRow(agent, query, isActive) {
    const item = document.createElement('div');
    item.className = `omni-item${isActive ? ' active' : ''}`;
    
    const name = toTitleCase((agent.agent_name || agent.name || '').trim());
    const ecode = (agent.ecode || agent.emp_id || '').trim();
    const tl = toTitleCase(agent.tl || agent.team_leader || '');
    const ops = toTitleCase(agent.ops_manager || '');

    const highlightedName = highlightMatch(name, query);
    const highlightedEcode = ecode ? highlightMatch(ecode, query) : '';

    item.innerHTML = `
        <div class="omni-item-left">
            <span class="omni-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            </span>
            <div class="omni-text">
                <div class="omni-primary">${highlightedName}</div>
                <div class="omni-sub">
                    ${ecode ? `<span class="omni-ecode-badge">${highlightedEcode}</span>` : ''}
                    ${tl ? `<span class="omni-dot">•</span><span>TL: ${escapeHtml(tl)}</span>` : ''}
                    ${ops ? `<span class="omni-dot">•</span><span>Ops: ${escapeHtml(ops)}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="omni-item-right">
            <span class="omni-action">Select ↵</span>
        </div>
    `;
    return item;
}

function renderClientRow(client, query, isActive) {
    const item = document.createElement('div');
    item.className = `omni-item${isActive ? ' active' : ''}`;

    const name = toTitleCase((client.client_name || '').trim());
    const num = (client.client_number || '').trim();

    const highlightedName = highlightMatch(name, query);
    const highlightedNum = num ? highlightMatch(num, query) : '';

    item.innerHTML = `
        <div class="omni-item-left">
            <span class="omni-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
            </span>
            <div class="omni-text">
                <div class="omni-primary">${highlightedName}</div>
                ${num ? `<div class="omni-sub"><span class="omni-phone">Phone: ${highlightedNum}</span></div>` : ''}
            </div>
        </div>
        <div class="omni-item-right">
            <span class="omni-action">Select ↵</span>
        </div>
    `;
    return item;
}

const agent1Omni = setupOmniboxAutocomplete({
    inputEl: f.agent_name,
    dropdownEl: document.getElementById('agent_name_dropdown'),
    getSuggestions: filterAgents,
    renderItem: renderAgentRow,
    onSelect: (agent) => {
        f.agent_name.value = toTitleCase(agent.agent_name || agent.name);
        f.ecode.value = agent.ecode || agent.emp_id || '';
        f.ops_manager.value = toTitleCase(agent.ops_manager || '');
        f.tl.value = toTitleCase(agent.tl || agent.team_leader || '');
        if (ratioSelect.value === '50/50') {
            f.agent2_name.focus();
        } else {
            f.ratioSelect.focus();
        }
    }
});

const agent2Omni = setupOmniboxAutocomplete({
    inputEl: f.agent2_name,
    dropdownEl: document.getElementById('agent2_name_dropdown'),
    getSuggestions: filterAgents,
    renderItem: renderAgentRow,
    onSelect: (agent) => {
        f.agent2_name.value = toTitleCase(agent.agent_name || agent.name);
        f.agent2_ecode.value = agent.ecode || agent.emp_id || '';
        f.agent2_ops_manager.value = toTitleCase(agent.ops_manager || '');
        f.agent2_tl.value = toTitleCase(agent.tl || agent.team_leader || '');
        f.client_name.focus();
    }
});

const clientOmni = setupOmniboxAutocomplete({
    inputEl: f.client_name,
    dropdownEl: document.getElementById('client_name_dropdown'),
    getSuggestions: filterClients,
    renderItem: renderClientRow,
    onSelect: (client) => {
        f.client_name.value = toTitleCase(client.client_name || '');
        if (client.client_number) {
            f.client_number.value = formatClientPhone(client.client_number);
        }
        f.client_number.focus();
    }
});

// Handle 50/50 Ratio toggle
function onRatioChange() {
    if (ratioSelect.value === '50/50') {
        agent2Section.style.display = 'block';
        f.agent2_name.required = true;
    } else {
        agent2Section.style.display = 'none';
        f.agent2_name.required = false;
        f.agent2_name.value = '';
        f.agent2_ecode.value = '';
        f.agent2_ops_manager.value = '';
        f.agent2_tl.value = '';
        if (agent2Omni) agent2Omni.close();
    }
}
ratioSelect.addEventListener('change', onRatioChange);

// Helper to find agent record by name or ecode from registered active agents
function findAgentMatch(query, exactOnly = false) {
    if (!query) return null;
    const clean = query.trim().toLowerCase();
    const activeAgents = dbAgents.filter(a => a.is_active !== 0 && a.is_active !== false && a.is_active !== '0');

    // 1. Exact match on agent_name or ecode
    for (const a of activeAgents) {
        const aName = (a.agent_name || a.name || '').trim().toLowerCase();
        const aCode = (a.ecode || a.emp_id || '').trim().toLowerCase();
        if (aName === clean || (aCode && aCode === clean)) {
            return a;
        }
    }

    if (exactOnly) return null;

    // 2. Exact match ignoring punctuation/extra spaces
    const cleanAlpha = clean.replace(/[^a-z0-9]/g, '');
    if (cleanAlpha.length >= 2) {
        for (const a of activeAgents) {
            const aAlpha = (a.agent_name || a.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cAlpha = (a.ecode || a.emp_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (aAlpha === cleanAlpha || (cAlpha && cAlpha === cleanAlpha)) {
                return a;
            }
        }
    }

    // 3. Starts-with or token match (user typed partial name or code)
    if (clean.length >= 3) {
        for (const a of activeAgents) {
            const aName = (a.agent_name || a.name || '').trim().toLowerCase();
            const aCode = (a.ecode || a.emp_id || '').trim().toLowerCase();
            if (aName.startsWith(clean) || (aCode && aCode.startsWith(clean))) {
                return a;
            }
        }
        for (const a of activeAgents) {
            const aName = (a.agent_name || a.name || '').trim().toLowerCase();
            if (aName.includes(clean)) {
                return a;
            }
        }
    }

    return null;
}

// Agent 1 Auto-fill
function autofillAgent1(e) {
    const val = f.agent_name.value.trim();
    if (!val) {
        f.ecode.value = '';
        f.ops_manager.value = '';
        f.tl.value = '';
        return;
    }
    const isInput = e && e.type === 'input';
    const match = isInput ? findAgentMatch(val, true) : findAgentMatch(val, false);
    if (match) {
        if (!isInput) {
            f.agent_name.value = toTitleCase(match.agent_name || match.name);
        }
        f.ecode.value = match.ecode || match.emp_id || '';
        f.ops_manager.value = toTitleCase(match.ops_manager || '');
        f.tl.value = toTitleCase(match.tl || match.team_leader || '');
    } else if (!isInput) {
        f.ecode.value = '';
        f.ops_manager.value = '';
        f.tl.value = '';
    }
}
f.agent_name.addEventListener('input', autofillAgent1);
f.agent_name.addEventListener('change', autofillAgent1);
f.agent_name.addEventListener('blur', autofillAgent1);

// Agent 2 Auto-fill (for 50/50 ratio)
function autofillAgent2(e) {
    const val = f.agent2_name.value.trim();
    if (!val) {
        f.agent2_ecode.value = '';
        f.agent2_ops_manager.value = '';
        f.agent2_tl.value = '';
        return;
    }
    const isInput = e && e.type === 'input';
    const match = isInput ? findAgentMatch(val, true) : findAgentMatch(val, false);
    if (match) {
        if (!isInput) {
            f.agent2_name.value = toTitleCase(match.agent_name || match.name);
        }
        f.agent2_ecode.value = match.ecode || match.emp_id || '';
        f.agent2_ops_manager.value = toTitleCase(match.ops_manager || '');
        f.agent2_tl.value = toTitleCase(match.tl || match.team_leader || '');
    } else if (!isInput) {
        f.agent2_ecode.value = '';
        f.agent2_ops_manager.value = '';
        f.agent2_tl.value = '';
    }
}
f.agent2_name.addEventListener('input', autofillAgent2);
f.agent2_name.addEventListener('change', autofillAgent2);
f.agent2_name.addEventListener('blur', autofillAgent2);

// Client phone formatting & auto-fill
function formatClientPhone(val) {
    if (!val) return '';
    let digits = val.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
        digits = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith('0')) {
        digits = digits.slice(1);
    }
    return digits.slice(0, 10);
}

f.client_number.addEventListener('input', () => {
    f.client_number.value = formatClientPhone(f.client_number.value);
    const num = f.client_number.value.trim();
    if (num.length >= 10) {
        const found = dbClients.find(c => c.client_number === num);
        if (found && !f.client_name.value) {
            f.client_name.value = toTitleCase(found.client_name || '');
        }
    }
});

f.client_name.addEventListener('change', () => {
    f.client_name.value = toTitleCase(f.client_name.value);
    const cleanName = f.client_name.value.trim().toLowerCase();
    if (cleanName) {
        const found = dbClients.find(c => (c.client_name || '').toLowerCase() === cleanName);
        if (found && found.client_number && !f.client_number.value) {
            f.client_number.value = found.client_number;
        }
    }
});

// ========================================================
// PAYMENT SUBMISSION HANDLER
// ========================================================
f.onsubmit = async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.className = '';

    // Enforce 88 divided_by
    f.divided_by.value = '88';
    computeInr();

    const ag1Name = f.agent_name.value.trim();
    const ag1Match = findAgentMatch(ag1Name);

    // Rule: No new agents should be created!
    if (!ag1Match) {
        msg.className = 'error';
        msg.textContent = `Agent "${ag1Name}" is not registered in the database. Only existing active agents can be selected.`;
        f.agent_name.focus();
        return;
    }

    const ratio = ratioSelect.value;
    let ag2Match = null;

    if (ratio === '50/50') {
        const ag2Name = f.agent2_name.value.trim();
        if (!ag2Name) {
            msg.className = 'error';
            msg.textContent = 'Please select Agent 2 for the 50/50 split ratio.';
            f.agent2_name.focus();
            return;
        }
        ag2Match = findAgentMatch(ag2Name);
        if (!ag2Match) {
            msg.className = 'error';
            msg.textContent = `Agent 2 "${ag2Name}" is not registered in the database.`;
            f.agent2_name.focus();
            return;
        }
        if (ag1Match.agent_name.toLowerCase() === ag2Match.agent_name.toLowerCase()) {
            msg.className = 'error';
            msg.textContent = 'Agent 1 and Agent 2 cannot be the same person for a 50/50 split.';
            f.agent2_name.focus();
            return;
        }
    }

    // Phone validation
    const clientNumber = formatClientPhone(f.client_number.value || '');
    if (clientNumber) {
        if (!/^[6-9]\d{9}$/.test(clientNumber)) {
            msg.className = 'error';
            msg.textContent = 'Client phone number must be a valid 10-digit Indian mobile number.';
            f.client_number.focus();
            return;
        }
    }

    const totalUsdt = parseFloat(f.usdt.value || 0);
    if (totalUsdt <= 0) {
        msg.className = 'error';
        msg.textContent = 'USDT amount must be greater than zero.';
        f.usdt.focus();
        return;
    }

    const totalInr = parseFloat(f.inr_amount.value || (totalUsdt * 88));
    const paymentDate = f.payment_date.value;
    const paymentMode = f.payment_mode.value;
    const receivedIn = f.received_in.value;
    const clientName = toTitleCase(f.client_name.value.trim());
    const remarks = f.remarks.value.trim();

    const u = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || JSON.parse(sessionStorage.getItem('pp_user') || 'null');
    const createdByName = u ? (u.name || u.username) : 'Admin';

    try {
        if (ratio === '50/50') {
            // Split into two individual payment records (each agent gets 50% single employee credit)
            const halfUsdt = parseFloat((totalUsdt / 2).toFixed(6));
            const halfInr = parseFloat((totalInr / 2).toFixed(2));

            const entry1 = {
                payment_date: paymentDate,
                agent_name: toTitleCase(ag1Match.agent_name || ag1Match.name),
                ecode: ag1Match.ecode || ag1Match.emp_id || '',
                ops_manager: toTitleCase(ag1Match.ops_manager || ''),
                tl: toTitleCase(ag1Match.tl || ag1Match.team_leader || ''),
                client_name: clientName,
                client_number: clientNumber,
                ratio: '50/50',
                payment_mode: paymentMode,
                usdt: halfUsdt,
                divided_by: 88,
                inr_amount: halfInr,
                received_in: receivedIn,
                created_by_name: createdByName,
                remarks: remarks ? `${remarks} (50% Split with ${toTitleCase(ag2Match.agent_name)})` : `50% Split with ${toTitleCase(ag2Match.agent_name)}`
            };

            const entry2 = {
                payment_date: paymentDate,
                agent_name: toTitleCase(ag2Match.agent_name || ag2Match.name),
                ecode: ag2Match.ecode || ag2Match.emp_id || '',
                ops_manager: toTitleCase(ag2Match.ops_manager || ''),
                tl: toTitleCase(ag2Match.tl || ag2Match.team_leader || ''),
                client_name: clientName,
                client_number: clientNumber,
                ratio: '50/50',
                payment_mode: paymentMode,
                usdt: halfUsdt,
                divided_by: 88,
                inr_amount: halfInr,
                received_in: receivedIn,
                created_by_name: createdByName,
                remarks: remarks ? `${remarks} (50% Split with ${toTitleCase(ag1Match.agent_name)})` : `50% Split with ${toTitleCase(ag1Match.agent_name)}`
            };

            await Promise.all([
                api('create_payment', entry1),
                api('create_payment', entry2)
            ]);
        } else {
            // 100% single payment
            const entry = {
                payment_date: paymentDate,
                agent_name: toTitleCase(ag1Match.agent_name || ag1Match.name),
                ecode: ag1Match.ecode || ag1Match.emp_id || '',
                ops_manager: toTitleCase(ag1Match.ops_manager || ''),
                tl: toTitleCase(ag1Match.tl || ag1Match.team_leader || ''),
                client_name: clientName,
                client_number: clientNumber,
                ratio: '100',
                payment_mode: paymentMode,
                usdt: totalUsdt,
                divided_by: 88,
                inr_amount: totalInr,
                received_in: receivedIn,
                created_by_name: createdByName,
                remarks: remarks
            };
            await api('create_payment', entry);
        }

        // Save client to directory if provided
        if (clientName || clientNumber) {
            try {
                await api('upsert_client_node', {
                    client_name: clientName || 'Unknown Client',
                    client_number: clientNumber || ''
                });
            } catch(e) {}
        }

        msg.className = '';
        msg.textContent = ratio === '50/50' 
            ? 'Payments recorded successfully! Split 50/50 for both agents.' 
            : 'Payment recorded successfully!';

        f.reset();
        if (agent1Omni) agent1Omni.close();
        if (agent2Omni) agent2Omni.close();
        if (clientOmni) clientOmni.close();
        f.payment_date.value = new Date().toISOString().slice(0, 10);
        f.divided_by.value = '88';
        ratioSelect.value = '100';
        onRatioChange();
        f.payment_mode.value = 'P2P';
        f.received_in.value = 'Digital Verse';

        setTimeout(() => { msg.textContent = ''; }, 4500);
    } catch(err) {
        msg.className = 'error';
        msg.textContent = err.message || 'Failed to record payment.';
    }
};
