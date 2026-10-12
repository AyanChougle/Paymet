<?php
// ========================================================
// SECURITY HEADERS & CORS HARDENING
// ========================================================
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$httpHost = $_SERVER['HTTP_HOST'] ?? '';

// Restrict CORS safely (never allow wildcard with credentials)
if (!empty($origin)) {
    $originHost = parse_url($origin, PHP_URL_HOST);
    // Allow same host or subdomain
    if ($originHost === $httpHost || (strpos($httpHost, ':') !== false && $originHost === explode(':', $httpHost)[0])) {
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Credentials: true');
    }
} else {
    // If no Origin header (same-origin request), set safe defaults
    header('Access-Control-Allow-Origin: *');
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// ========================================================
// SECURE SESSION CONFIGURATION
// ========================================================
if (session_status() === PHP_SESSION_NONE) {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443)
        || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

    session_set_cookie_params([
        'lifetime' => 86400, // 24 hours
        'path' => '/',
        'httponly' => true,  // Prevent JavaScript cookie theft
        'secure' => $isHttps, // Enable Secure flag on HTTPS
        'samesite' => 'Lax'  // CSRF protection
    ]);
    session_start();
}

// ========================================================
// DATABASE CONFIGURATION & SECURE CONNECTION
// ========================================================
$db_host = 'localhost';
$db_user = 'u303154098_ZtY2h';
$db_pass = 'PortalPass@2026';
$db_name = 'u303154098_o3Qhw';

// Optional config override
if (file_exists(__DIR__ . '/config.php')) {
    $cfg = include __DIR__ . '/config.php';
    if (is_array($cfg)) {
        if (!empty($cfg['user'])) $db_user = $cfg['user'];
        if (!empty($cfg['pass'])) $db_pass = $cfg['pass'];
        if (!empty($cfg['name'])) $db_name = $cfg['name'];
        if (!empty($cfg['host'])) $db_host = $cfg['host'];
    }
}

function out($data) {
    echo json_encode(array_merge(['success' => true], $data), JSON_UNESCAPED_SLASHES);
    exit;
}

function err($msg, $statusCode = 400) {
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_SLASHES);
    exit;
}

$pdo = null;
$lastError = '';
foreach (['localhost', '127.0.0.1'] as $h) {
    try {
        $pdo = new PDO("mysql:host=$h;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false // Real prepared statements (anti-SQLi)
        ]);
        break;
    } catch (PDOException $e) {
        $lastError = $e->getMessage();
    }
}

if (!$pdo) {
    error_log("Database Connection Failed: " . $lastError);
    err('Database Connection Failed. Please contact administrator.', 500);
}

// ========================================================
// AUTHENTICATION & ACCESS CONTROL HELPERS (RBAC)
// ========================================================
function require_auth() {
    if (empty($_SESSION['pp_user']) || empty($_SESSION['pp_user']['id'])) {
        err('Authentication required. Please log in.', 401);
    }
    return $_SESSION['pp_user'];
}

function require_role(array $allowedRoles) {
    $u = require_auth();
    $role = strtoupper($u['role'] ?? 'ENTRY_USER');
    if (!in_array($role, $allowedRoles, true)) {
        err('Forbidden: You do not have permission to perform this action.', 403);
    }
    return $u;
}

// Rate Limiting on Login (Brute Force Protection)
function check_login_rate_limit() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $key = 'login_ratelimit_' . md5($ip);
    $now = time();
    $data = $_SESSION[$key] ?? ['count' => 0, 'first_attempt' => $now, 'locked_until' => 0];

    if ($data['locked_until'] > $now) {
        $rem = $data['locked_until'] - $now;
        err("Too many failed login attempts. Please wait $rem seconds before trying again.", 429);
    }

    if ($now - $data['first_attempt'] > 900) {
        $_SESSION[$key] = ['count' => 0, 'first_attempt' => $now, 'locked_until' => 0];
    }
}

function record_failed_login() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $key = 'login_ratelimit_' . md5($ip);
    $now = time();
    $data = $_SESSION[$key] ?? ['count' => 0, 'first_attempt' => $now, 'locked_until' => 0];
    $data['count']++;
    if ($data['count'] >= 5) {
        $data['locked_until'] = $now + 180; // 3 minute lock
    }
    $_SESSION[$key] = $data;
}

function clear_login_rate_limit() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $key = 'login_ratelimit_' . md5($ip);
    unset($_SESSION[$key]);
}

// Input sanitizer helper
function clean_str($val, $maxLen = 255) {
    if ($val === null) return '';
    $val = trim((string)$val);
    $val = strip_tags($val);
    if ($maxLen > 0 && mb_strlen($val) > $maxLen) {
        $val = mb_substr($val, 0, $maxLen);
    }
    return $val;
}

