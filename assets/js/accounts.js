const form = document.getElementById('cashForm');
const list = document.getElementById('ledgerList');
const msg = document.getElementById('msg');
form.date.value = new Date().toISOString().slice(0, 10);

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsdt = (num) => Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getLedger() {
    return JSON.parse(localStorage.getItem('pp_accounts') || '[]');
}

function saveLedger(data) {
    localStorage.setItem('pp_accounts', JSON.stringify(data));
}

async function render() {
    const j = await api('dashboard', {});
    const payments = j.rawPayments || [];

    let totalInr = 0;
    let totalUsdt = 0;
    payments.forEach(p => {
        totalInr += (parseFloat(p.inr_amount) || 0);
        totalUsdt += (parseFloat(p.usdt) || 0);
    });

    const ledger = getLedger();
    ledger.sort((a, b) => b.date.localeCompare(a.date));

    let totalGiven = 0;
    ledger.forEach(l => {
        totalGiven += (parseFloat(l.amount) || 0);
    });

    const balance = totalInr - totalGiven;

    document.getElementById('totalInr').textContent = fmtInr(totalInr);
    document.getElementById('totalUsdt').textContent = fmtUsdt(totalUsdt) + ' USDT';
    document.getElementById('totalGiven').textContent = fmtInr(totalGiven);
    document.getElementById('balance').textContent = fmtInr(balance);

    list.innerHTML = ledger.map((l, idx) => `<tr>
        <td>${l.date}</td>
        <td style="color:var(--danger); font-weight:700;">${fmtInr(l.amount)}</td>
        <td>${l.remarks || '-'}</td>
        <td><button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteEntry(${idx})">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="4" class="text-muted" style="text-align:center; padding:20px;">No handover entries recorded.</td></tr>';
}

window.deleteEntry = function(idx) {
    if (confirm('Delete this ledger entry?')) {
        let ledger = getLedger();
        ledger.sort((a, b) => b.date.localeCompare(a.date));
        ledger.splice(idx, 1);
        saveLedger(ledger);
        render();
    }
};

form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let ledger = getLedger();
    ledger.push(data);
    saveLedger(ledger);
    form.reset();
    form.date.value = new Date().toISOString().slice(0, 10);
    render();
    msg.textContent = 'Handover entry saved!';
    setTimeout(() => msg.textContent = '', 3000);
};

render();
