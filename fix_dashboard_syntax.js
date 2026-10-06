const fs = require('fs');
let js = fs.readFileSync('assets/js/dashboard.js', 'utf8');

// Replace all escaped backticks and escaped dollar signs
js = js.split('\\\\`').join('\`');
js = js.split('\\\\$').join('$');
js = js.split('\\\\n').join('\\n');

// Also re-add the clear button logic
js = js.replace(/apply\.onclick = load;/, `apply.onclick = load;
document.getElementById('clearBtn').onclick = () => {
    monthFilter.value = 'overall';
    ftdDate.value = new Date().toISOString().slice(0, 10);
    load();
};`);

fs.writeFileSync('assets/js/dashboard.js', js);
console.log('dashboard.js syntax fixed');