// ========================================================
// REQUEST ROUTING
// ========================================================
$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents('php://input'), true) ?: [];

try {

// 1. LOGIN (PUBLIC - RATE LIMITED & BRUTE-FORCE PROTECTED)
if ($action === 'login') {
    check_login_rate_limit();

    $input = clean_str($data['email'] ?? $data['username'] ?? '', 150);
    $pass = (string)($data['password'] ?? '');

    if (empty($input) || empty($pass)) {
        record_failed_login();
        err('Email/Username and Password are required.');
    }

    // Check pp_users table dynamically
    $u = null;
    try {
        $stmt = $pdo->prepare("SELECT 
            id, 
            COALESCE(NULLIF(name, ''), NULLIF(full_name, ''), username) AS name, 
            COALESCE(NULLIF(email, ''), username) AS email, 
            COALESCE(NULLIF(password, ''), password_hash) AS pwd,
            role,
            COALESCE(active, is_active, 1) AS is_active
        FROM pp_users 
        WHERE (LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?) OR LOWER(name) = LOWER(?) OR LOWER(full_name) = LOWER(?)) 
        LIMIT 1");
        $stmt->execute([$input, $input, $input, $input]);
        $u = $stmt->fetch();
    } catch (Exception $e) {
        $stmt = $pdo->prepare("SELECT id, name, email, password AS pwd, role, 1 AS is_active FROM pp_users WHERE (LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?)) LIMIT 1");
        $stmt->execute([$input, $input]);
        $u = $stmt->fetch();
    }

    // Bootstrap initial admin ONLY if pp_users is completely empty (zero users)
    if (!$u) {
        $totalUsers = 0;
        try {
            $totalUsers = (int)$pdo->query("SELECT COUNT(*) FROM pp_users")->fetchColumn();
        } catch (Exception $e) {}

        if ($totalUsers === 0 && strtolower($input) === 'admin@portal.com') {
            $hashed = password_hash($pass, PASSWORD_DEFAULT);
            try {
                $pdo->prepare("INSERT INTO pp_users (name, email, password, role, active) VALUES (?, ?, ?, 'ADMIN', 1)")
                    ->execute(['System Admin', 'admin@portal.com', $hashed]);
                $u = [
                    'id' => (int)$pdo->lastInsertId(),
                    'name' => 'System Admin',
                    'email' => 'admin@portal.com',
                    'pwd' => $hashed,
                    'role' => 'ADMIN',
                    'is_active' => 1
                ];
            } catch (Exception $e) {}
        }
    }

    if ($u) {
        if (!empty($u['is_active']) && (int)$u['is_active'] === 0) {
            record_failed_login();
            err('Account is deactivated. Please contact an administrator.');
        }

        $storedPwd = $u['pwd'] ?? '';
        $valid = false;

        if (password_verify($pass, $storedPwd)) {
            $valid = true;
        } elseif ($pass === $storedPwd && !empty($storedPwd)) {
            // Transparently upgrade legacy plaintext password to secure bcrypt hash
            $valid = true;
            try {
                $newHash = password_hash($pass, PASSWORD_DEFAULT);
                $pdo->prepare("UPDATE pp_users SET password = ? WHERE id = ?")->execute([$newHash, $u['id']]);
            } catch (Exception $e) {}
        }

        if ($valid) {
            clear_login_rate_limit();
            session_regenerate_id(true); // Prevent session fixation

            unset($u['pwd'], $u['is_active']);
            $u['id'] = (int)$u['id'];
            $u['role'] = strtoupper($u['role'] ?? 'ENTRY_USER');

            $_SESSION['pp_user'] = $u;
            out(['user' => $u]);
        }
    }

    record_failed_login();
    err('Invalid email or password.');
}

// 2. LOGOUT (AUTHENTICATED)
if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    out(['success' => true]);
}

// 3. GET CURRENT USER (PUBLIC / SESSION CHECK)
if ($action === 'get_current_user') {
    $u = $_SESSION['pp_user'] ?? null;
    $users = [];
    // Only return user directory if current user is an authenticated ADMIN
    if ($u && strtoupper($u['role'] ?? '') === 'ADMIN') {
        try {
            $users = $pdo->query("SELECT id, COALESCE(NULLIF(name, ''), full_name) AS name, COALESCE(NULLIF(email, ''), username) AS email, role FROM pp_users ORDER BY id ASC")->fetchAll();
        } catch(Exception $e) {}
    }
    out(['user' => $u, 'users' => $users]);
}

