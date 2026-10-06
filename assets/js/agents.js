const form = document.getElementById('mappingForm');
const list = document.getElementById('mappingList');
const msg = document.getElementById('msg');

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getMappings() {
    return JSON.parse(localStorage.getItem('pp_agents') || localStorage.getItem('pp_mappings') || '[]');
}

function saveMappings(mappings) {
    localStorage.setItem('pp_agents', JSON.stringify(mappings));
    localStorage.setItem('pp_mappings', JSON.stringify(mappings));
}

async function loadSalesAndRender() {
    const j = await api('dashboard', {});
    const payments = j.rawPayments || [];
    const currentMonth = new Date().toISOString().slice(0, 7);

    let mappings = getMappings();

    mappings.forEach(m => {
        m.monthSales = payments
            .filter(p => (p.agent_name || '').toLowerCase() === (m.agent_name || '').toLowerCase() && (p.payment_date || '').startsWith(currentMonth))
            .reduce((s, p) => s + (parseFloat(p.inr_amount) || 0), 0);
    });

    list.innerHTML = mappings.map((m, idx) => `<tr>
        <td><code style="color:var(--text-muted); font-family:var(--font-mono);">${m.ecode || '-'}</code></td>
        <td><strong>${m.agent_name || ''}</strong></td>
        <td>${m.ops_manager || '-'}</td>
        <td>${m.tl || '-'}</td>
        <td style="font-weight:700; color:var(--accent);">${fmtInr(m.monthSales || 0)}</td>
        <td><button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteMapping(${idx})">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="text-muted" style="text-align:center; padding:20px;">No agent mappings configured.</td></tr>';
}

window.deleteMapping = function(idx) {
    if (confirm('Delete this agent mapping?')) {
        let mappings = getMappings();
        mappings.splice(idx, 1);
        saveMappings(mappings);
        loadSalesAndRender();
    }
};

form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let mappings = getMappings();

    const existingIndex = mappings.findIndex(m => m.ecode === data.ecode || (data.agent_name && (m.agent_name || '').toLowerCase() === data.agent_name.toLowerCase()));
    if (existingIndex >= 0) {
        mappings[existingIndex] = data;
        msg.textContent = 'Agent mapping updated!';
    } else {
        mappings.push(data);
        msg.textContent = 'Agent mapping saved!';
    }

    saveMappings(mappings);
    form.reset();
    loadSalesAndRender();
    setTimeout(() => msg.textContent = '', 3000);
};

loadSalesAndRender();
