const fs = require('fs');
let html = fs.readFileSync('entry.html', 'utf8');
html = html.replace(/<label>Ratio<input name="ratio" type="number" step="0.01"><\/label>/, '<label>Ratio<input name="ratio" type="number" step="0.01"></label><label>Cash Sended to Accounts<input name="cash_sended" type="number" step="0.01"></label>');
fs.writeFileSync('entry.html', html);

let apiJs = fs.readFileSync('assets/js/api.js', 'utf8');
apiJs = apiJs.replace(/ratio: data\.ratio \|\| null,/, 'ratio: data.ratio || null,\n            cash_sended: parseFloat(data.cash_sended || 0),');
fs.writeFileSync('assets/js/api.js', apiJs);

let reportsHtml = fs.readFileSync('reports.html', 'utf8');
reportsHtml = reportsHtml.replace(/<th>Ratio<\/th>/, '<th>Ratio</th>\n                            <th>Cash Sended</th>');
fs.writeFileSync('reports.html', reportsHtml);

let reportsJs = fs.readFileSync('assets/js/reports.js', 'utf8');
reportsJs = reportsJs.replace(/<td>\${x\.ratio \|\| ''}<\/td>/, '<td>${x.ratio || \'\'}</td>\n        <td>₹${Number(x.cash_sended || 0).toLocaleString(\'en-IN\', {minimumFractionDigits: 2})}</td>');
reportsJs = reportsJs.replace(/Ratio,Received in/, 'Ratio,Cash Sended,Received in');
reportsJs = reportsJs.replace(/x\.ratio,/, 'x.ratio,\n            x.cash_sended,');
fs.writeFileSync('assets/js/reports.js', reportsJs);

let adminJs = fs.readFileSync('assets/js/admin.js', 'utf8');
adminJs = adminJs.replace(/else if \(k\.includes\('ratio'\)\) dbData\.ratio = val;/, 'else if (k.includes(\'ratio\')) dbData.ratio = val;\n                    else if (k.includes(\'cash sended\') || k.includes(\'accounts\')) dbData.cash_sended = val;');
adminJs = adminJs.replace(/if \(dbData\.cash_received\) dbData\.cash_received = cleanNum\(dbData\.cash_received\);/, 'if (dbData.cash_sended) dbData.cash_sended = cleanNum(dbData.cash_sended);');
fs.writeFileSync('assets/js/admin.js', adminJs);
console.log('All cash sended references patched');
