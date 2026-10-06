const fs = require('fs');
const files = ['dashboard.html', 'entry.html', 'reports.html', 'admin.html'];
files.forEach(f => {
    let html = fs.readFileSync(f, 'utf8');
    // Replace admin link with admin link + clients_agents link
    html = html.replace(/<a href="admin.html"(.*?)>Admin<\/a>/g, '<a href="admin.html"$1>Admin</a><a href="clients_agents.html">Clients & Agents</a>');
    fs.writeFileSync(f, html);
});
console.log('Sidebar updated');