// 4. DASHBOARD & REPORTS (REQUIRES AUTH)
if ($action === 'dashboard' || $action === 'reports') {
    require_auth();

    $raw = $pdo->query("SELECT * FROM pp_payments ORDER BY payment_date ASC, id ASC")->fetchAll();
    $payments = [];
    foreach ($raw as $r) {
        $usdt = floatval($r['usdt'] ?? 0);
        $inr = floatval($r['inr_amount'] ?? $r['inr'] ?? $r['amount'] ?? 0);
        $div = floatval($r['divided_by'] ?? ($usdt > 0 ? round($inr / $usdt, 2) : 88));
        if ($inr <= 0 && $usdt > 0) $inr = round($usdt * $div, 2);

        $payments[] = [
            'id' => (int)($r['id'] ?? 0),
            'payment_date' => $r['payment_date'] ?? date('Y-m-d'),
            'ecode' => $r['ecode'] ?? $r['e_code'] ?? $r['emp_id'] ?? '',
            'agent_name' => $r['agent_name'] ?? $r['name'] ?? 'Unassigned Agent',
            'tl' => $r['tl'] ?? $r['tl_name'] ?? $r['team_leader'] ?? '',
            'ops_manager' => $r['ops_manager'] ?? '',
            'client_name' => $r['client_name'] ?? '',
            'client_number' => $r['client_number'] ?? '',
            'email_id' => $r['email_id'] ?? '',
            'payment_mode' => $r['payment_mode'] ?? 'P2P',
            'usdt' => $usdt,
            'divided_by' => $div,
            'inr_amount' => $inr,
            'ratio' => $r['ratio'] ?? '',
            'pan_no' => $r['pan_no'] ?? '',
            'aadhar_no' => $r['aadhar_no'] ?? '',
            'state' => $r['state'] ?? '',
            'received_in' => $r['received_in'] ?? $r['received_company'] ?? 'Digital Verse',
            'remarks' => $r['remarks'] ?? '',
            'created_by_name' => $r['created_by_name'] ?? $r['entered_by'] ?? 'System',
            'created_at' => $r['created_at'] ?? $r['entry_timestamp'] ?? ($r['payment_date'] ?? '')
        ];
    }
    $lastEntry = count($payments) > 0 ? $payments[count($payments) - 1] : null;
    out(['rawPayments' => $payments, 'lastEntry' => $lastEntry, 'rows' => $payments]);
}

// 5. AGENTS DIRECTORY (REQUIRES AUTH)
if ($action === 'agents') {
    require_auth();

    $rawAgents = $pdo->query("SELECT * FROM pp_agents ORDER BY id ASC")->fetchAll();
    $agents = [];
    foreach ($rawAgents as $r) {
        $agents[] = [
            'id' => (int)($r['id'] ?? 0),
            'ecode' => $r['ecode'] ?? $r['emp_id'] ?? $r['e_code'] ?? '',
            'agent_name' => $r['agent_name'] ?? $r['name'] ?? '',
            'ops_manager' => $r['ops_manager'] ?? '',
            'tl' => $r['tl'] ?? $r['team_leader'] ?? $r['tl_name'] ?? ''
        ];
    }

    $rawOps = $pdo->query("SELECT * FROM pp_ops_managers ORDER BY id ASC")->fetchAll();
    $ops = [];
    foreach ($rawOps as $r) {
        $ops[] = [
            'id' => (int)($r['id'] ?? 0),
            'ecode' => $r['emp_id'] ?? $r['ecode'] ?? '',
            'name' => $r['name'] ?? '',
            'reporting_to' => $r['reporting_level_1'] ?? $r['reporting_to'] ?? '',
            'monthly_target' => floatval($r['monthly_target'] ?? $r['target'] ?? 0)
        ];
    }

    $rawTls = $pdo->query("SELECT * FROM pp_team_leaders ORDER BY id ASC")->fetchAll();
    $tls = [];
    foreach ($rawTls as $r) {
        $tls[] = [
            'id' => (int)($r['id'] ?? 0),
            'ecode' => $r['emp_id'] ?? $r['ecode'] ?? '',
            'name' => $r['name'] ?? '',
            'ops_manager' => $r['reporting_level_1'] ?? $r['ops_manager'] ?? '',
            'reporting_to' => $r['reporting_level_1'] ?? $r['ops_manager'] ?? '',
            'monthly_target' => floatval($r['monthly_target'] ?? $r['target'] ?? 0)
        ];
    }

    out(['agents' => $agents, 'ops_managers' => $ops, 'team_leaders' => $tls, 'rows' => $agents]);
}

// 6. CLIENTS DIRECTORY & KYC (REQUIRES AUTH)
if ($action === 'clients') {
    require_auth();

    $clients = $pdo->query("SELECT id, client_name, client_number, email_id, pan_no, aadhar_no, created_at FROM pp_clients ORDER BY id DESC")->fetchAll();
    out(['rows' => $clients]);
}

