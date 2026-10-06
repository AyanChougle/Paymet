const fs = require('fs');
const pages = ['entry.html', 'agents.html', 'clients.html', 'accounts.html', 'admin.html'];

pages.forEach(p => {
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        if (!content.includes('assets/js/auth.js')) {
            content = content.replace('<script src="assets/js/api.js"></script>', '<script src="assets/js/api.js"></script>\n    <script src="assets/js/auth.js"></script>');
            fs.writeFileSync(p, content);
            console.log('auth.js added to ' + p);
        }
    }
});
