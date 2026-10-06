const fs = require('fs');
let html = fs.readFileSync('dashboard.html', 'utf8');

// Sidebar link rename
html = html.replace('Summary Reports', 'Payment Reports');

// Replace main content
html = html.replace(/<main class="main">[\s\S]*<\/main>/, `<main class="main">
        <header>
            <div>
                <p class="eyebrow">Overview</p>
                <h1>Dashboard</h1>
            </div>
            <div id="userBadge"></div>
        </header>
        <section class="filters">
            <input id="from" type="date">
            <input id="to" type="date">
            <button id="apply">Apply Filter</button>
            <button id="clear" class="ghost">Clear Filter</button>
            <button id="exportCsv">Export CSV</button>
        </section>
        <section class="grid" id="kpis" style="grid-template-columns: repeat(3, 1fr);"></section>
        
        <section class="panel">
            <div class="panel-head">
                <h2>Daily & Monthly Sales Summary (Agent, OPS, TL)</h2>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Name</th>
                            <th>Day Sales (INR)</th>
                            <th>Month Sales (INR)</th>
                            <th>Target</th>
                        </tr>
                    </thead>
                    <tbody id="summaryTableBody">
                    </tbody>
                </table>
            </div>
        </section>
        
        <section class="two">
            <section class="panel">
                <h2>Ops Manager</h2>
                <div id="ops"></div>
            </section>
            <section class="panel">
                <h2>Payment Mode</h2>
                <div id="modes"></div>
            </section>
        </section>
    </main>`);

fs.writeFileSync('dashboard.html', html);
console.log('dashboard.html patched');
