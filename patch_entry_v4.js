const fs = require('fs');

let html = fs.readFileSync('entry.html', 'utf8');
// Remove cash sended
html = html.replace(/<label>Cash Sended to Accounts<input name="cash_sended" type="number" step="0.01"><\/label>/, '');

// Add client extra details after Client Number
html = html.replace(/<label>Client Number<input name="client_number"><\/label>/, 
`<label>Client Number<input name="client_number"></label>
                <label>Email ID<input name="email_id" type="email"></label>
                <label>PAN No<input name="pan_no"></label>
                <label>Aadhar No<input name="aadhar_no"></label>
                <label>State<input name="state"></label>`);

fs.writeFileSync('entry.html', html);

let js = fs.readFileSync('assets/js/entry.js', 'utf8');
// Change dynamic fetching logic to support both pp_agents and pp_clients
js = js.replace(/const ecodeInput = f\.ecode;\nconst agentInput = f\.agent_name;/, `const ecodeInput = f.ecode;
const agentInput = f.agent_name;
const clientNameInput = f.client_name;
const clientNumInput = f.client_number;`);

js = js.replace(/function autofillFromDirectory\(key, value\) \{[\s\S]*?\}\n/, `
function autofillAgent(key, value) {
    if (!value) return;
    const mappings = JSON.parse(localStorage.getItem('pp_mappings') || '[]');
    const match = mappings.find(m => (m[key] || '').toLowerCase() === value.toLowerCase());
    if (match) {
        if (key !== 'ecode') f.ecode.value = match.ecode || '';
        if (key !== 'agent_name') f.agent_name.value = match.agent_name || '';
        f.ops_manager.value = match.ops_manager || '';
        f.tl.value = match.tl || '';
    }
}

function autofillClient(key, value) {
    if (!value) return;
    const clients = JSON.parse(localStorage.getItem('pp_clients') || '[]');
    const match = clients.find(c => (c[key] || '').toLowerCase() === value.toLowerCase());
    if (match) {
        if (key !== 'client_name') f.client_name.value = match.client_name || '';
        if (key !== 'client_number') f.client_number.value = match.client_number || '';
        f.email_id.value = match.email_id || '';
        f.pan_no.value = match.pan_no || '';
        f.aadhar_no.value = match.aadhar_no || '';
        f.state.value = match.state || '';
    }
}
`);

js = js.replace(/autofillFromDirectory\('ecode', ecodeInput\.value\.trim\(\)\);/, "autofillAgent('ecode', ecodeInput.value.trim());");
js = js.replace(/autofillFromDirectory\('agent_name', agentInput\.value\.trim\(\)\);/, "autofillAgent('agent_name', agentInput.value.trim());");

js += `
clientNameInput.addEventListener('input', () => {
    autofillClient('client_name', clientNameInput.value.trim());
});
clientNumInput.addEventListener('input', () => {
    autofillClient('client_number', clientNumInput.value.trim());
});
`;

fs.writeFileSync('assets/js/entry.js', js);
console.log('entry html and js patched');
