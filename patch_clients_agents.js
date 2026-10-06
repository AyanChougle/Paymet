const fs = require('fs');
let html = fs.readFileSync('clients_agents.html', 'utf8');

html = html.replace(/<label>Client Number<input name="client_number"><\/label>/, '<label>Client Number<input name="client_number"></label><label>Target (INR)<input name="target" type="number" step="0.01"></label>');
html = html.replace(/<th>Client Number<\/th>/, '<th>Client Number</th><th>Month Sales</th><th>Target</th>');

fs.writeFileSync('clients_agents.html', html);

let js = fs.readFileSync('assets/js/clients_agents.js', 'utf8');
js = js.replace(/<td>\$\{m\.client_number \|\| ''\}<\/td>/, `<td>\${m.client_number || ''}</td>
        <td>₹\${Number(m.monthSales || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td>₹\${Number(m.target || 0).toLocaleString('en-IN')}</td>`);
        
js = js.replace(/function getMappings\(\) \{/, `async function loadSales() {
    const j = await api('dashboard', {});
    const payments = j.rawPayments || [];
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    let mappings = getMappings();
    mappings.forEach(m => {
        m.monthSales = payments
            .filter(p => p.agent_name === m.agent_name && (p.payment_date||'').startsWith(currentMonth))
            .reduce((s, p) => s + (parseFloat(p.inr_amount) || 0), 0);
    });
    return mappings;
}

function getMappings() {`);

js = js.replace(/function render\(\) \{/, `async function render() {`);
js = js.replace(/const mappings = getMappings\(\);/, `const mappings = await loadSales();`);

fs.writeFileSync('assets/js/clients_agents.js', js);
console.log('clients_agents patched');
