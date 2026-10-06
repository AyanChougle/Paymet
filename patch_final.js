const fs = require('fs');

// --- 1. ADMIN PAGE FIXES ---
let adminHtml = fs.readFileSync('admin.html', 'utf8');
adminHtml = adminHtml.replace(/<section class="grid">[\s\S]*?<\/section>/, `<section class="grid" id="adminKpis">
    <div class="stat"><small>Users</small><strong id="users">-</strong></div>
    <div class="stat"><small>Payments</small><strong id="payments">-</strong></div>
    <div class="stat"><small>Total USDT</small><strong id="aUsdt">-</strong></div>
    <div class="stat"><small>Total INR</small><strong id="aInr">-</strong></div>
    <div class="stat"><small>Cash Sended</small><strong id="aCash" style="color:var(--danger)">-</strong></div>
    <div class="stat"><small>Balance</small><strong id="aBal">-</strong></div>
</section>`);
fs.writeFileSync('admin.html', adminHtml);

let adminJs = fs.readFileSync('assets/js/admin.js', 'utf8');
// Inject logic to calculate cash and USDT
adminJs = adminJs.replace(/users\.textContent=j\.stats\.users;payments\.textContent=j\.stats\.payments;/, 
`users.textContent=j.stats.users;payments.textContent=j.stats.payments;
const dash = await api('dashboard', {});
const raw = dash.rawPayments || [];
let u = 0, i = 0;
raw.forEach(p => { u += (parseFloat(p.usdt)||0); i += (parseFloat(p.inr_amount)||0); });
const acc = JSON.parse(localStorage.getItem('pp_accounts')||'[]');
let c = 0;
acc.forEach(x => { c += (parseFloat(x.amount)||0); });
document.getElementById('aUsdt').textContent = u.toFixed(2);
document.getElementById('aInr').textContent = '₹' + i.toLocaleString('en-IN', {minimumFractionDigits:2});
document.getElementById('aCash').textContent = '₹' + c.toLocaleString('en-IN', {minimumFractionDigits:2});
document.getElementById('aBal').textContent = '₹' + (i - c).toLocaleString('en-IN', {minimumFractionDigits:2});
`);
fs.writeFileSync('assets/js/admin.js', adminJs);

// --- 2. DASHBOARD FIXES ---
let dashHtml = fs.readFileSync('dashboard.html', 'utf8');
dashHtml = dashHtml.replace(/<select id="monthFilter">/, '<select id="monthFilter" style="width:auto;">');
dashHtml = dashHtml.replace(/<input type="date" id="ftdDate".*?>/, '<input type="date" id="ftdDate" style="width:auto;" title="Select date for FTD (For The Day) calculation">');
dashHtml = dashHtml.replace(/<button id="apply">Apply Filter<\/button>/, '<button id="apply">Apply Filter</button><button id="clearBtn" class="ghost">Clear Filter</button>');
// Add targets to TL and Ops
dashHtml = dashHtml.replace(/<th>FTD<\/th>\s*<\/tr>\s*<\/thead>\s*<tbody id="tlTableBody">/g, '<th>FTD</th><th>Target</th></tr></thead><tbody id="tlTableBody">');
dashHtml = dashHtml.replace(/<th>FTD<\/th>\s*<\/tr>\s*<\/thead>\s*<tbody id="opsTableBody">/g, '<th>FTD</th><th>Target</th></tr></thead><tbody id="opsTableBody">');
fs.writeFileSync('dashboard.html', dashHtml);

let dashJs = fs.readFileSync('assets/js/dashboard.js', 'utf8');
dashJs = dashJs.replace(/tlHtml \+= `<tr>\n\s*<td>\$\{i \+ 1\}<\/td>\n\s*<td>\$\{s\.name\}<\/td>\n\s*<td>\$\{fmt\(s\.mtd\)\}<\/td>\n\s*<td>\$\{fmt\(s\.ftd\)\}<\/td>\n\s*<\/tr>`;/g, 
`const target = getTarget('TL', s.name);
        tlHtml += \`<tr>
            <td>\${i + 1}</td>
            <td>\${s.name}</td>
            <td>\${fmt(s.mtd)}</td>
            <td>\${fmt(s.ftd)}</td>
            <td>\${fmtNoDec(target)}</td>
        </tr>\`;`);

dashJs = dashJs.replace(/<td>\$\{fmt\(tlFtdTotal\)\}<\/td>\n\s*<\/tr>`;/g, 
`<td>\${fmt(tlFtdTotal)}</td>\n        <td>-</td>\n    </tr>\`;`);
dashJs = dashJs.replace(/colspan="4"/g, 'colspan="5"');

dashJs = dashJs.replace(/opsHtml \+= `<tr>\n\s*<td>\$\{i \+ 1\}<\/td>\n\s*<td>\$\{s\.name\}<\/td>\n\s*<td>\$\{fmt\(s\.mtd\)\}<\/td>\n\s*<td>\$\{fmt\(s\.ftd\)\}<\/td>\n\s*<\/tr>`;/g, 
`const target = getTarget('OPS', s.name);
        opsHtml += \`<tr>
            <td>\${i + 1}</td>
            <td>\${s.name}</td>
            <td>\${fmt(s.mtd)}</td>
            <td>\${fmt(s.ftd)}</td>
            <td>\${fmtNoDec(target)}</td>
        </tr>\`;`);

dashJs = dashJs.replace(/<td>\$\{fmt\(opsFtdTotal\)\}<\/td>\n\s*<\/tr>`;/g, 
`<td>\${fmt(opsFtdTotal)}</td>\n        <td>-</td>\n    </tr>\`;`);
fs.writeFileSync('assets/js/dashboard.js', dashJs);

// --- 3. ENTRY JS EMAIL AUTOFILL ---
let entryJs = fs.readFileSync('assets/js/entry.js', 'utf8');
if (!entryJs.includes('f.email_id.addEventListener')) {
    entryJs += `
f.email_id.addEventListener('input', () => {
    autofillClient('email_id', f.email_id.value.trim());
});
`;
    fs.writeFileSync('assets/js/entry.js', entryJs);
}

console.log('Admin KPIs, Dashboard Targets, and Email Autofill fixed!');
