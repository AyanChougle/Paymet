(function() {
    function initAuth() {
        const user = getCurrentUser();
        const currentPage = location.pathname.split('/').pop() || 'index.html';

        // 1. Role-based navigation visibility
        const nav = document.querySelector('.sidebar nav');
        if (nav) {
            const role = user.role || 'ADMIN';
            
            // Define access permissions
            // ENTRY_USER: Payment Entry, Payment Reports, Agents, Clients
            // OPS_MANAGER: Dashboard, Payment Entry, Payment Reports, Agents, Clients
            // ADMIN: All pages (Dashboard, Payment Entry, Payment Reports, Agents, Clients, Accounts, Admin)
            
            const navLinks = [
                { id: 'nav-dash', href: 'dashboard.html', text: 'Dashboard', roles: ['ADMIN', 'OPS_MANAGER'] },
                { id: 'nav-entry', href: 'entry.html', text: 'Payment Entry', roles: ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER'] },
                { id: 'nav-reports', href: 'reports.html', text: 'Payment Reports', roles: ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER'] },
                { id: 'nav-agents', href: 'agents.html', text: 'Agents', roles: ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER'] },
                { id: 'nav-clients', href: 'clients.html', text: 'Clients', roles: ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER'] },
                { id: 'nav-accounts', href: 'accounts.html', text: 'Accounts', roles: ['ADMIN'] },
                { id: 'nav-admin', href: 'admin.html', text: 'Admin', roles: ['ADMIN'] }
            ];

            nav.innerHTML = navLinks
                .filter(item => item.roles.includes(role))
                .map(item => {
                    const isActive = currentPage === item.href ? 'class="active"' : '';
                    return `<a ${isActive} href="${item.href}">${item.text}</a>`;
                })
                .join('');
        }

        // 2. Add Role Switcher in Sidebar Footer
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter && !document.getElementById('userSwitcherWrap')) {
            const users = JSON.parse(localStorage.getItem('pp_users') || '[]');
            const wrap = document.createElement('div');
            wrap.id = 'userSwitcherWrap';
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.gap = '4px';
            wrap.style.marginBottom = '6px';

            wrap.innerHTML = `
                <label style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:700;">
                    Active User (Role)
                </label>
                <select id="activeUserSelect" style="padding:6px 8px; font-size:11.5px; background:var(--surface); border:1px solid var(--line2); color:var(--text); border-radius:4px;">
                    ${users.map(u => `<option value="${u.id}" ${u.id === user.id ? 'selected' : ''}>${u.name} (${u.role})</option>`).join('')}
                </select>
            `;

            sidebarFooter.insertBefore(wrap, sidebarFooter.firstChild);

            const select = document.getElementById('activeUserSelect');
            select.onchange = async () => {
                await api('switch_user', { userId: select.value });
                location.reload();
            };
        }

        // 3. Page Access Guard
        if (user.role === 'ENTRY_USER' && (currentPage === 'dashboard.html' || currentPage === 'admin.html' || currentPage === 'accounts.html')) {
            location.href = 'entry.html';
        } else if (user.role === 'OPS_MANAGER' && (currentPage === 'admin.html' || currentPage === 'accounts.html')) {
            location.href = 'dashboard.html';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuth);
    } else {
        initAuth();
    }
})();