// 7. ADMIN STATS & USER MANAGEMENT (REQUIRES ADMIN ROLE)
if ($action === 'admin') {
    require_role(['ADMIN']);

    $users = [];
    try {
        $rawUsers = $pdo->query("SELECT * FROM pp_users ORDER BY id ASC")->fetchAll();
        foreach ($rawUsers as $r) {
            $fName = trim($r['full_name'] ?? $r['name'] ?? '');
            $uName = trim($r['username'] ?? '');
            $eMail = trim($r['email'] ?? '');

            $email = $eMail ?: ($fName && strpos($fName, '@') !== false ? $fName : $uName);
            $name = $fName ?: ($uName ?: 'User');

            $users[] = [
                'id' => (int)$r['id'],
                'name' => ucwords($name),
                'email' => strtolower($email),
                'username' => strtolower($uName ?: explode('@', $email)[0]),
                'role' => strtoupper($r['role'] ?? 'ENTRY_USER'),
                'created_at' => $r['created_at'] ?? null
            ];
        }
    } catch(Exception $e) {}

    $paymentsCount = (int)$pdo->query("SELECT COUNT(*) FROM pp_payments")->fetchColumn();
    out(['users' => $users, 'stats' => ['users' => count($users), 'payments' => $paymentsCount]]);
}

