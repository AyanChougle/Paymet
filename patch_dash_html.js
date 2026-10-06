const fs = require('fs');

let html = fs.readFileSync('dashboard.html', 'utf8');

const newMain = `<main class="main">
        <header>
            <div>
                <p class="eyebrow">Overview</p>
                <h1>Dashboard</h1>
            </div>
            <div id="userBadge"></div>
        </header>
        <section class="filters">
            <select id="monthFilter">
                <option value="overall">Overall (All Time)</option>
                <!-- JS will populate months -->
            </select>
            <input type="date" id="ftdDate" title="Select date for FTD (For The Day) calculation">
            <button id="apply">Apply Filter</button>
            <button id="exportCsv">Export Reports</button>
        </section>
        
        <section class="grid" id="kpis"></section>
        
        <section class="panel">
            <div class="panel-head">
                <h2>Agents Sales Report</h2>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Agent Name</th>
                            <th>MTD / Overall (INR)</th>
                            <th>FTD (INR)</th>
                            <th>Target</th>
                        </tr>
                    </thead>
                    <tbody id="agentTableBody"></tbody>
                </table>
            </div>
        </section>

        <section class="two">
            <section class="panel">
                <div class="panel-head">
                    <h2>Team Leaders Report</h2>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>TL Name</th>
                                <th>MTD / Overall</th>
                                <th>FTD</th>
                            </tr>
                        </thead>
                        <tbody id="tlTableBody"></tbody>
                    </table>
                </div>
            </section>
            
            <section class="panel">
                <div class="panel-head">
                    <h2>Ops Managers Report</h2>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Ops Manager</th>
                                <th>MTD / Overall</th>
                                <th>FTD</th>
                            </tr>
                        </thead>
                        <tbody id="opsTableBody"></tbody>
                    </table>
                </div>
            </section>
        </section>
    </main>`;

html = html.replace(/<main class="main">[\s\S]*<\/main>/, newMain);
fs.writeFileSync('dashboard.html', html);

console.log('dashboard html patched with bifurcated tables');
