const form = document.getElementById('cashForm');
const list = document.getElementById('ledgerList');
const msg = document.getElementById('msg');
const importAccountsFile = document.getElementById('importAccountsFile');
const exportAccountsBtn = document.getElementById('exportAccountsBtn');

if (form && form.date) form.date.value = new Date().toISOString().slice(0, 10);

const fmtInr = (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsdt = (num) => Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let cachedLedger = [];

async function getLedgerData() {
    try {
        const res = await api('accounts', {});
        cachedLedger = res.rows || [];
        localStorage.setItem('pp_accounts', JSON.stringify(cachedLedger));
        return cachedLedger;
    } catch (e) {
        cachedLedger = JSON.parse(localStorage.getItem('pp_accounts') || '[]');
        return cachedLedger;
    }
}

async function render() {
    const [dashRes, ledger] = await Promise.all([
        api('dashboard', {}).catch(() => ({ rawPayments: [] })),
        getLedgerData()
    ]);
    const payments = dashRes.rawPayments || [];

    let totalInr = 0;
    let totalUsdt = 0;
    payments.forEach(p => {
        totalInr += (parseFloat(p.inr_amount) || 0);
        totalUsdt += (parseFloat(p.usdt) || 0);
    });

    ledger.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let totalGiven = 0;
    ledger.forEach(l => {
        totalGiven += (parseFloat(l.amount) || 0);
    });

    const balance = totalInr - totalGiven;

    document.getElementById('totalInr').textContent = fmtInr(totalInr);
    document.getElementById('totalUsdt').textContent = fmtUsdt(totalUsdt) + ' USDT';
    document.getElementById('totalGiven').textContent = fmtInr(totalGiven);
    document.getElementById('balance').textContent = fmtInr(balance);

    list.innerHTML = ledger.map(l => `<tr>
        <td>${l.date || ''}</td>
        <td style="color:var(--danger); font-weight:700;">${fmtInr(l.amount)}</td>
        <td>${l.remarks || '-'}</td>
        <td><button class="ghost danger" style="padding:4px 8px; font-size:11px;" onclick="deleteEntry(${l.id || 0}, '${(l.date||'').replace(/'/g, "\\'")}', ${parseFloat(l.amount)||0})">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="4" class="text-muted" style="text-align:center; padding:20px;">No handover entries recorded.</td></tr>';
}

window.deleteEntry = async function(id, date, amount) {
    if (confirm('Delete this ledger entry from the database?')) {
        try {
            await api('remove_account_node', { id, date, amount });
            await render();
        } catch (e) {
            alert('Failed to delete: ' + e.message);
        }
    }
};

form.onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
        await api('upsert_account_node', data);
        form.reset();
        if (form.date) form.date.value = new Date().toISOString().slice(0, 10);
        await render();
        msg.textContent = 'Handover entry saved to database!';
        setTimeout(() => msg.textContent = '', 3000);
    } catch (err) {
        alert('Error saving handover: ' + err.message);
    }
};

// Import Handover Ledger
if (importAccountsFile) {
    importAccountsFile.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                let count = 0;

                for (const r of rows) {
                    let d = r['Date'] || r['date'] || r['Handover Date'] || '';
                    let amt = parseFloat(r['Cash Amount (INR)'] || r['Amount'] || r['amount'] || 0);
                    let rem = r['Reference / Remarks'] || r['Remarks'] || r['remarks'] || '';

                    if (amt > 0) {
                        try {
                            await api('upsert_account_node', {
                                date: d || new Date().toISOString().slice(0, 10),
                                amount: amt,
                                remarks: rem
                            });
                            count++;
                        } catch(e) {}
                    }
                }

                await render();
                alert(`Successfully imported ${count} handover ledger entries to the database!`);
                importAccountsFile.value = '';
            } catch (err) {
                alert('Import Error: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };
}

// Export Handover Ledger
if (exportAccountsBtn) {
    exportAccountsBtn.onclick = function() {
        const ledger = cachedLedger || [];
        if (!ledger.length) return alert('No ledger records to export.');

        const ws = XLSX.utils.json_to_sheet(ledger);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Accounts Handover');
        XLSX.writeFile(wb, `Accounts_Handover_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
}

render();
