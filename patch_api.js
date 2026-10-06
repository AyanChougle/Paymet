const fs = require('fs');
let js = fs.readFileSync('assets/js/api.js', 'utf8');

// Modify Dashboard logic in api.js to include Agent and TL stats
js = js.replace(/const ops = Object.keys\(opsMap\).*;/g, `
        const ops = Object.keys(opsMap).map(name => ({ name, inr: opsMap[name] })).sort((a,b)=>b.inr-a.inr);
        
        // Also add agent and TL maps
        const agentMap = {};
        const tlMap = {};
        filtered.forEach(p => {
            const inr = parseFloat(p.inr_amount);
            const agent = p.agent_name || 'Unassigned';
            const tl = p.tl || 'Unassigned';
            if(!agentMap[agent]) agentMap[agent] = 0;
            if(!tlMap[tl]) tlMap[tl] = 0;
            agentMap[agent] += inr;
            tlMap[tl] += inr;
        });
        const agents = Object.keys(agentMap).map(name => ({ name, inr: agentMap[name] })).sort((a,b)=>b.inr-a.inr);
        const tls = Object.keys(tlMap).map(name => ({ name, inr: tlMap[name] })).sort((a,b)=>b.inr-a.inr);
        
        // Let's also send back all filtered rows for monthly calculations on the frontend if needed
        return { success: true, kpis, daily, ops, modes, agents, tls, rawPayments: payments };
`);
fs.writeFileSync('assets/js/api.js', js);
console.log('api.js patched');