// 8. CREATE PAYMENT (REQUIRES AUTH)
if ($action === 'create_payment') {
    $curUser = require_auth();

    $pDate = clean_str($data['payment_date'] ?? date('Y-m-d'), 20);
    $agent = clean_str($data['agent_name'] ?? 'Unassigned Agent', 150);
    $usdt = abs(floatval($data['usdt'] ?? 0));
    $div = abs(floatval($data['divided_by'] ?? 88));
    if ($div == 0) $div = 88;
    $inr = abs(floatval($data['inr_amount'] ?? 0));
    if ($inr <= 0 && $usdt > 0) $inr = round($usdt * $div, 2);

    // Creator is stamped from authenticated session
    $creator = $curUser['name'] ?? 'Staff';
    $mode = clean_str($data['payment_mode'] ?? 'P2P', 50);
    $recIn = clean_str($data['received_in'] ?? $data['received_company'] ?? 'Digital Verse', 100);

    $ecode = clean_str($data['ecode'] ?? '', 50);
    $tl = clean_str($data['tl'] ?? '', 150);
    $ops = clean_str($data['ops_manager'] ?? '', 150);
    $cName = clean_str($data['client_name'] ?? '', 150);
    $cNum = clean_str($data['client_number'] ?? '', 50);
    $email = clean_str($data['email_id'] ?? '', 150);
    $ratio = clean_str($data['ratio'] ?? '', 50);
    $pan = strtoupper(clean_str($data['pan_no'] ?? '', 30));
    $aadhar = clean_str($data['aadhar_no'] ?? '', 30);
    $state = clean_str($data['state'] ?? '', 100);

    try {
        $stmt = $pdo->prepare("INSERT INTO pp_payments 
            (payment_date, e_code, agent_name, tl_name, ops_manager, client_name, client_number, email_id, payment_mode, usdt, inr_amount, ratio, pan_no, aadhar_no, state, received_company, entered_by, entry_timestamp) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
        $stmt->execute([
            $pDate, $ecode ?: null, $agent, $tl ?: null, $ops ?: null,
            $cName ?: null, $cNum ?: null, $email ?: null,
            $mode, $usdt, $inr, $ratio ?: null,
            $pan ?: null, $aadhar ?: null, $state ?: null,
            $recIn, $creator
        ]);
        out(['id' => (int)$pdo->lastInsertId()]);
    } catch (Exception $e1) {
        try {
            $stmt = $pdo->prepare("INSERT INTO pp_payments 
                (payment_date, ecode, agent_name, tl, ops_manager, client_name, client_number, email_id, payment_mode, usdt, inr_amount, ratio, pan_no, aadhar_no, state, received_in, created_by_name, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
            $stmt->execute([
                $pDate, $ecode ?: null, $agent, $tl ?: null, $ops ?: null,
                $cName ?: null, $cNum ?: null, $email ?: null,
                $mode, $usdt, $inr, $ratio ?: null,
                $pan ?: null, $aadhar ?: null, $state ?: null,
                $recIn, $creator
            ]);
            out(['id' => (int)$pdo->lastInsertId()]);
        } catch (Exception $e2) {
            error_log("Create Payment Error: " . $e2->getMessage());
            err('Failed to record payment in database.');
        }
    }
}

// 9. CREATE USER (REQUIRES ADMIN ROLE)
if ($action === 'create_user') {
    require_role(['ADMIN']);

    $name = clean_str($data['name'] ?? $data['full_name'] ?? '', 100);
    $email = strtolower(clean_str($data['email'] ?? '', 150));
    $password = (string)($data['password'] ?? '');
    $role = strtoupper(clean_str($data['role'] ?? 'ENTRY_USER', 30));

    if (empty($name) || empty($email)) {
        err('Full Name and Email Address are required.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        err('Please provide a valid email address.');
    }
    if (strlen($password) < 6) {
        err('Password must be at least 6 characters long.');
    }

    if (!in_array($role, ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER'], true)) {
        $role = 'ENTRY_USER';
    }

    $passHash = password_hash($password, PASSWORD_DEFAULT);
    $username = explode('@', $email)[0];

    // Check duplicate
    try {
        $chk = $pdo->prepare("SELECT id FROM pp_users WHERE LOWER(email) = LOWER(?) LIMIT 1");
        $chk->execute([$email]);
        if ($chk->fetchColumn()) {
            err('A user with this email address already exists.');
        }
    } catch(Exception $e) {}

    $created = false;
    $lastErr = '';

    // Insert user with prepared statement
    try {
        $stmt = $pdo->prepare("INSERT INTO pp_users (name, email, password, role, active) VALUES (?, ?, ?, ?, 1)");
        $stmt->execute([$name, $email, $passHash, $role]);
        $created = true;
    } catch (Exception $e) {
        try {
            $stmt = $pdo->prepare("INSERT INTO pp_users (username, full_name, email, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?, 1)");
            $stmt->execute([$username, $name, $email, $role, $passHash]);
            $created = true;
        } catch (Exception $e2) {
            $lastErr = $e2->getMessage();
        }
    }

    if ($created) {
        out(['id' => (int)$pdo->lastInsertId()]);
    } else {
        error_log("Create User Error: " . $lastErr);
        err('Failed to create user.');
    }
}

// 10. DELETE USER (REQUIRES ADMIN ROLE)
if ($action === 'delete_user') {
    $me = require_role(['ADMIN']);
    $userId = (int)($data['userId'] ?? 0);
    if ($userId <= 0) err('Invalid user ID.');

    // Prevent admin from deleting themselves while active
    if ($userId === (int)$me['id']) {
        err('You cannot delete your own active administrator account.');
    }

    $stmt = $pdo->prepare("DELETE FROM pp_users WHERE id = ?");
    $stmt->execute([$userId]);
    out(['success' => true]);
}

// 11. HIERARCHY MANAGEMENT (REQUIRES ADMIN OR OPS_MANAGER)
if ($action === 'upsert_ops_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $id = (int)($data['id'] ?? 0);
    $prevName = clean_str($data['prev_name'] ?? '', 150);
    $name = clean_str($data['name'] ?? '', 150);
    if (!$name) err('Ops Manager name is required.');
    $ecode = clean_str($data['ecode'] ?? '', 50);
    $rep = clean_str($data['reporting_to'] ?? '', 150);
    $target = max(0, floatval($data['target'] ?? 0));

    $foundId = null;
    if ($id > 0) {
        $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE id = ?");
        $st->execute([$id]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId && $prevName) {
        $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(name)) = LOWER(?)");
        $st->execute([$prevName]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId) {
        $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(name)) = LOWER(?)");
        $st->execute([$name]);
        $foundId = $st->fetchColumn();
    }

    if ($foundId) {
        $stmt = $pdo->prepare("UPDATE pp_ops_managers SET emp_id=?, name=?, reporting_level_1=?, monthly_target=? WHERE id=?");
        $stmt->execute([$ecode, $name, $rep, $target, $foundId]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO pp_ops_managers (emp_id, name, reporting_level_1, monthly_target) VALUES (?, ?, ?, ?)");
        $stmt->execute([$ecode, $name, $rep, $target]);
    }

    if ($prevName && strcasecmp($prevName, $name) !== 0) {
        $pdo->prepare("UPDATE pp_team_leaders SET reporting_level_1 = ? WHERE LOWER(TRIM(reporting_level_1)) = LOWER(?)")->execute([$name, $prevName]);
        $pdo->prepare("UPDATE pp_agents SET ops_manager = ? WHERE LOWER(TRIM(ops_manager)) = LOWER(?)")->execute([$name, $prevName]);
        $pdo->prepare("UPDATE pp_payments SET ops_manager = ? WHERE LOWER(TRIM(ops_manager)) = LOWER(?)")->execute([$name, $prevName]);
    }
    out(['success' => true]);
}

if ($action === 'remove_ops_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $id = (int)($data['id'] ?? 0);
    $name = clean_str($data['name'] ?? '', 150);
    if ($id > 0) {
        $pdo->prepare("DELETE FROM pp_ops_managers WHERE id = ?")->execute([$id]);
    }
    if ($name) {
        $pdo->prepare("DELETE FROM pp_ops_managers WHERE LOWER(TRIM(name)) = LOWER(?)")->execute([$name]);
        $pdo->prepare("UPDATE pp_team_leaders SET reporting_level_1 = '' WHERE LOWER(TRIM(reporting_level_1)) = LOWER(?)")->execute([$name]);
        $pdo->prepare("UPDATE pp_agents SET ops_manager = '' WHERE LOWER(TRIM(ops_manager)) = LOWER(?)")->execute([$name]);
    }
    out(['success' => true]);
}

if ($action === 'upsert_tl_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $id = (int)($data['id'] ?? 0);
    $prevName = clean_str($data['prev_name'] ?? '', 150);
    $name = clean_str($data['name'] ?? '', 150);
    if (!$name) err('Team Leader name is required.');
    $ecode = clean_str($data['ecode'] ?? '', 50);
    $ops = clean_str($data['ops_manager'] ?? '', 150);
    $target = max(0, floatval($data['target'] ?? 0));

    $foundId = null;
    if ($id > 0) {
        $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE id = ?");
        $st->execute([$id]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId && $prevName) {
        $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(name)) = LOWER(?)");
        $st->execute([$prevName]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId) {
        $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(name)) = LOWER(?)");
        $st->execute([$name]);
        $foundId = $st->fetchColumn();
    }

    if ($foundId) {
        $stmt = $pdo->prepare("UPDATE pp_team_leaders SET emp_id=?, name=?, reporting_level_1=?, monthly_target=? WHERE id=?");
        $stmt->execute([$ecode, $name, $ops, $target, $foundId]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO pp_team_leaders (emp_id, name, reporting_level_1, monthly_target) VALUES (?, ?, ?, ?)");
        $stmt->execute([$ecode, $name, $ops, $target]);
    }

    if ($prevName && strcasecmp($prevName, $name) !== 0) {
        $pdo->prepare("UPDATE pp_agents SET team_leader = ? WHERE LOWER(TRIM(team_leader)) = LOWER(?)")->execute([$name, $prevName]);
        $pdo->prepare("UPDATE pp_payments SET tl_name = ? WHERE LOWER(TRIM(tl_name)) = LOWER(?)")->execute([$name, $prevName]);
    }
    out(['success' => true]);
}

if ($action === 'remove_tl_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $id = (int)($data['id'] ?? 0);
    $name = clean_str($data['name'] ?? '', 150);
    if ($id > 0) {
        $pdo->prepare("DELETE FROM pp_team_leaders WHERE id = ?")->execute([$id]);
    }
    if ($name) {
        $pdo->prepare("DELETE FROM pp_team_leaders WHERE LOWER(TRIM(name)) = LOWER(?)")->execute([$name]);
        $pdo->prepare("UPDATE pp_agents SET team_leader = '' WHERE LOWER(TRIM(team_leader)) = LOWER(?)")->execute([$name]);
    }
    out(['success' => true]);
}

if ($action === 'upsert_agent_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $id = (int)($data['id'] ?? 0);
    $prevName = clean_str($data['prev_name'] ?? '', 150);
    $name = clean_str($data['name'] ?? '', 150);
    if (!$name) err('Agent name is required.');
    $ecode = clean_str($data['ecode'] ?? '', 50);
    $ops = clean_str($data['ops_manager'] ?? '', 150);
    $tl = clean_str($data['tl'] ?? '', 150);

    $foundId = null;
    if ($id > 0) {
        $st = $pdo->prepare("SELECT id FROM pp_agents WHERE id = ?");
        $st->execute([$id]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId && $prevName) {
        $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?)");
        $st->execute([$prevName]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId && $ecode) {
        $st = $pdo->prepare("SELECT id FROM pp_agents WHERE emp_id = ?");
        $st->execute([$ecode]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId) {
        $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?)");
        $st->execute([$name]);
        $foundId = $st->fetchColumn();
    }

    if ($foundId) {
        $stmt = $pdo->prepare("UPDATE pp_agents SET emp_id=?, agent_name=?, ops_manager=?, team_leader=? WHERE id=?");
        $stmt->execute([$ecode, $name, $ops, $tl, $foundId]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO pp_agents (emp_id, agent_name, ops_manager, team_leader) VALUES (?, ?, ?, ?)");
        $stmt->execute([$ecode, $name, $ops, $tl]);
    }

    if ($prevName && strcasecmp($prevName, $name) !== 0) {
        $pdo->prepare("UPDATE pp_payments SET agent_name = ? WHERE LOWER(TRIM(agent_name)) = LOWER(?)")->execute([$name, $prevName]);
    }
    out(['success' => true]);
}

if ($action === 'remove_agent_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $id = (int)($data['id'] ?? 0);
    $name = clean_str($data['name'] ?? '', 150);
    $ecode = clean_str($data['ecode'] ?? '', 50);
    if ($id > 0) {
        $pdo->prepare("DELETE FROM pp_agents WHERE id = ?")->execute([$id]);
    }
    if ($name) {
        $pdo->prepare("DELETE FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?)")->execute([$name]);
    }
    if ($ecode && !$name) {
        $pdo->prepare("DELETE FROM pp_agents WHERE emp_id = ?")->execute([$ecode]);
    }
    out(['success' => true]);
}

// 12. CLIENTS MANAGEMENT
if ($action === 'upsert_client_node') {
    require_auth(); // Allowed during payment recording by any authenticated staff

    $cName = clean_str($data['client_name'] ?? '', 150);
    $cNum = clean_str($data['client_number'] ?? '', 50);
    $email = clean_str($data['email_id'] ?? '', 150);
    $pan = strtoupper(clean_str($data['pan_no'] ?? '', 30));
    $aadhar = clean_str($data['aadhar_no'] ?? '', 30);
    $state = clean_str($data['state'] ?? '', 100);

    if (!$cName && !$cNum) err('Client Name or Phone Number is required.');

    $check = null;
    if ($cNum) {
        $st = $pdo->prepare("SELECT id FROM pp_clients WHERE client_number = ? LIMIT 1");
        $st->execute([$cNum]);
        $check = $st->fetchColumn();
    }
    if (!$check && $cName) {
        $st = $pdo->prepare("SELECT id FROM pp_clients WHERE LOWER(client_name) = LOWER(?) LIMIT 1");
        $st->execute([$cName]);
        $check = $st->fetchColumn();
    }

    if ($check) {
        $stmt = $pdo->prepare("UPDATE pp_clients SET client_name=?, client_number=?, email_id=?, pan_no=?, aadhar_no=?, state=? WHERE id=?");
        $stmt->execute([$cName ?: 'Unknown Client', $cNum, $email, $pan, $aadhar, $state, $check]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO pp_clients (client_name, client_number, email_id, pan_no, aadhar_no, state) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$cName ?: 'Unknown Client', $cNum, $email, $pan, $aadhar, $state]);
    }
    out(['success' => true]);
}

if ($action === 'remove_client_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $id = (int)($data['id'] ?? 0);
    $cNum = clean_str($data['client_number'] ?? '', 50);
    $cName = clean_str($data['client_name'] ?? '', 150);

    if ($id > 0) {
        $pdo->prepare("DELETE FROM pp_clients WHERE id = ?")->execute([$id]);
    } elseif ($cNum) {
        $pdo->prepare("DELETE FROM pp_clients WHERE client_number = ?")->execute([$cNum]);
    } elseif ($cName) {
        $pdo->prepare("DELETE FROM pp_clients WHERE LOWER(client_name) = LOWER(?)")->execute([$cName]);
    }
    out(['success' => true]);
}

// 13. ACCOUNTS LEDGER MANAGEMENT (REQUIRES ADMIN OR OPS_MANAGER)
if ($action === 'accounts') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `pp_accounts` (
          `id` int(11) NOT NULL AUTO_INCREMENT,
          `date` date NOT NULL,
          `type` varchar(50) DEFAULT 'CASH_HANDOVER',
          `amount` decimal(15,2) NOT NULL,
          `remarks` text DEFAULT NULL,
          `handled_by` varchar(255) DEFAULT NULL,
          `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch(Exception $e) {}

    $entries = $pdo->query("SELECT id, date, type, amount, remarks, handled_by, created_at FROM pp_accounts ORDER BY date DESC, id DESC")->fetchAll();
    out(['rows' => $entries]);
}

if ($action === 'upsert_account_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $date = clean_str($data['date'] ?? date('Y-m-d'), 20);
    $amount = abs(floatval($data['amount'] ?? 0));
    $remarks = clean_str($data['remarks'] ?? $data['description'] ?? '', 500);
    $handledBy = clean_str($data['handled_by'] ?? '', 150);

    if ($amount <= 0) err('Valid amount is required.');

    $stmt = $pdo->prepare("INSERT INTO pp_accounts (date, amount, remarks, handled_by, created_at) VALUES (?, ?, ?, ?, NOW())");
    $stmt->execute([$date, $amount, $remarks, $handledBy]);
    out(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
}

if ($action === 'remove_account_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $id = (int)($data['id'] ?? 0);
    if ($id > 0) {
        $pdo->prepare("DELETE FROM pp_accounts WHERE id = ?")->execute([$id]);
    } else {
        $date = clean_str($data['date'] ?? '', 20);
        $amount = abs(floatval($data['amount'] ?? 0));
        if ($date && $amount > 0) {
            $pdo->prepare("DELETE FROM pp_accounts WHERE date = ? AND amount = ? LIMIT 1")->execute([$date, $amount]);
        }
    }
    out(['success' => true]);
}

// 14. TARGETS UPDATE (REQUIRES ADMIN OR OPS_MANAGER)
if ($action === 'update_target_node') {
    require_role(['ADMIN', 'OPS_MANAGER']);

    $type = strtoupper(clean_str($data['type'] ?? '', 10));
    $name = clean_str($data['name'] ?? '', 150);
    $target = max(0, floatval($data['target'] ?? 0));

    if (!$name) err('Name is required.');

    if ($type === 'OPS') {
        $stmt = $pdo->prepare("UPDATE pp_ops_managers SET monthly_target = ? WHERE LOWER(name) = LOWER(?)");
        $stmt->execute([$target, $name]);
    } elseif ($type === 'TL') {
        $stmt = $pdo->prepare("UPDATE pp_team_leaders SET monthly_target = ? WHERE LOWER(name) = LOWER(?)");
        $stmt->execute([$target, $name]);
    }
    out(['success' => true]);
}

// 15. SAFE PRODUCTION DATA RESET (REQUIRES ADMIN ROLE ONLY)
if ($action === 'wipe_database_records') {
    $me = require_role(['ADMIN']);

    $scope = $data['scope'] ?? 'all';

    // 1. AUTOMATIC SERVER-SIDE BACKUP BEFORE WIPING
    $serverBackupFile = null;
    try {
        $backupDir = __DIR__ . '/backups';
        if (!is_dir($backupDir)) {
            @mkdir($backupDir, 0755, true);
            @file_put_contents($backupDir . '/.htaccess', "Order Deny,Allow\nDeny from all\n");
        }

        $tables = ['pp_payments', 'pp_accounts', 'pp_clients', 'pp_agents', 'pp_ops_managers', 'pp_team_leaders'];
        $backupPayload = [
            'created_at' => date('Y-m-d H:i:s'),
            'created_by' => $me['name'] ?? $me['email'] ?? 'Admin',
            'scope' => $scope,
            'tables' => []
        ];

        foreach ($tables as $t) {
            try {
                $st = $pdo->query("SELECT * FROM `$t`");
                $backupPayload['tables'][$t] = $st->fetchAll();
            } catch (Throwable $e) {
                $backupPayload['tables'][$t] = [];
            }
        }

        $serverBackupFile = 'backup_' . date('Y-m-d_His') . '.json';
        file_put_contents($backupDir . '/' . $serverBackupFile, json_encode($backupPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    } catch (Throwable $bErr) {
        error_log("Pre-wipe server backup error: " . $bErr->getMessage());
    }

    // Disable foreign key constraints temporarily for clean wipe
    try { $pdo->exec("SET FOREIGN_KEY_CHECKS = 0"); } catch (Throwable $e) {}

    if ($scope === 'all' || $scope === 'payments') {
        try {
            $pdo->exec("TRUNCATE TABLE pp_payments");
        } catch (Throwable $t) {
            $pdo->exec("DELETE FROM pp_payments");
            try { $pdo->exec("ALTER TABLE pp_payments AUTO_INCREMENT = 1"); } catch (Throwable $t2) {}
        }
    }

    if ($scope === 'all' || $scope === 'accounts') {
        try {
            $pdo->exec("TRUNCATE TABLE pp_accounts");
        } catch (Throwable $t) {
            try {
                $pdo->exec("DELETE FROM pp_accounts");
                $pdo->exec("ALTER TABLE pp_accounts AUTO_INCREMENT = 1");
            } catch (Throwable $t2) {}
        }
    }

    if ($scope === 'all') {
        $otherTables = ['pp_clients', 'pp_agents', 'pp_ops_managers', 'pp_team_leaders'];
        foreach ($otherTables as $tbl) {
            try {
                $pdo->exec("TRUNCATE TABLE `$tbl`");
            } catch (Throwable $t) {
                try {
                    $pdo->exec("DELETE FROM `$tbl`");
                    $pdo->exec("ALTER TABLE `$tbl` AUTO_INCREMENT = 1");
                } catch (Throwable $t2) {}
            }
        }

        // Delete all non-admin users so the current logged-in administrator is not locked out
        $myId = (int)($me['id'] ?? 0);
        if ($myId > 0) {
            try {
                $pdo->prepare("DELETE FROM pp_users WHERE id != ?")->execute([$myId]);
            } catch (Throwable $t) {}
        }
    }

    try { $pdo->exec("SET FOREIGN_KEY_CHECKS = 1"); } catch (Throwable $e) {}

    out(['success' => true, 'server_backup_file' => $serverBackupFile]);
}

err('Unknown action: ' . htmlspecialchars($action), 404);

} catch (Throwable $e) {
    error_log("API Unhandled Error in action '{$action}': " . $e->getMessage());
    err('An unexpected server error occurred. Please try again.', 500);
}
?>
