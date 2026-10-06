const fs = require('fs');

let dash = fs.readFileSync('dashboard.html', 'utf8');
dash = dash.replace(/<section class="grid" id="kpis">/, '<section class="grid grid-3" id="kpis">');
fs.writeFileSync('dashboard.html', dash);

let admin = fs.readFileSync('admin.html', 'utf8');
admin = admin.replace(/<section class="grid" id="adminKpis">/, '<section class="grid grid-3" id="adminKpis">');
fs.writeFileSync('admin.html', admin);

console.log('grid-3 applied to dashboard and admin');
