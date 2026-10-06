const fs = require('fs');
let js = fs.readFileSync('assets/js/dashboard.js', 'utf8');

// Re-add Cash Sended to KPIs
js = js.replace(/\[\'INR\', \'₹\' \+ Number\(j\.kpis\.inr\)\.toLocaleString\(\'en-IN\', \{ minimumFractionDigits: 2 \}\)\]/g, 
`['INR', '₹' + Number(j.kpis.inr).toLocaleString('en-IN', { minimumFractionDigits: 2 })],
        ['Cash Sended', '₹' + Number(j.kpis.cash).toLocaleString('en-IN', { minimumFractionDigits: 2 })]`);

// Fix grid columns
js = js.replace(/kpis" style="grid-template-columns: repeat\(3, 1fr\);"/g, 'kpis"'); // Revert back to default 4 columns if it was changed in HTML, wait I changed it in HTML. Let me check.

// Also modify target logic to read from pp_mappings
js = js.replace(/target: 1000000/g, 'target: getTarget(type, name)');
js = js.replace(/const summaryMap = \{\};/g, `const mappings = JSON.parse(localStorage.getItem('pp_mappings') || '[]');
    const getTarget = (type, name) => {
        let m = null;
        if(type==='Agent') m = mappings.find(x => x.agent_name === name);
        if(type==='TL') m = mappings.find(x => x.tl === name);
        if(type==='OPS') m = mappings.find(x => x.ops_manager === name);
        return m && m.target ? parseFloat(m.target) : 0;
    };
    const summaryMap = {};`);

fs.writeFileSync('assets/js/dashboard.js', js);
console.log('dashboard.js patched');
