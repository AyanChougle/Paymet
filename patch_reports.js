const fs = require('fs');
let html = fs.readFileSync('reports.html', 'utf8');

html = html.replace(/<title>.*<\/title>/, '<title>Payment Reports</title>');
html = html.replace(/Summary Reports/g, 'Payment Reports');

// Replace main content
html = html.replace(/<main class="main">[\s\S]*<\/main>/, `<main class="main">
        <header>
            <div>
                <p class="eyebrow">Reporting</p>
                <h1>Payment Reports</h1>
            </div>
        </header>
        <section class="panel filters">
            <input id="from" type="date">
            <input id="to" type="date">
            <input id="ops" placeholder="Ops Manager">
            <select id="mode">
                <option value="">All modes</option>
                <option>P2P</option>
                <option>D P2P</option>
            </select>
            <button id="apply">Filter</button>
            <button id="clear" class="ghost">Clear Filter</button>
            <button id="export">Export CSV</button>
        </section>
        <section class="panel">
            <div style="margin-bottom: 15px;">
                <label>Rows per page: 
                    <select id="pageSize" style="width: auto; display: inline-block;">
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </label>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>SRno.</th>
                            <th>Date</th>
                            <th>E-Code</th>
                            <th>Agent</th>
                            <th>TL</th>
                            <th>Ops</th>
                            <th>Client name</th>
                            <th>Client number</th>
                            <th>Payment mode</th>
                            <th>USDT</th>
                            <th>Divided by</th>
                            <th>INR amount</th>
                            <th>Ratio</th>
                            <th>Received in</th>
                        </tr>
                    </thead>
                    <tbody id="rows"></tbody>
                </table>
            </div>
            <div id="pagination" style="margin-top: 15px; display: flex; gap: 10px;">
                <button id="prevPage" class="ghost">Previous</button>
                <span id="pageInfo" style="padding-top: 10px;">Page 1</span>
                <button id="nextPage" class="ghost">Next</button>
            </div>
        </section>
    </main>`);

fs.writeFileSync('reports.html', html);
console.log('reports.html patched');
