# Payment Portal & Executive Sales Analytics

A luxury fintech payment operations portal and real-time sales performance tracking system designed for cryptocurrency (USDT) to INR conversions, client onboarding, and team target management.

---

## Systematic Architecture & Modules

```
payment-portal/
├── index.html            # Entry gateway & automatic role-based redirect
├── dashboard.html        # Executive Sales & Target Analytics (Summary Reports)
├── entry.html            # Daily Payment Entry Form (Auto-Fetch Enabled)
├── reports.html          # Payment Sheet Records & Filterable Ledger (CSV Export)
├── agents.html           # Agents Directory & Hierarchy Mapping (E-Code, TL, Ops)
├── clients.html          # Clients Directory & Paid Clients Breakdown (Sheet 3)
├── accounts.html         # Cash Handover Ledger & USDT Conversion Balance
├── admin.html            # System Admin, Target Management & Excel/CSV Importer
│
├── assets/
│   ├── css/
│   │   └── app.css       # Unified Modern Dark/Light Design System & Zero-Overflow
│   └── js/
│       ├── theme.js      # Global Theme Switcher (Dark / Light)
│       ├── api.js        # Local Database Engine & Mock API Layer
│       ├── auth.js       # Dynamic Role-Based Access Guard & User Switcher
│       ├── dashboard.js  # Leaderboards, Bifurcations, and Target Evaluator
│       ├── entry.js      # Dual Auto-Fetch & Instant INR Calculation
│       ├── reports.js    # Client-Side Pagination, Filtering & CSV Exporter
│       ├── agents.js     # Agent Directory & Monthly Sales Aggregator
│       ├── clients.js    # Client Directory & Paid Clients Report Generator
│       ├── accounts.js   # Cash Handover Tracking & Balance Calculation
│       └── admin.js      # Target Configurator, Excel Importer & User Control
│
└── sql/
    └── schema.sql        # MySQL Relational Schema
```

---

## Role Permissions Matrix

| Module / Page | Entry User (`ENTRY_USER`) | Ops Manager (`OPS_MANAGER`) | Admin (`ADMIN`) |
| :--- | :---: | :---: | :---: |
| **Sales & Target Dashboard** | Restricted | Full View | Full View |
| **Payment Entry Form** | Access | Access | Access |
| **Payment Reports (Sheet)** | Access | Access | Access |
| **Agents Directory** | Manage | View Only | Manage |
| **Clients Directory** | Manage | View Only | Manage |
| **Accounts Handover** | Restricted | Restricted | Access & Manage |
| **Admin Panel & Targets** | Restricted | Restricted | Full Control |

---

## Key Features & Excel Workbooks Alignment

1. **Dashboard & Performance Reports (Sheet 1):**
   * **Agents Performance Report:** Rank, Emp Code, Agent Name, MTD Sales, FTD Sales.
   * **Team Leaders Report:** Rank, TL Name, MTD Sales, FTD Sales, Target, Status.
   * **Ops Managers Report:** Rank, Ops Manager, TL Teams Count, MTD Sales, FTD Sales, Target, Status.
   * **Strict Target Status Color Logic:**
     * **Green (`MET`):** When sales meet or exceed the target.
     * **Red (`BEHIND`):** When sales are below target near the end of the month (day 20+).
     * **Amber (`IN PROGRESS`):** For mid-month progress pace.
   * **Payment Bifurcations (Sheet 4):** P2P vs D P2P volume and INR sums.
   * **Company Split (Sheet 3):** Digital Verse (DV) vs World of Crypto (WK).

2. **Payment Entry Automation:**
   * **Agent Autofill:** Typing E-Code or Agent Name fills Ops Manager and TL.
   * **Client Autofill:** Typing Phone Number, Name, or Email fills PAN, Aadhar, and State.
   * **Live Calculation:** USDT $\times$ Exchange Rate (Divided By) $=$ Total INR.

3. **Audit Tracking:**
   * Every transaction records the creator's name, email, and exact timestamp.
   * Last transaction summary banner displayed at the top of the dashboard.
   * Detailed `Entered By` and `Entry Time` columns in Payment Reports.

4. **Zero-Overflow UI & Theme System:**
   * Pure dark obsidian theme with neon green accents (`#b8ff3d`).
   * High-contrast light theme with emerald green accents (`#10b981`).
   * No horizontal page scrollbar; tables scroll within dedicated responsive containers.
