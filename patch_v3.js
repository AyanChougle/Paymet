const fs = require('fs');

// 1. Sidebar Updates
const newSidebar = `<nav>
    <a href="dashboard.html">Dashboard</a>
    <a href="entry.html">Payment Entry</a>
    <a href="reports.html">Payment Reports</a>
    <a href="agents.html">Agents</a>
    <a href="clients.html">Clients</a>
    <a href="accounts.html">Accounts</a>
    <a href="admin.html">Admin</a>
</nav>`;

const htmlFiles = ['dashboard.html', 'entry.html', 'reports.html', 'admin.html', 'clients_agents.html'];
htmlFiles.forEach(f => {
    if(fs.existsSync(f)) {
        let html = fs.readFileSync(f, 'utf8');
        html = html.replace(/<nav>[\s\S]*?<\/nav>/, newSidebar);
        fs.writeFileSync(f, html);
    }
});

if(fs.existsSync('clients_agents.html')) {
    fs.renameSync('clients_agents.html', 'agents.html');
}

if(fs.existsSync('assets/js/clients_agents.js')) {
    fs.renameSync('assets/js/clients_agents.js', 'assets/js/agents.js');
}

// 2. Update Agents.html
let agentsHtml = fs.readFileSync('agents.html', 'utf8');
agentsHtml = agentsHtml.replace(/<title>.*<\/title>/, '<title>Agents Directory</title>');
agentsHtml = agentsHtml.replace(/<h1>Clients & Agents<\/h1>/, '<h1>Agents Directory</h1>');
// Remove client fields from agent form
agentsHtml = agentsHtml.replace(/<label>Client Name<input name="client_name"><\/label>/, '');
agentsHtml = agentsHtml.replace(/<label>Client Number<input name="client_number"><\/label>/, '');
agentsHtml = agentsHtml.replace(/<th>Client Number<\/th><th>Month Sales<\/th><th>Target<\/th>/, '<th>Month Sales</th><th>Target</th>');
agentsHtml = agentsHtml.replace(/<th>Client Name<\/th>/, '');
// Fix sidebar active
agentsHtml = agentsHtml.replace(/<a href="agents.html">Agents<\/a>/, '<a class="active" href="agents.html">Agents</a>');
fs.writeFileSync('agents.html', agentsHtml);

let agentsJs = fs.readFileSync('assets/js/agents.js', 'utf8');
agentsJs = agentsJs.replace(/<td>\$\{m\.client_name \|\| ''\}<\/td>/, '');
agentsJs = agentsJs.replace(/<td>\$\{m\.client_number \|\| ''\}<\/td>/, '');
fs.writeFileSync('assets/js/agents.js', agentsJs);

// 3. Create Clients.html
const clientsHtml = `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Clients Directory</title>
    <link rel="stylesheet" href="assets/css/app.css">
</head>
<body>
    <aside class="sidebar">
        <div class="brand">PAYMENT<span>PORTAL</span></div>
        ${newSidebar.replace('<a href="clients.html">Clients</a>', '<a class="active" href="clients.html">Clients</a>')}
    </aside>
    <main class="main">
        <header>
            <div>
                <p class="eyebrow">Directory</p>
                <h1>Clients Directory</h1>
            </div>
        </header>
        <section class="panel">
            <h2>Add New Client</h2>
            <form id="clientForm" class="form-grid">
                <label>Client Name<input name="client_name" required></label>
                <label>Client Number<input name="client_number" required></label>
                <label>Email ID<input name="email_id" type="email"></label>
                <label>PAN No<input name="pan_no"></label>
                <label>Aadhar No<input name="aadhar_no"></label>
                <label>State<input name="state"></label>
                <div class="wide">
                    <button type="submit">Save Client</button>
                    <span id="msg" style="margin-left: 12px; color: var(--accent);"></span>
                </div>
            </form>
        </section>
        <section class="panel">
            <h2>Client List</h2>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Number</th>
                            <th>Email</th>
                            <th>PAN</th>
                            <th>Aadhar</th>
                            <th>State</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="clientList"></tbody>
                </table>
            </div>
        </section>
    </main>
    <script src="assets/js/clients.js"></script>
</body>
</html>`;
fs.writeFileSync('clients.html', clientsHtml);

const clientsJs = `
const form = document.getElementById('clientForm');
const list = document.getElementById('clientList');
const msg = document.getElementById('msg');

function getClients() {
    return JSON.parse(localStorage.getItem('pp_clients') || '[]');
}

function saveClients(clients) {
    localStorage.setItem('pp_clients', JSON.stringify(clients));
}

function render() {
    const clients = getClients();
    list.innerHTML = clients.map((c, idx) => \`<tr>
        <td>\${c.client_name || ''}</td>
        <td>\${c.client_number || ''}</td>
        <td>\${c.email_id || ''}</td>
        <td>\${c.pan_no || ''}</td>
        <td>\${c.aadhar_no || ''}</td>
        <td>\${c.state || ''}</td>
        <td><button class="ghost" style="padding:4px 8px;" onclick="deleteClient(\${idx})">Delete</button></td>
    </tr>\`).join('') || '<tr><td colspan="7" class="muted">No clients found.</td></tr>';
}

window.deleteClient = function(idx) {
    if(confirm('Delete this client?')) {
        let clients = getClients();
        clients.splice(idx, 1);
        saveClients(clients);
        render();
    }
};

form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let clients = getClients();
    
    const existingIndex = clients.findIndex(c => c.client_number === data.client_number);
    if (existingIndex >= 0) {
        clients[existingIndex] = data;
        msg.textContent = 'Client updated!';
    } else {
        clients.push(data);
        msg.textContent = 'Client added!';
    }
    
    saveClients(clients);
    form.reset();
    render();
    setTimeout(() => msg.textContent = '', 3000);
};

render();
`;
fs.writeFileSync('assets/js/clients.js', clientsJs);

console.log('Sidebar, Agents, and Clients configured.');
