(function() {
    function initAuth() {
        const user = getCurrentUser();
        const currentPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

        // 1. Unauthenticated users must log in
        if (!user && currentPage !== 'login.html') {
            location.href = 'login.html';
            return;
        }

        // Normalize user role into one of the 3 defined platform roles
        let rawRole = (user && user.role ? user.role.toUpperCase().trim() : 'ENTRY_USER');
        if (rawRole === 'AGENT' || rawRole === 'TEAM_LEADER' || rawRole === 'ACCOUNTS' || rawRole === '') {
            rawRole = 'ENTRY_USER';
        }

        const isEntryUser = (rawRole === 'ENTRY_USER');
        const isOpsManager = (rawRole === 'OPS_MANAGER');
        const isAdmin = (rawRole === 'ADMIN');

        // 2. Default landing page per role
        const defaultHomePage = (isAdmin || isOpsManager) ? 'dashboard.html' : 'entry.html';

        if (user && (currentPage === 'login.html' || currentPage === 'index.html' || currentPage === '')) {
            location.replace(defaultHomePage);
            return;
        }

        if (!user) return; // Stop if unauthenticated on login.html

        // 3. Strict Page Access Guard (Immediately bounce unauthorized page visits)
        // Entry User: ONLY sees Payment Entry, Payment Reports, Agents, Clients. REST ARE BLOCKED.
        if (isEntryUser) {
            const allowedPages = ['entry.html', 'reports.html', 'agents.html', 'clients.html'];
            if (!allowedPages.includes(currentPage)) {
                location.replace('entry.html');
                return;
            }
        }

        // Ops Manager: Sees Dashboard, Revenue Overview, Entry, Reports, Agents, Clients. ACCOUNTS & ADMIN ARE BLOCKED.
        if (isOpsManager) {
            const blockedPages = ['accounts.html', 'admin.html'];
            if (blockedPages.includes(currentPage)) {
                location.replace('dashboard.html');
                return;
            }
        }

        // 4. Sidebar Navigation Links for the 3 Defined Roles
        const navLinks = [
            { id: 'nav-dash', href: 'dashboard.html', text: 'Dashboard', showFor: (isAdmin || isOpsManager) },
            { id: 'nav-revenue', href: 'revenue.html', text: 'Revenue Overview', showFor: (isAdmin || isOpsManager) },
            { id: 'nav-entry', href: 'entry.html', text: 'Payment Entry', showFor: true },
            { id: 'nav-reports', href: 'reports.html', text: 'Payment Reports', showFor: true },
            { id: 'nav-agents', href: 'agents.html', text: 'Agents', showFor: true },
            { id: 'nav-clients', href: 'clients.html', text: 'Clients', showFor: true },
            { id: 'nav-accounts', href: 'accounts.html', text: 'Accounts', showFor: isAdmin },
            { id: 'nav-admin', href: 'admin.html', text: 'Admin', showFor: isAdmin }
        ];

        // 5. Render Navigation in Sidebar
        const nav = document.querySelector('.sidebar nav');
        if (nav) {
            nav.innerHTML = navLinks
                .filter(item => item.showFor)
                .map(item => {
                    const isActive = currentPage === item.href.toLowerCase() ? 'class="active"' : '';
                    return `<a ${isActive} href="${item.href}">${item.text}</a>`;
                })
                .join('');
        }

        // 6. User Info & Logout Button in Sidebar Footer
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter && !document.getElementById('userLogoutWrap')) {
            const wrap = document.createElement('div');
            wrap.id = 'userLogoutWrap';
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.gap = '8px';
            wrap.style.marginBottom = '12px';

            const roleDisplay = isAdmin ? 'Admin' : (isOpsManager ? 'Ops Manager' : 'Entry User');

            wrap.innerHTML = `
                <div>
                    <label style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:700;">
                        Logged in as
                    </label>
                    <div style="font-size:13px; font-weight:600; color:var(--text); margin-top:2px;">${escapeHtml(user.name)}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(user.email)} &middot; <span style="color:var(--accent); font-weight:600;">${escapeHtml(roleDisplay)}</span></div>
                </div>
                <button id="logoutBtn" class="ghost danger" style="padding:6px; font-size:11.5px; width:100%; border-radius:4px; text-align:center;">Log Out</button>
            `;

            sidebarFooter.insertBefore(wrap, sidebarFooter.firstChild);

            document.getElementById('logoutBtn').onclick = async () => {
                try {
                    await api('logout', {});
                } catch(e) {}
                sessionStorage.removeItem('pp_user');
                location.href = 'login.html';
            };
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuth);
    } else {
        initAuth();
    }
})();

