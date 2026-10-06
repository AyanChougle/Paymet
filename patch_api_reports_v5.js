const fs = require('fs');

// 1. api.js schema
let apiJs = fs.readFileSync('assets/js/api.js', 'utf8');
apiJs = apiJs.replace(/client_number: data\.client_number \|\| null,/, `client_number: data.client_number || null,
            email_id: data.email_id || null,
            pan_no: data.pan_no || null,
            aadhar_no: data.aadhar_no || null,
            state: data.state || null,`);
apiJs = apiJs.replace(/cash_sended: parseFloat\(data\.cash_sended \|\| 0\),/, '');
fs.writeFileSync('assets/js/api.js', apiJs);

// 2. admin.js importer
let adminJs = fs.readFileSync('assets/js/admin.js', 'utf8');
adminJs = adminJs.replace(/else if \(k\.includes\('ratio'\)\) dbData\.ratio = val;\n.*cash_sended = val;/, `else if (k.includes('ratio')) dbData.ratio = val;
                    else if (k.includes('email')) dbData.email_id = val;
                    else if (k.includes('pan')) dbData.pan_no = val;
                    else if (k.includes('aadhar')) dbData.aadhar_no = val;
                    else if (k.includes('state')) dbData.state = val;`);
adminJs = adminJs.replace(/if \(dbData\.cash_sended\) dbData\.cash_sended = cleanNum\(dbData\.cash_sended\);/, '');
fs.writeFileSync('assets/js/admin.js', adminJs);

// 3. reports.html
let reportsHtml = fs.readFileSync('reports.html', 'utf8');
reportsHtml = reportsHtml.replace(/<th>Client number<\/th>/, '<th>Client number</th><th>Email</th><th>PAN</th><th>Aadhar</th><th>State</th>');
reportsHtml = reportsHtml.replace(/<th>Cash Sended<\/th>\n*/, '');
fs.writeFileSync('reports.html', reportsHtml);

// 4. reports.js
let reportsJs = fs.readFileSync('assets/js/reports.js', 'utf8');
reportsJs = reportsJs.replace(/<td>\$\{x\.client_number \|\| ''\}<\/td>/, `<td>\${x.client_number || ''}</td>
        <td>\${x.email_id || ''}</td>
        <td>\${x.pan_no || ''}</td>
        <td>\${x.aadhar_no || ''}</td>
        <td>\${x.state || ''}</td>`);
reportsJs = reportsJs.replace(/<td>₹\$\{Number\(x\.cash_sended \|\| 0\)\.toLocaleString\('en-IN', \{minimumFractionDigits: 2\}\)\}<\/td>\n*/, '');

reportsJs = reportsJs.replace(/Ratio,Cash Sended,Received in/, 'Ratio,Email,PAN,Aadhar,State,Received in');
reportsJs = reportsJs.replace(/x\.ratio,\n\s*x\.cash_sended,/, `x.ratio,
            x.email_id,
            x.pan_no,
            x.aadhar_no,
            x.state,`);
fs.writeFileSync('assets/js/reports.js', reportsJs);

console.log('API and Reports patched for new client fields, cash_sended removed.');
