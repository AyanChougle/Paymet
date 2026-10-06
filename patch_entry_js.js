const fs = require('fs');
let js = fs.readFileSync('assets/js/entry.js', 'utf8');

js += `
// Auto-fill logic
const mockEcodes = {
    'E001': { agent: 'John Doe', tl: 'Alice Smith', ops: 'Bob Manager' },
    'E002': { agent: 'Jane Roe', tl: 'Charlie Brown', ops: 'Diana Prince' }
};
f.ecode.addEventListener('input', () => {
    const data = mockEcodes[f.ecode.value.trim().toUpperCase()];
    if (data) {
        f.agent_name.value = data.agent;
        f.tl.value = data.tl;
        f.ops_manager.value = data.ops;
        f.client_name.value = data.agent; // Auto fill client name with agent name
    }
});
f.agent_name.addEventListener('input', () => {
    if (!f.client_name.value || f.client_name.value === f.agent_name.value.slice(0, -1)) {
        f.client_name.value = f.agent_name.value;
    }
});
`;
fs.writeFileSync('assets/js/entry.js', js);
console.log('entry.js patched');
