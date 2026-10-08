(function() {
    function initAuth() {
        const user = getCurrentUser();
        const currentPage = location.pathname.split('/').pop() || 'index.html';

        if (!user && currentPage !== 'login.html') {
            location.href = 'login.html';
            return;
        }

        if (user && currentPage === 'login.html') {
            location.href = 'dashboard.html';
            return;
        }

        if (!user) return; // Stop executing if on login.html and not logged in

        // 1. Role-based navigation visibility
        const nav = document.querySelector('.sidebar nav');
        if (nav) {
            const role = user.role || 'ADMIN';
            
            // Define access permissions
            const navLinks = [
                { id: 'nav-dash', href: 'dashboard.html', text: 'Dashboard', roles: ['ADMIN', 'OPS_MANAGER'] },
                { id: 'nav-revenue', href: 'revenue.html', text: 'Revenue Overview', roles: ['ADMIN', 'OPS_MANAGER'] },
                { id: 'nav-entry', href: 'entry.html', text: 'Payment Entry', roles: ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER'] },
                { id: 'nav-reports', href: 'reports.html', text: 'Payment Reports', roles: ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER'] },
                { id: 'nav-agents', href: 'agents.html', text: 'Agents', roles: ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER'] },
                { id: 'nav-clients', href: 'clients.html', text: 'Clients', roles: ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER'] },
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

        // 2. Add User Info & Logout Button in Sidebar Footer
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter && !document.getElementById('userLogoutWrap')) {
            const wrap = document.createElement('div');
            wrap.id = 'userLogoutWrap';
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.gap = '8px';
            wrap.style.marginBottom = '12px';

            wrap.innerHTML = `
                <div>
                    <label style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:700;">
                        Logged in as
                    </label>
                    <div style="font-size:13px; font-weight:600; color:var(--text); margin-top:2px;">${user.name}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${user.email} &middot; <span style="color:var(--accent);">${user.role}</span></div>
                </div>
                <button id="logoutBtn" class="ghost danger" style="padding:6px; font-size:11.5px; width:100%; border-radius:4px; text-align:center;">Log Out</button>
            `;

            sidebarFooter.insertBefore(wrap, sidebarFooter.firstChild);

            document.getElementById('logoutBtn').onclick = () => {
                sessionStorage.removeItem('pp_user');
                location.href = 'login.html';
            };
        }

        // 3. Page Access Guard
        if (user.role === 'ENTRY_USER' && (currentPage === 'dashboard.html' || currentPage === 'revenue.html' || currentPage === 'admin.html' || currentPage === 'accounts.html')) {
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

