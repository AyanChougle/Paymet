const fs = require('fs');
let html = fs.readFileSync('entry.html', 'utf8');

// Sidebar link rename
html = html.replace('Summary Reports', 'Payment Reports');

// Remove ATL Name
html = html.replace(/<label>ATL Name<input\s+name="atl_name"><\/label>/g, '');

// Update Divided By default to 88
html = html.replace('name="divided_by" type="number" step="0.000001" value="1"', 'name="divided_by" type="number" step="0.000001" value="88"');

// Update Received In to a dropdown
html = html.replace(/<label>Received In<input\s+name="received_in"><\/label>/g, '<label>Received In<select name="received_in"><option>World of Crypto</option><option>Digital Verse</option></select></label>');

// Remove Cash Received
html = html.replace(/<label>Cash Received<input\s+name="cash_received" type="number" step="0.01"><\/label>/g, '');

// Insert Client Name and Client Number after TL
html = html.replace(/<label>TL<input\s+name="tl"><\/label>/g, '<label>TL<input name="tl"></label><label>Client Name<input name="client_name"></label><label>Client Number<input name="client_number"></label><label>Ratio<input name="ratio" type="number" step="0.01"></label>');

fs.writeFileSync('entry.html', html);
console.log('entry.html patched');
