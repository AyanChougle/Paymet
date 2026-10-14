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
}
// Same-origin requests carry no Origin header and need no CORS headers.
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}
header('Cache-Control: no-store');

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
$db_host = getenv('PP_DB_HOST') ?: 'localhost';
$db_user = getenv('PP_DB_USER') ?: '';
$db_pass = getenv('PP_DB_PASS') ?: '';
$db_name = getenv('PP_DB_NAME') ?: '';
$pp_allow_wipe = true;

// Credentials live in config.php (git-ignored, see config.example.php) or PP_DB_* env vars.
if (file_exists(__DIR__ . '/config.php')) {
    $cfg = include __DIR__ . '/config.php';
    if (is_array($cfg)) {
        if (!empty($cfg['user'])) $db_user = $cfg['user'];
        if (!empty($cfg['pass'])) $db_pass = $cfg['pass'];
        if (!empty($cfg['name'])) $db_name = $cfg['name'];
        if (!empty($cfg['host'])) $db_host = $cfg['host'];
        $pp_allow_wipe = !empty($cfg['allow_wipe']);
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
if ($db_user === '' || $db_name === '') {
    error_log('Payment Portal: database credentials are not configured (config.php missing).');
    err('Server is not configured. Please contact administrator.', 500);
}
$hostsToTry = array_values(array_unique(array_filter([
    $db_host,
    'localhost',
    '127.0.0.1'
])));

foreach ($hostsToTry as $h) {
    try {
        $dsn = "mysql:host=$h;dbname=$db_name;charset=utf8mb4";
        if (strpos($h, ':') !== false) {
            [$hHost, $hPort] = explode(':', $h, 2);
            $dsn = "mysql:host=$hHost;port=$hPort;dbname=$db_name;charset=utf8mb4";
        }
        $pdo = new PDO($dsn, $db_user, $db_pass, [
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
    err('Database Connection Failed: ' . $lastError, 500);
}

// Auto-align all database table columns with live system requirements
try {
    // 1. pp_users
    $uCols = $pdo->query("DESCRIBE `pp_users`")->fetchAll(PDO::FETCH_COLUMN);
    $uColLower = array_map('strtolower', $uCols ?: []);

    if (!in_array('name', $uColLower) && in_array('full_name', $uColLower)) {
        @$pdo->exec("ALTER TABLE `pp_users` ADD COLUMN `name` VARCHAR(150) DEFAULT NULL");
        @$pdo->exec("UPDATE `pp_users` SET `name` = `full_name` WHERE `name` IS NULL");
    }
    if (!in_array('email', $uColLower)) {
        @$pdo->exec("ALTER TABLE `pp_users` ADD COLUMN `email` VARCHAR(150) DEFAULT NULL");
        @$pdo->exec("UPDATE `pp_users` SET `email` = `full_name` WHERE `full_name` LIKE '%@%' AND (`email` IS NULL OR `email` = '')");
        @$pdo->exec("UPDATE `pp_users` SET `email` = CONCAT(`username`, '@portal.com') WHERE `email` IS NULL OR `email` = ''");
    }
    if (!in_array('password', $uColLower) && in_array('password_hash', $uColLower)) {
        @$pdo->exec("ALTER TABLE `pp_users` ADD COLUMN `password` VARCHAR(255) DEFAULT NULL");
        @$pdo->exec("UPDATE `pp_users` SET `password` = `password_hash` WHERE `password` IS NULL");
    }
    if (!in_array('password_hash', $uColLower) && in_array('password', $uColLower)) {
        @$pdo->exec("ALTER TABLE `pp_users` ADD COLUMN `password_hash` VARCHAR(255) DEFAULT NULL");
        @$pdo->exec("UPDATE `pp_users` SET `password_hash` = `password` WHERE `password_hash` IS NULL");
    }
    if (!in_array('is_active', $uColLower)) {
        @$pdo->exec("ALTER TABLE `pp_users` ADD COLUMN `is_active` TINYINT(1) DEFAULT 1");
    }
    @$pdo->exec("ALTER TABLE `pp_users` MODIFY COLUMN `role` VARCHAR(50) NOT NULL DEFAULT 'ENTRY_USER'");
    @$pdo->exec("UPDATE `pp_users` SET `role` = 'ENTRY_USER' WHERE `role` IS NULL OR TRIM(`role`) = '' OR `role` = 'AGENT' OR `role` = 'TEAM_LEADER'");

    // 2. pp_ops_managers
    $opsCols = array_map('strtolower', $pdo->query("DESCRIBE `pp_ops_managers`")->fetchAll(PDO::FETCH_COLUMN) ?: []);
    if (!in_array('ecode', $opsCols)) @$pdo->exec("ALTER TABLE `pp_ops_managers` ADD COLUMN `ecode` VARCHAR(50) DEFAULT NULL");
    if (!in_array('emp_id', $opsCols)) @$pdo->exec("ALTER TABLE `pp_ops_managers` ADD COLUMN `emp_id` VARCHAR(50) DEFAULT NULL");
    if (!in_array('target', $opsCols)) @$pdo->exec("ALTER TABLE `pp_ops_managers` ADD COLUMN `target` DECIMAL(15,2) DEFAULT 0.00");
    if (!in_array('monthly_target', $opsCols)) @$pdo->exec("ALTER TABLE `pp_ops_managers` ADD COLUMN `monthly_target` DECIMAL(15,2) DEFAULT 0.00");
    if (!in_array('reporting_to', $opsCols)) @$pdo->exec("ALTER TABLE `pp_ops_managers` ADD COLUMN `reporting_to` VARCHAR(255) DEFAULT NULL");
    if (!in_array('reporting_level_1', $opsCols)) @$pdo->exec("ALTER TABLE `pp_ops_managers` ADD COLUMN `reporting_level_1` VARCHAR(255) DEFAULT NULL");
    @$pdo->exec("UPDATE `pp_ops_managers` SET `ecode` = `emp_id` WHERE (`ecode` IS NULL OR `ecode` = '') AND `emp_id` IS NOT NULL AND `emp_id` != ''");
    @$pdo->exec("UPDATE `pp_ops_managers` SET `emp_id` = `ecode` WHERE (`emp_id` IS NULL OR `emp_id` = '') AND `ecode` IS NOT NULL AND `ecode` != ''");
    @$pdo->exec("UPDATE `pp_ops_managers` SET `target` = `monthly_target` WHERE (`target` IS NULL OR `target` = 0) AND `monthly_target` > 0");
    @$pdo->exec("UPDATE `pp_ops_managers` SET `monthly_target` = `target` WHERE (`monthly_target` IS NULL OR `monthly_target` = 0) AND `target` > 0");
    @$pdo->exec("UPDATE `pp_ops_managers` SET `reporting_to` = `reporting_level_1` WHERE (`reporting_to` IS NULL OR `reporting_to` = '') AND `reporting_level_1` IS NOT NULL");
    @$pdo->exec("UPDATE `pp_ops_managers` SET `reporting_level_1` = `reporting_to` WHERE (`reporting_level_1` IS NULL OR `reporting_level_1` = '') AND `reporting_to` IS NOT NULL");

    // 3. pp_team_leaders
    $tlCols = array_map('strtolower', $pdo->query("DESCRIBE `pp_team_leaders`")->fetchAll(PDO::FETCH_COLUMN) ?: []);
    if (!in_array('ecode', $tlCols)) @$pdo->exec("ALTER TABLE `pp_team_leaders` ADD COLUMN `ecode` VARCHAR(50) DEFAULT NULL");
    if (!in_array('emp_id', $tlCols)) @$pdo->exec("ALTER TABLE `pp_team_leaders` ADD COLUMN `emp_id` VARCHAR(50) DEFAULT NULL");
    if (!in_array('target', $tlCols)) @$pdo->exec("ALTER TABLE `pp_team_leaders` ADD COLUMN `target` DECIMAL(15,2) DEFAULT 0.00");
    if (!in_array('monthly_target', $tlCols)) @$pdo->exec("ALTER TABLE `pp_team_leaders` ADD COLUMN `monthly_target` DECIMAL(15,2) DEFAULT 0.00");
    if (!in_array('ops_manager', $tlCols)) @$pdo->exec("ALTER TABLE `pp_team_leaders` ADD COLUMN `ops_manager` VARCHAR(255) DEFAULT NULL");
    if (!in_array('reporting_level_1', $tlCols)) @$pdo->exec("ALTER TABLE `pp_team_leaders` ADD COLUMN `reporting_level_1` VARCHAR(255) DEFAULT NULL");
    if (!in_array('reporting_to', $tlCols)) @$pdo->exec("ALTER TABLE `pp_team_leaders` ADD COLUMN `reporting_to` VARCHAR(255) DEFAULT NULL");
    @$pdo->exec("UPDATE `pp_team_leaders` SET `ecode` = `emp_id` WHERE (`ecode` IS NULL OR `ecode` = '') AND `emp_id` IS NOT NULL AND `emp_id` != ''");
    @$pdo->exec("UPDATE `pp_team_leaders` SET `emp_id` = `ecode` WHERE (`emp_id` IS NULL OR `emp_id` = '') AND `ecode` IS NOT NULL AND `ecode` != ''");
    @$pdo->exec("UPDATE `pp_team_leaders` SET `target` = `monthly_target` WHERE (`target` IS NULL OR `target` = 0) AND `monthly_target` > 0");
    @$pdo->exec("UPDATE `pp_team_leaders` SET `monthly_target` = `target` WHERE (`monthly_target` IS NULL OR `monthly_target` = 0) AND `target` > 0");
    @$pdo->exec("UPDATE `pp_team_leaders` SET `ops_manager` = COALESCE(NULLIF(`reporting_level_1`,''), `reporting_to`) WHERE `ops_manager` IS NULL OR `ops_manager` = ''");
    @$pdo->exec("UPDATE `pp_team_leaders` SET `reporting_level_1` = `ops_manager` WHERE `reporting_level_1` IS NULL OR `reporting_level_1` = ''");
    @$pdo->exec("UPDATE `pp_team_leaders` SET `reporting_to` = `ops_manager` WHERE `reporting_to` IS NULL OR `reporting_to` = ''");

    // 4. pp_agents
    $agCols = array_map('strtolower', $pdo->query("DESCRIBE `pp_agents`")->fetchAll(PDO::FETCH_COLUMN) ?: []);
    if (!in_array('ecode', $agCols)) @$pdo->exec("ALTER TABLE `pp_agents` ADD COLUMN `ecode` VARCHAR(50) DEFAULT NULL");
    if (!in_array('emp_id', $agCols)) @$pdo->exec("ALTER TABLE `pp_agents` ADD COLUMN `emp_id` VARCHAR(50) DEFAULT NULL");
    if (!in_array('agent_name', $agCols)) @$pdo->exec("ALTER TABLE `pp_agents` ADD COLUMN `agent_name` VARCHAR(255) DEFAULT NULL");
    if (!in_array('name', $agCols)) @$pdo->exec("ALTER TABLE `pp_agents` ADD COLUMN `name` VARCHAR(255) DEFAULT NULL");
    if (!in_array('tl', $agCols)) @$pdo->exec("ALTER TABLE `pp_agents` ADD COLUMN `tl` VARCHAR(255) DEFAULT NULL");
    if (!in_array('team_leader', $agCols)) @$pdo->exec("ALTER TABLE `pp_agents` ADD COLUMN `team_leader` VARCHAR(255) DEFAULT NULL");
    @$pdo->exec("UPDATE `pp_agents` SET `ecode` = `emp_id` WHERE (`ecode` IS NULL OR `ecode` = '') AND `emp_id` IS NOT NULL AND `emp_id` != ''");
    @$pdo->exec("UPDATE `pp_agents` SET `emp_id` = `ecode` WHERE (`emp_id` IS NULL OR `emp_id` = '') AND `ecode` IS NOT NULL AND `ecode` != ''");
    @$pdo->exec("UPDATE `pp_agents` SET `agent_name` = `name` WHERE (`agent_name` IS NULL OR `agent_name` = '') AND `name` IS NOT NULL AND `name` != ''");
    @$pdo->exec("UPDATE `pp_agents` SET `name` = `agent_name` WHERE (`name` IS NULL OR `name` = '') AND `agent_name` IS NOT NULL AND `agent_name` != ''");
    @$pdo->exec("UPDATE `pp_agents` SET `tl` = `team_leader` WHERE (`tl` IS NULL OR `tl` = '') AND `team_leader` IS NOT NULL AND `team_leader` != ''");
    @$pdo->exec("UPDATE `pp_agents` SET `team_leader` = `tl` WHERE (`team_leader` IS NULL OR `team_leader` = '') AND `tl` IS NOT NULL AND `tl` != ''");

    // 5. pp_clients
    $clCols = array_map('strtolower', $pdo->query("DESCRIBE `pp_clients`")->fetchAll(PDO::FETCH_COLUMN) ?: []);
    if (!in_array('state', $clCols)) @$pdo->exec("ALTER TABLE `pp_clients` ADD COLUMN `state` VARCHAR(100) DEFAULT NULL");

    // 6. pp_payments
    $payCols = array_map('strtolower', $pdo->query("DESCRIBE `pp_payments`")->fetchAll(PDO::FETCH_COLUMN) ?: []);
    if (!in_array('ecode', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `ecode` VARCHAR(50) DEFAULT NULL");
    if (!in_array('e_code', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `e_code` VARCHAR(50) DEFAULT NULL");
    if (!in_array('tl', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `tl` VARCHAR(255) DEFAULT NULL");
    if (!in_array('tl_name', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `tl_name` VARCHAR(255) DEFAULT NULL");
    if (!in_array('received_in', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `received_in` VARCHAR(100) DEFAULT 'Digital Verse'");
    if (!in_array('received_company', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `received_company` VARCHAR(100) DEFAULT 'Digital Verse'");
    if (!in_array('state', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `state` VARCHAR(100) DEFAULT NULL");
    if (!in_array('payment_mode', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `payment_mode` VARCHAR(50) DEFAULT 'P2P'");
    if (!in_array('entered_by', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `entered_by` VARCHAR(150) DEFAULT NULL");
    if (!in_array('created_by_name', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `created_by_name` VARCHAR(150) DEFAULT NULL");
    if (!in_array('divided_by', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `divided_by` DECIMAL(10,2) DEFAULT 88.00");
    if (!in_array('ratio', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `ratio` VARCHAR(50) DEFAULT NULL");
    if (!in_array('remarks', $payCols)) @$pdo->exec("ALTER TABLE `pp_payments` ADD COLUMN `remarks` TEXT DEFAULT NULL");
} catch (Throwable $e) {}

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
    $role = strtoupper(trim((string)($u['role'] ?? 'ENTRY_USER')));
    if ($role === 'AGENT' || $role === 'TEAM_LEADER' || $role === '') {
        $role = 'ENTRY_USER';
    }
    $cleanAllowed = array_map('strtoupper', $allowedRoles);
    if (!in_array($role, $cleanAllowed, true) && !in_array(strtoupper(trim((string)($u['role'] ?? ''))), $cleanAllowed, true)) {
        err("Forbidden: Role '{$role}' does not have permission for this operation.", 403);
    }
    return $u;
}

// Rate Limiting on Login: shared server-side store (cannot be bypassed by dropping the session cookie)
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_SEC = 900;
const LOGIN_LOCK_SEC = 900;

function login_keys(string $account): array {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return ['ip:' . hash('sha256', $ip), 'acct:' . hash('sha256', strtolower(trim($account)))];
}

function login_limiter_init(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS pp_login_attempts (
        throttle_key VARCHAR(80) NOT NULL PRIMARY KEY,
        fail_count INT NOT NULL DEFAULT 0,
        first_attempt INT NOT NULL,
        locked_until INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function check_login_rate_limit(PDO $pdo, string $account) {
    login_limiter_init($pdo);
    $now = time();
    foreach (login_keys($account) as $k) {
        $st = $pdo->prepare("SELECT locked_until FROM pp_login_attempts WHERE throttle_key = ?");
        $st->execute([$k]);
        $lock = (int)$st->fetchColumn();
        if ($lock > $now) {
            err("Too many failed login attempts. Please wait " . ($lock - $now) . " seconds before trying again.", 429);
        }
    }
}

function record_failed_login(PDO $pdo, string $account) {
    login_limiter_init($pdo);
    $now = time();
    foreach (login_keys($account) as $k) {
        $st = $pdo->prepare("SELECT fail_count, first_attempt FROM pp_login_attempts WHERE throttle_key = ?");
        $st->execute([$k]);
        $row = $st->fetch();
        if (!$row || $now - (int)$row['first_attempt'] > LOGIN_WINDOW_SEC) {
            $count = 1; $first = $now;
        } else {
            $count = (int)$row['fail_count'] + 1; $first = (int)$row['first_attempt'];
        }
        $lock = $count >= LOGIN_MAX_FAILS ? $now + LOGIN_LOCK_SEC : 0;
        $pdo->prepare("REPLACE INTO pp_login_attempts (throttle_key, fail_count, first_attempt, locked_until) VALUES (?, ?, ?, ?)")
            ->execute([$k, $count, $first, $lock]);
    }
}

function clear_login_rate_limit(PDO $pdo, string $account) {
    // Only the account key is cleared; the IP key keeps counting so one IP cannot spray many accounts.
    $k = login_keys($account)[1];
    $pdo->prepare("DELETE FROM pp_login_attempts WHERE throttle_key = ?")->execute([$k]);
}

// PII handling: full PAN/Aadhaar only for roles that manage clients
function can_view_pii(): bool {
    $u = $_SESSION['pp_user'] ?? null;
    return $u && in_array(strtoupper($u['role'] ?? ''), ['ADMIN', 'OPS_MANAGER'], true);
}

function mask_id($v) {
    $v = (string)$v;
    $n = strlen($v);
    if ($n === 0) return '';
    return str_repeat('*', max(0, $n - 4)) . substr($v, -min(4, $n));
}

function is_masked($v): bool {
    return strpos((string)$v, '*') !== false;
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

// KYC Rules, Normalization & Validation Helpers
function clean_phone(?string $num): string {
    if (!$num) return '';
    $digits = preg_replace('/\D/', '', $num);
    if (strlen($digits) === 12 && substr($digits, 0, 2) === '91') {
        $digits = substr($digits, 2);
    } elseif (strlen($digits) === 11 && substr($digits, 0, 1) === '0') {
        $digits = substr($digits, 1);
    }
    return substr($digits, 0, 10);
}

function clean_aadhar(?string $aadhar): string {
    if (!$aadhar) return '';
    return substr(preg_replace('/\D/', '', $aadhar), 0, 12);
}

function clean_pan(?string $pan): string {
    if (!$pan) return '';
    return substr(strtoupper(preg_replace('/[^A-Za-z0-9*]/', '', $pan)), 0, 10);
}

function validate_kyc_rules(string $phone, string $pan, string $aadhar, string $email, bool $requirePhone = false): ?string {
    if ($requirePhone && empty($phone)) {
        return 'Client Phone Number is required.';
    }
    if ($phone !== '' && !preg_match('/^[6-9]\d{9}$/', $phone)) {
        return 'Client phone number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.';
    }
    if ($pan !== '' && !is_masked($pan) && !preg_match('/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/', $pan)) {
        return 'PAN card must be exactly 10 characters in the format ABCDE1234F (5 letters, 4 digits, 1 letter).';
    }
    if ($aadhar !== '' && !is_masked($aadhar)) {
        $raw = preg_replace('/\D/', '', $aadhar);
        if (strlen($raw) !== 12) {
            return 'Aadhar number must be exactly 12 numeric digits.';
        }
        if (preg_match('/^(\d)\1{11}$/', $raw)) {
            return 'Invalid Aadhar number: cannot consist of all identical digits.';
        }
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return 'Please enter a valid email address (e.g. client@example.com).';
    }
    return null;
}

// Resilient Hierarchy Data Resolvers (DB + ops_tl_targets + Payments/Agents discovery)
function get_all_ops_managers(PDO $pdo): array {
    $ops = [];
    $seenNames = [];

    // 1. From pp_ops_managers table
    try {
        $rawOps = $pdo->query("SELECT * FROM pp_ops_managers ORDER BY id ASC")->fetchAll();
        foreach ($rawOps as $r) {
            $name = trim((string)($r['name'] ?? ''));
            if (!$name) continue;
            $tgt = floatval($r['monthly_target'] ?? $r['target'] ?? 0);
            $ec = (string)($r['emp_id'] ?? $r['ecode'] ?? '');
            $rep = (string)($r['reporting_level_1'] ?? $r['reporting_to'] ?? '');
            $ops[] = [
                'id' => (int)($r['id'] ?? 0),
                'ecode' => $ec,
                'emp_id' => $ec,
                'name' => $name,
                'reporting_to' => $rep,
                'reporting_level_1' => $rep,
                'monthly_target' => $tgt,
                'target' => $tgt
            ];
            $seenNames[strtolower($name)] = count($ops) - 1;
        }
    } catch (Throwable $e) {}

    // 2. From ops_tl_targets table if exists
    try {
        $hasTargetsTbl = $pdo->query("SHOW TABLES LIKE 'ops_tl_targets'")->fetchColumn();
        if ($hasTargetsTbl) {
            $rows = $pdo->query("SELECT * FROM ops_tl_targets")->fetchAll();
            foreach ($rows as $r) {
                $type = strtoupper(trim((string)($r['type'] ?? $r['role'] ?? '')));
                $name = trim((string)($r['name'] ?? $r['ops_manager'] ?? ''));
                if (!$name) continue;
                if ($type === 'OPS' || strpos($type, 'OPS') !== false || (!$type && !isset($r['tl']))) {
                    $tgt = floatval($r['target'] ?? $r['monthly_target'] ?? 0);
                    $ec = (string)($r['ecode'] ?? $r['emp_id'] ?? '');
                    $rep = (string)($r['reporting_to'] ?? $r['reporting_level_1'] ?? '');
                    $key = strtolower($name);
                    if (!isset($seenNames[$key])) {
                        $ops[] = [
                            'id' => (int)($r['id'] ?? 0),
                            'ecode' => $ec,
                            'emp_id' => $ec,
                            'name' => $name,
                            'reporting_to' => $rep,
                            'reporting_level_1' => $rep,
                            'monthly_target' => $tgt,
                            'target' => $tgt
                        ];
                        $seenNames[$key] = count($ops) - 1;
                    } elseif ($tgt > 0 && $ops[$seenNames[$key]]['target'] == 0) {
                        $ops[$seenNames[$key]]['target'] = $tgt;
                        $ops[$seenNames[$key]]['monthly_target'] = $tgt;
                    }
                }
            }
        }
    } catch (Throwable $e) {}

    // 3. Fallback discovery from pp_agents
    try {
        $agOps = $pdo->query("SELECT DISTINCT ops_manager FROM pp_agents WHERE ops_manager IS NOT NULL AND TRIM(ops_manager) != ''")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($agOps as $opName) {
            $name = trim((string)$opName);
            if (!$name || strtolower($name) === 'unassigned ops' || strtolower($name) === 'unassigned ops manager') continue;
            $key = strtolower($name);
            if (!isset($seenNames[$key])) {
                $ops[] = [
                    'id' => 0,
                    'ecode' => '',
                    'emp_id' => '',
                    'name' => $name,
                    'reporting_to' => '',
                    'reporting_level_1' => '',
                    'monthly_target' => 0,
                    'target' => 0
                ];
                $seenNames[$key] = count($ops) - 1;
            }
        }
    } catch (Throwable $e) {}

    // 4. Fallback discovery from pp_payments
    try {
        $payOps = $pdo->query("SELECT DISTINCT ops_manager FROM pp_payments WHERE ops_manager IS NOT NULL AND TRIM(ops_manager) != ''")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($payOps as $opName) {
            $name = trim((string)$opName);
            if (!$name || strtolower($name) === 'unassigned ops' || strtolower($name) === 'unassigned ops manager') continue;
            $key = strtolower($name);
            if (!isset($seenNames[$key])) {
                $ops[] = [
                    'id' => 0,
                    'ecode' => '',
                    'emp_id' => '',
                    'name' => $name,
                    'reporting_to' => '',
                    'reporting_level_1' => '',
                    'monthly_target' => 0,
                    'target' => 0
                ];
                $seenNames[$key] = count($ops) - 1;
            }
        }
    } catch (Throwable $e) {}

    // Ensure authoritative monthly targets are guaranteed
    foreach ($ops as &$o) {
        if ($o['target'] <= 0) {
            $nLow = strtolower($o['name']);
            if (strpos($nLow, 'rushikesh') !== false) {
                $o['target'] = 3500000;
                $o['monthly_target'] = 3500000;
                if ($o['id'] > 0) @$pdo->exec("UPDATE pp_ops_managers SET target=3500000, monthly_target=3500000 WHERE id=" . (int)$o['id']);
            } elseif (strpos($nLow, 'arshad') !== false) {
                $o['target'] = 3500000;
                $o['monthly_target'] = 3500000;
                if ($o['id'] > 0) @$pdo->exec("UPDATE pp_ops_managers SET target=3500000, monthly_target=3500000 WHERE id=" . (int)$o['id']);
            }
        }
    }
    unset($o);

    return $ops;
}

function get_all_team_leaders(PDO $pdo): array {
    $tls = [];
    $seenNames = [];

    // 1. From pp_team_leaders table
    try {
        $rawTls = $pdo->query("SELECT * FROM pp_team_leaders ORDER BY id ASC")->fetchAll();
        foreach ($rawTls as $r) {
            $name = trim((string)($r['name'] ?? ''));
            if (!$name) continue;
            $tgt = floatval($r['monthly_target'] ?? $r['target'] ?? 0);
            $ec = (string)($r['emp_id'] ?? $r['ecode'] ?? '');
            $rep = (string)($r['reporting_level_1'] ?? $r['ops_manager'] ?? $r['reporting_to'] ?? '');
            $tls[] = [
                'id' => (int)($r['id'] ?? 0),
                'ecode' => $ec,
                'emp_id' => $ec,
                'name' => $name,
                'ops_manager' => $rep,
                'reporting_to' => $rep,
                'reporting_level_1' => $rep,
                'monthly_target' => $tgt,
                'target' => $tgt
            ];
            $seenNames[strtolower($name)] = count($tls) - 1;
        }
    } catch (Throwable $e) {}

    // 2. From ops_tl_targets table if exists
    try {
        $hasTargetsTbl = $pdo->query("SHOW TABLES LIKE 'ops_tl_targets'")->fetchColumn();
        if ($hasTargetsTbl) {
            $rows = $pdo->query("SELECT * FROM ops_tl_targets")->fetchAll();
            foreach ($rows as $r) {
                $type = strtoupper(trim((string)($r['type'] ?? $r['role'] ?? '')));
                $name = trim((string)($r['name'] ?? $r['tl'] ?? $r['team_leader'] ?? ''));
                if (!$name) continue;
                if ($type === 'TL' || strpos($type, 'TL') !== false || strpos($type, 'TEAM') !== false) {
                    $tgt = floatval($r['target'] ?? $r['monthly_target'] ?? 0);
                    $ec = (string)($r['ecode'] ?? $r['emp_id'] ?? '');
                    $rep = (string)($r['ops_manager'] ?? $r['reporting_to'] ?? $r['reporting_level_1'] ?? '');
                    $key = strtolower($name);
                    if (!isset($seenNames[$key])) {
                        $tls[] = [
                            'id' => (int)($r['id'] ?? 0),
                            'ecode' => $ec,
                            'emp_id' => $ec,
                            'name' => $name,
                            'ops_manager' => $rep,
                            'reporting_to' => $rep,
                            'reporting_level_1' => $rep,
                            'monthly_target' => $tgt,
                            'target' => $tgt
                        ];
                        $seenNames[$key] = count($tls) - 1;
                    } elseif ($tgt > 0 && $tls[$seenNames[$key]]['target'] == 0) {
                        $tls[$seenNames[$key]]['target'] = $tgt;
                        $tls[$seenNames[$key]]['monthly_target'] = $tgt;
                    }
                }
            }
        }
    } catch (Throwable $e) {}

    // 3. Fallback discovery from pp_agents
    try {
        $agTls = $pdo->query("SELECT DISTINCT tl, ops_manager FROM pp_agents WHERE tl IS NOT NULL AND TRIM(tl) != ''")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($agTls as $r) {
            $name = trim((string)($r['tl'] ?? ''));
            if (!$name || strtolower($name) === 'unassigned tl' || strtolower($name) === 'unassigned team leader') continue;
            $rep = trim((string)($r['ops_manager'] ?? ''));
            $key = strtolower($name);
            if (!isset($seenNames[$key])) {
                $tls[] = [
                    'id' => 0,
                    'ecode' => '',
                    'emp_id' => '',
                    'name' => $name,
                    'ops_manager' => $rep,
                    'reporting_to' => $rep,
                    'reporting_level_1' => $rep,
                    'monthly_target' => 0,
                    'target' => 0
                ];
                $seenNames[$key] = count($tls) - 1;
            } elseif ($rep && empty($tls[$seenNames[$key]]['ops_manager'])) {
                $tls[$seenNames[$key]]['ops_manager'] = $rep;
                $tls[$seenNames[$key]]['reporting_to'] = $rep;
                $tls[$seenNames[$key]]['reporting_level_1'] = $rep;
            }
        }
    } catch (Throwable $e) {}

    // 4. Fallback discovery from pp_payments
    try {
        $payTls = $pdo->query("SELECT DISTINCT tl, ops_manager FROM pp_payments WHERE tl IS NOT NULL AND TRIM(tl) != ''")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($payTls as $r) {
            $name = trim((string)($r['tl'] ?? ''));
            if (!$name || strtolower($name) === 'unassigned tl' || strtolower($name) === 'unassigned team leader') continue;
            $rep = trim((string)($r['ops_manager'] ?? ''));
            $key = strtolower($name);
            if (!isset($seenNames[$key])) {
                $tls[] = [
                    'id' => 0,
                    'ecode' => '',
                    'emp_id' => '',
                    'name' => $name,
                    'ops_manager' => $rep,
                    'reporting_to' => $rep,
                    'reporting_level_1' => $rep,
                    'monthly_target' => 0,
                    'target' => 0
                ];
                $seenNames[$key] = count($tls) - 1;
            } elseif ($rep && empty($tls[$seenNames[$key]]['ops_manager'])) {
                $tls[$seenNames[$key]]['ops_manager'] = $rep;
                $tls[$seenNames[$key]]['reporting_to'] = $rep;
                $tls[$seenNames[$key]]['reporting_level_1'] = $rep;
            }
        }
    } catch (Throwable $e) {}

    // Ensure authoritative monthly targets are guaranteed
    foreach ($tls as &$t) {
        if ($t['target'] <= 0) {
            $nLow = strtolower($t['name']);
            if (strpos($nLow, 'mayur') !== false) {
                $t['target'] = 1500000;
                $t['monthly_target'] = 1500000;
                if ($t['id'] > 0) @$pdo->exec("UPDATE pp_team_leaders SET target=1500000, monthly_target=1500000 WHERE id=" . (int)$t['id']);
            } elseif (strpos($nLow, 'viren') !== false) {
                $t['target'] = 1750000;
                $t['monthly_target'] = 1750000;
                if ($t['id'] > 0) @$pdo->exec("UPDATE pp_team_leaders SET target=1750000, monthly_target=1750000 WHERE id=" . (int)$t['id']);
            } elseif (strpos($nLow, 'ritik') !== false) {
                $t['target'] = 1500000;
                $t['monthly_target'] = 1500000;
                if ($t['id'] > 0) @$pdo->exec("UPDATE pp_team_leaders SET target=1500000, monthly_target=1500000 WHERE id=" . (int)$t['id']);
            } elseif (strpos($nLow, 'saif') !== false) {
                $t['target'] = 1750000;
                $t['monthly_target'] = 1750000;
                if ($t['id'] > 0) @$pdo->exec("UPDATE pp_team_leaders SET target=1750000, monthly_target=1750000 WHERE id=" . (int)$t['id']);
            }
        }
    }
    unset($t);

    return $tls;
}

// ========================================================
// REQUEST ROUTING
// ========================================================
$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents('php://input'), true) ?: [];

try {
// 0. HEALTH CHECK
if ($action === 'health' || $action === 'ping') {
    out([
        'status' => 'ok',
        'database' => 'connected',
        'tables' => $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN)
    ]);
}

// 1. LOGIN (PUBLIC - RATE LIMITED & BRUTE-FORCE PROTECTED)
if ($action === 'login') {
    $input = clean_str($data['email'] ?? $data['username'] ?? '', 150);
    check_login_rate_limit($pdo, $input);
    $pass = (string)($data['password'] ?? '');

    if (empty($input) || empty($pass)) {
        record_failed_login($pdo, $input);
        err('Email/Username and Password are required.');
    }

    $u = null;
    $userPrefix = explode('@', $input)[0];

    try {
        $rawUsers = $pdo->query("SELECT * FROM pp_users")->fetchAll();
        foreach ($rawUsers as $row) {
            $rUser = strtolower(trim((string)($row['username'] ?? '')));
            $rEmail = strtolower(trim((string)($row['email'] ?? '')));
            $rFull = strtolower(trim((string)($row['full_name'] ?? $row['name'] ?? '')));

            $inLower = strtolower($input);
            $prefLower = strtolower($userPrefix);

            if (
                ($rUser && ($rUser === $inLower || $rUser === $prefLower)) ||
                ($rEmail && ($rEmail === $inLower || $rEmail === $prefLower)) ||
                ($rFull && ($rFull === $inLower || $rFull === $prefLower))
            ) {
                $u = $row;
                break;
            }
        }
    } catch (Throwable $e) {
        error_log("Login query error: " . $e->getMessage());
    }

    if ($u) {
        $isActive = $u['is_active'] ?? $u['active'] ?? 1;
        if ((int)$isActive === 0) {
            record_failed_login($pdo, $input);
            err('Account is deactivated. Please contact an administrator.');
        }

        // Bcrypt verification with legacy plaintext / MD5 fallback & auto-upgrade
        $storedPwd = (string)($u['password_hash'] ?? $u['password'] ?? '');
        $valid = $storedPwd !== '' && password_verify($pass, $storedPwd);
        if (!$valid && $storedPwd !== '' && ($storedPwd === $pass || md5($pass) === $storedPwd)) {
            $valid = true;
            try {
                $newHash = password_hash($pass, PASSWORD_DEFAULT);
                $pdo->prepare("UPDATE pp_users SET password_hash = ?, password = ? WHERE id = ?")
                    ->execute([$newHash, $newHash, $u['id']]);
            } catch (Throwable $e) {}
        } elseif ($valid && password_needs_rehash($storedPwd, PASSWORD_DEFAULT)) {
            try {
                $newHash = password_hash($pass, PASSWORD_DEFAULT);
                $pdo->prepare("UPDATE pp_users SET password_hash = ?, password = ? WHERE id = ?")
                    ->execute([$newHash, $newHash, $u['id']]);
            } catch (Throwable $e) {}
        }

        if ($valid) {
            clear_login_rate_limit($pdo, $input);
            session_regenerate_id(true);

            $cleanRole = strtoupper(trim((string)($u['role'] ?? 'ENTRY_USER')));
            if (!$cleanRole || $cleanRole === 'AGENT' || $cleanRole === 'TEAM_LEADER') {
                $cleanRole = 'ENTRY_USER';
            }

            $userSession = [
                'id' => (int)$u['id'],
                'name' => ucwords(trim($u['full_name'] ?? $u['name'] ?? $u['username'] ?? 'User')),
                'email' => strtolower(trim($u['email'] ?? ($u['full_name'] && strpos($u['full_name'], '@') !== false ? $u['full_name'] : ($u['username'] . '@portal.com')))),
                'username' => strtolower(trim($u['username'] ?? '')),
                'role' => $cleanRole
            ];

            $_SESSION['pp_user'] = $userSession;
            out(['user' => $userSession]);
        }
    }

    record_failed_login($pdo, $input);
    err('Invalid email/username or password.');
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
            'pan_no' => can_view_pii() ? ($r['pan_no'] ?? '') : mask_id($r['pan_no'] ?? ''),
            'aadhar_no' => can_view_pii() ? ($r['aadhar_no'] ?? '') : mask_id($r['aadhar_no'] ?? ''),
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

    $ops = get_all_ops_managers($pdo);
    $tls = get_all_team_leaders($pdo);

    out(['agents' => $agents, 'ops_managers' => $ops, 'team_leaders' => $tls, 'rows' => $agents]);
}

// 5b. OPS MANAGERS DIRECTORY (REQUIRES AUTH)
if ($action === 'ops_managers') {
    require_auth();
    $ops = get_all_ops_managers($pdo);
    out(['opsManagers' => $ops, 'ops_managers' => $ops]);
}

// 5c. TEAM LEADERS DIRECTORY (REQUIRES AUTH)
if ($action === 'team_leaders') {
    require_auth();
    $tls = get_all_team_leaders($pdo);
    out(['teamLeaders' => $tls, 'team_leaders' => $tls]);
}

// 6. CLIENTS DIRECTORY & KYC (REQUIRES AUTH)
if ($action === 'clients') {
    require_auth();

    $clients = $pdo->query("SELECT id, client_name, client_number, email_id, pan_no, aadhar_no, state, created_at FROM pp_clients ORDER BY id DESC")->fetchAll();
    if (!can_view_pii()) {
        foreach ($clients as &$c) {
            $c['pan_no'] = mask_id($c['pan_no'] ?? '');
            $c['aadhar_no'] = mask_id($c['aadhar_no'] ?? '');
        }
        unset($c);
    }
    out(['rows' => $clients]);
}

// 7. ADMIN STATS & USER MANAGEMENT (REQUIRES ADMIN ROLE)
if ($action === 'admin') {
    require_role(['ADMIN']);

    // Auto-repair any blank roles in pp_users table so they default to ENTRY_USER
    try {
        $pdo->exec("UPDATE pp_users SET role = 'ENTRY_USER' WHERE role IS NULL OR TRIM(role) = '' OR role = 'AGENT' OR role = 'TEAM_LEADER'");
    } catch(Throwable $e) {}

    $users = [];
    try {
        $rawUsers = $pdo->query("SELECT * FROM pp_users ORDER BY id ASC")->fetchAll();
        foreach ($rawUsers as $r) {
            $fName = trim($r['full_name'] ?? $r['name'] ?? '');
            $uName = trim($r['username'] ?? '');
            $eMail = trim($r['email'] ?? '');

            $email = $eMail ?: ($fName && strpos($fName, '@') !== false ? $fName : $uName);
            $name = $fName ?: ($uName ?: 'User');

            $rawRole = strtoupper(trim((string)($r['role'] ?? '')));
            if (!$rawRole || $rawRole === 'AGENT' || $rawRole === 'TEAM_LEADER') {
                $rawRole = 'ENTRY_USER';
            }

            $users[] = [
                'id' => (int)$r['id'],
                'name' => ucwords($name),
                'email' => strtolower($email),
                'username' => strtolower($uName ?: explode('@', $email)[0]),
                'role' => $rawRole,
                'created_at' => $r['created_at'] ?? null
            ];
        }
    } catch(Exception $e) {}

    $paymentsCount = (int)$pdo->query("SELECT COUNT(*) FROM pp_payments")->fetchColumn();
    out(['users' => $users, 'stats' => ['users' => count($users), 'payments' => $paymentsCount]]);
}

// Resilient payment insertion helper - adapts to whatever columns exist in the database table
function insert_payment_row(PDO $pdo, array $fields): int {
    static $cols = null;
    if ($cols === null) {
        $cols = array_map('strtolower', $pdo->query("DESCRIBE `pp_payments`")->fetchAll(PDO::FETCH_COLUMN) ?: []);
    }

    $insertData = [];
    foreach ($fields as $colName => $val) {
        if (in_array(strtolower($colName), $cols, true)) {
            $insertData[$colName] = $val;
        }
    }

    if (empty($insertData)) {
        throw new Exception("No valid columns found to insert into pp_payments");
    }

    $colSql = '`' . implode('`, `', array_keys($insertData)) . '`';
    $placeholders = implode(', ', array_fill(0, count($insertData), '?'));

    $stmt = $pdo->prepare("INSERT INTO `pp_payments` ($colSql) VALUES ($placeholders)");
    $stmt->execute(array_values($insertData));
    return (int)$pdo->lastInsertId();
}

// 8. CREATE PAYMENT (REQUIRES AUTH)
if ($action === 'create_payment') {
    $curUser = require_auth();

    $pDate = clean_str($data['payment_date'] ?? date('Y-m-d'), 20);
    $dt = DateTime::createFromFormat('Y-m-d', $pDate);
    if (!$dt || $dt->format('Y-m-d') !== $pDate) err('Invalid payment date.');
    if ($pDate > date('Y-m-d', strtotime('+1 day'))) err('Payment date cannot be in the future.');

    $agent = clean_str($data['agent_name'] ?? '', 150);
    if ($agent === '') err('Agent name is required.');

    foreach (['usdt', 'divided_by', 'inr_amount'] as $f) {
        if (isset($data[$f]) && $data[$f] !== '' && (!is_numeric($data[$f]) || (float)$data[$f] < 0)) {
            err("Invalid value for $f.");
        }
    }
    $usdt = round((float)($data['usdt'] ?? 0), 2);
    $div = round((float)($data['divided_by'] ?? 0), 2);
    $inr = round((float)($data['inr_amount'] ?? 0), 2);
    if ($usdt <= 0 && $inr <= 0) err('A positive USDT or INR amount is required.');
    if ($usdt > 10000000 || $inr > 1000000000) err('Amount exceeds the allowed limit.');
    if ($usdt > 0) {
        if ($inr > 0 && ($div <= 0 || !isset($data['divided_by']))) {
            $div = round($inr / $usdt, 4);
        }
        if ($div <= 0) $div = 88;
        $expected = round($usdt * $div, 2);
        if ($inr <= 0) {
            $inr = $expected;
        } elseif (abs($inr - $expected) > max(5.0, $expected * 0.05)) {
            // Tolerant to rounding variations in imported sheets
            $div = round($inr / $usdt, 4);
        }
    }

    // Creator is stamped from authenticated session
    $creator = $curUser['name'] ?? 'Staff';
    $mode = clean_str($data['payment_mode'] ?? 'P2P', 50);
    if ($mode === '') $mode = 'P2P';
    $recIn = clean_str($data['received_in'] ?? $data['received_company'] ?? 'Digital Verse', 100);
    $recLow = strtolower($recIn);
    if (strpos($recLow, 'world') !== false || strpos($recLow, 'krypto') !== false || strpos($recLow, 'crypto') !== false || strpos($recLow, 'wk') !== false) {
        $recIn = (strpos($recLow, 'crypto') !== false) ? 'World of Crypto' : 'World of Krypto';
    } elseif (strpos($recLow, 'digital') !== false || strpos($recLow, 'dv') !== false) {
        $recIn = 'Digital Verse';
    }

    $ecode = clean_str($data['ecode'] ?? '', 50);
    $tl = clean_str($data['tl'] ?? '', 150);
    $ops = clean_str($data['ops_manager'] ?? '', 150);
    $cName = clean_str($data['client_name'] ?? '', 150);
    $cNum = clean_phone($data['client_number'] ?? '');
    $email = strtolower(trim(clean_str($data['email_id'] ?? '', 150)));
    $ratio = clean_str($data['ratio'] ?? '', 50);
    $pan = clean_pan($data['pan_no'] ?? '');
    $aadhar = clean_aadhar($data['aadhar_no'] ?? '');
    $state = clean_str($data['state'] ?? '', 100);

    if (is_masked($pan) || is_masked($aadhar)) {
        // A masked value came back from the UI auto-fill; use the stored original instead.
        $real = ['pan_no' => '', 'aadhar_no' => ''];
        if ($cNum) {
            $st = $pdo->prepare("SELECT pan_no, aadhar_no FROM pp_clients WHERE client_number = ? LIMIT 1");
            $st->execute([$cNum]);
            $real = $st->fetch() ?: $real;
        }
        if (is_masked($pan)) $pan = clean_pan((string)($real['pan_no'] ?? ''));
        if (is_masked($aadhar)) $aadhar = clean_aadhar((string)($real['aadhar_no'] ?? ''));
    }

    $kycErr = validate_kyc_rules($cNum, $pan, $aadhar, $email, false);
    if ($kycErr) {
        err($kycErr);
    }

    try {
        $newId = insert_payment_row($pdo, [
            'payment_date' => $pDate,
            'ecode' => $ecode ?: null,
            'e_code' => $ecode ?: null,
            'agent_name' => $agent,
            'tl' => $tl ?: null,
            'tl_name' => $tl ?: null,
            'ops_manager' => $ops ?: null,
            'client_name' => $cName ?: null,
            'client_number' => $cNum ?: null,
            'email_id' => $email ?: null,
            'payment_mode' => $mode,
            'usdt' => $usdt,
            'divided_by' => $div,
            'inr_amount' => $inr,
            'ratio' => $ratio ?: null,
            'pan_no' => $pan ?: null,
            'aadhar_no' => $aadhar ?: null,
            'state' => $state ?: null,
            'received_in' => $recIn,
            'received_company' => $recIn,
            'entered_by' => $creator,
            'created_by_name' => $creator,
            'created_at' => date('Y-m-d H:i:s'),
            'entry_timestamp' => date('Y-m-d H:i:s')
        ]);
        out(['id' => $newId]);
    } catch (Throwable $e) {
        error_log("Create Payment Error: " . $e->getMessage());
        err('Failed to record payment in database: ' . $e->getMessage());
    }
}

// BULK IMPORT (TRANSACTIONAL, FAST, ZERO-CONNECTION EXHAUSTION)
if ($action === 'bulk_import') {
    $curUser = require_role(['ADMIN', 'OPS_MANAGER']);
    $creator = $curUser['name'] ?? 'Staff';

    $opsList = is_array($data['ops'] ?? null) ? $data['ops'] : [];
    $tlsList = is_array($data['tls'] ?? null) ? $data['tls'] : [];
    $agentsList = is_array($data['agents'] ?? null) ? $data['agents'] : [];
    $clientsList = is_array($data['clients'] ?? null) ? $data['clients'] : [];
    $paymentsList = is_array($data['payments'] ?? null) ? $data['payments'] : [];

    $saved = ['ops' => 0, 'tls' => 0, 'agents' => 0, 'clients' => 0, 'payments' => 0];
    $errors = [];

    // 1. Ops Managers
    foreach ($opsList as $o) {
        $name = clean_str($o['name'] ?? '', 150);
        if (!$name) continue;
        $ecode = clean_str($o['ecode'] ?? '', 50);
        $rep = clean_str($o['reporting_to'] ?? $o['parent'] ?? '', 150);
        $target = max(0, floatval($o['target'] ?? 0));

        $foundId = null;
        if ($ecode) {
            $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?)");
            $st->execute([$ecode, $ecode]);
            $foundId = $st->fetchColumn();
        }
        if (!$foundId) {
            $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(name)) = LOWER(?)");
            $st->execute([$name]);
            $foundId = $st->fetchColumn();
        }
        if ($foundId) {
            $pdo->prepare("UPDATE pp_ops_managers SET name = ?, ecode = COALESCE(NULLIF(?, ''), ecode), emp_id = COALESCE(NULLIF(?, ''), emp_id), reporting_to = COALESCE(NULLIF(?, ''), reporting_to), target = CASE WHEN ? > 0 THEN ? ELSE target END WHERE id = ?")
                ->execute([$name, $ecode, $ecode, $rep, $target, $target, $foundId]);
        } else {
            $pdo->prepare("INSERT INTO pp_ops_managers (name, ecode, emp_id, reporting_to, target) VALUES (?, ?, ?, ?, ?)")
                ->execute([$name, $ecode ?: null, $ecode ?: null, $rep ?: null, $target]);
        }
        $saved['ops']++;
    }

    // 2. Team Leaders
    foreach ($tlsList as $t) {
        $name = clean_str($t['name'] ?? '', 150);
        if (!$name) continue;
        $ecode = clean_str($t['ecode'] ?? '', 50);
        $ops = clean_str($t['ops_manager'] ?? $t['parent'] ?? '', 150);
        $target = max(0, floatval($t['target'] ?? 0));

        $foundId = null;
        if ($ecode) {
            $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?)");
            $st->execute([$ecode, $ecode]);
            $foundId = $st->fetchColumn();
        }
        if (!$foundId) {
            $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(name)) = LOWER(?)");
            $st->execute([$name]);
            $foundId = $st->fetchColumn();
        }
        if ($foundId) {
            $pdo->prepare("UPDATE pp_team_leaders SET name = ?, ecode = COALESCE(NULLIF(?, ''), ecode), emp_id = COALESCE(NULLIF(?, ''), emp_id), ops_manager = COALESCE(NULLIF(?, ''), ops_manager), target = CASE WHEN ? > 0 THEN ? ELSE target END WHERE id = ?")
                ->execute([$name, $ecode, $ecode, $ops, $target, $target, $foundId]);
        } else {
            $pdo->prepare("INSERT INTO pp_team_leaders (name, ecode, emp_id, ops_manager, target) VALUES (?, ?, ?, ?, ?)")
                ->execute([$name, $ecode ?: null, $ecode ?: null, $ops ?: null, $target]);
        }
        $saved['tls']++;
    }

    // 3. Agents
    foreach ($agentsList as $a) {
        $name = clean_str($a['name'] ?? $a['agent_name'] ?? '', 150);
        $ecode = clean_str($a['ecode'] ?? $a['emp_id'] ?? '', 50);
        if (!$name && !$ecode) continue;
        if (!$name) $name = $ecode;
        $ops = clean_str($a['ops_manager'] ?? '', 150);
        $tl = clean_str($a['tl'] ?? $a['team_leader'] ?? '', 150);

        $foundId = null;
        if ($ecode) {
            $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?)");
            $st->execute([$ecode, $ecode]);
            $foundId = $st->fetchColumn();
        }
        if (!$foundId && $name) {
            $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?) OR LOWER(TRIM(name)) = LOWER(?)");
            $st->execute([$name, $name]);
            $foundId = $st->fetchColumn();
        }
        if ($foundId) {
            $pdo->prepare("UPDATE pp_agents SET agent_name = ?, name = ?, ecode = COALESCE(NULLIF(?, ''), ecode), emp_id = COALESCE(NULLIF(?, ''), emp_id), ops_manager = COALESCE(NULLIF(?, ''), ops_manager), tl = COALESCE(NULLIF(?, ''), tl) WHERE id = ?")
                ->execute([$name, $name, $ecode, $ecode, $ops, $tl, $foundId]);
        } else {
            $pdo->prepare("INSERT INTO pp_agents (agent_name, name, ecode, emp_id, ops_manager, tl) VALUES (?, ?, ?, ?, ?, ?)")
                ->execute([$name, $name, $ecode ?: null, $ecode ?: null, $ops ?: null, $tl ?: null]);
        }
        $saved['agents']++;
    }

    // 4. Clients KYC
    foreach ($clientsList as $c) {
        $cName = clean_str($c['client_name'] ?? $c['name'] ?? '', 150);
        $cNum = clean_phone($c['client_number'] ?? $c['phone'] ?? '');
        if (!$cName && !$cNum) continue;
        $email = strtolower(trim(clean_str($c['email_id'] ?? $c['email'] ?? '', 150)));
        $pan = clean_pan($c['pan_no'] ?? $c['pan'] ?? '');
        $aadhar = clean_aadhar($c['aadhar_no'] ?? $c['aadhar'] ?? '');
        $state = clean_str($c['state'] ?? '', 100);

        $foundId = null;
        if ($cNum) {
            $st = $pdo->prepare("SELECT id FROM pp_clients WHERE client_number = ? LIMIT 1");
            $st->execute([$cNum]);
            $foundId = $st->fetchColumn();
        }
        if (!$foundId && $cName) {
            $st = $pdo->prepare("SELECT id FROM pp_clients WHERE LOWER(TRIM(client_name)) = LOWER(?) LIMIT 1");
            $st->execute([$cName]);
            $foundId = $st->fetchColumn();
        }
        if ($foundId) {
            $pdo->prepare("UPDATE pp_clients SET 
                client_name = COALESCE(NULLIF(?, ''), client_name),
                client_number = COALESCE(NULLIF(?, ''), client_number),
                email_id = COALESCE(NULLIF(?, ''), email_id),
                pan_no = COALESCE(NULLIF(?, ''), pan_no),
                aadhar_no = COALESCE(NULLIF(?, ''), aadhar_no),
                state = COALESCE(NULLIF(?, ''), state)
                WHERE id = ?")
                ->execute([$cName, $cNum, $email, $pan, $aadhar, $state, $foundId]);
        } else {
            $pdo->prepare("INSERT INTO pp_clients (client_name, client_number, email_id, pan_no, aadhar_no, state) VALUES (?, ?, ?, ?, ?, ?)")
                ->execute([$cName ?: 'Unknown', $cNum ?: null, $email ?: null, $pan ?: null, $aadhar ?: null, $state ?: null]);
        }
        $saved['clients']++;
    }

    // 5. Payments
    foreach ($paymentsList as $p) {
        $pDate = clean_str($p['payment_date'] ?? date('Y-m-d'), 20);
        $agent = clean_str($p['agent_name'] ?? '', 150);
        if (!$agent) $agent = 'Unassigned Agent';
        $usdt = round((float)($p['usdt'] ?? 0), 2);
        $inr = round((float)($p['inr_amount'] ?? 0), 2);
        if ($usdt <= 0 && $inr <= 0) continue;

        $ecode = clean_str($p['ecode'] ?? '', 50);
        $tl = clean_str($p['tl'] ?? '', 150);
        $ops = clean_str($p['ops_manager'] ?? '', 150);
        $cName = clean_str($p['client_name'] ?? '', 150);
        $cNum = clean_phone($p['client_number'] ?? '');
        $email = strtolower(trim(clean_str($p['email_id'] ?? '', 150)));
        $mode = clean_str($p['payment_mode'] ?? 'P2P', 50);
        $ratio = clean_str($p['ratio'] ?? '', 50);
        $pan = clean_pan($p['pan_no'] ?? '');
        $aadhar = clean_aadhar($p['aadhar_no'] ?? '');
        $state = clean_str($p['state'] ?? '', 100);
        $recIn = clean_str($p['received_in'] ?? $p['received_company'] ?? 'Digital Verse', 100);
        $recLow = strtolower($recIn);
        if (strpos($recLow, 'world') !== false || strpos($recLow, 'krypto') !== false || strpos($recLow, 'crypto') !== false || strpos($recLow, 'wk') !== false) {
            $recIn = (strpos($recLow, 'crypto') !== false) ? 'World of Crypto' : 'World of Krypto';
        } elseif (strpos($recLow, 'digital') !== false || strpos($recLow, 'dv') !== false) {
            $recIn = 'Digital Verse';
        }
        $div = round((float)($p['divided_by'] ?? 0), 2);
        if ($usdt > 0 && $inr > 0 && ($div <= 0 || !isset($p['divided_by']))) {
            $div = round($inr / $usdt, 4);
        }
        if ($div <= 0) $div = 88;

        try {
            insert_payment_row($pdo, [
                'payment_date' => $pDate,
                'ecode' => $ecode ?: null,
                'e_code' => $ecode ?: null,
                'agent_name' => $agent,
                'tl' => $tl ?: null,
                'tl_name' => $tl ?: null,
                'ops_manager' => $ops ?: null,
                'client_name' => $cName ?: null,
                'client_number' => $cNum ?: null,
                'email_id' => $email ?: null,
                'payment_mode' => $mode ?: 'P2P',
                'usdt' => $usdt,
                'divided_by' => $div,
                'inr_amount' => $inr,
                'ratio' => $ratio ?: null,
                'pan_no' => $pan ?: null,
                'aadhar_no' => $aadhar ?: null,
                'state' => $state ?: null,
                'received_in' => $recIn ?: 'Digital Verse',
                'received_company' => $recIn ?: 'Digital Verse',
                'entered_by' => $creator,
                'created_by_name' => $creator,
                'created_at' => date('Y-m-d H:i:s'),
                'entry_timestamp' => date('Y-m-d H:i:s')
            ]);
            $saved['payments']++;
        } catch (Throwable $pe) {
            $errors[] = "Payment for $agent: " . $pe->getMessage();
        }
    }

    out(['success' => true, 'saved' => $saved, 'errors' => $errors]);
}

if ($action === 'delete_payment') {
    require_role(['ADMIN', 'OPS_MANAGER']);
    $id = (int)($data['id'] ?? 0);
    if ($id <= 0) err('Payment ID is required.');
    $pdo->prepare("DELETE FROM pp_payments WHERE id = ?")->execute([$id]);
    out(['success' => true]);
}

// 9. CREATE USER (REQUIRES ADMIN ROLE)
if ($action === 'create_user') {
    require_role(['ADMIN']);

    $name = clean_str($data['name'] ?? $data['full_name'] ?? '', 100);
    $email = strtolower(clean_str($data['email'] ?? '', 150));
    $password = (string)($data['password'] ?? '');
    if (empty($name) || empty($email)) {
        err('Full Name and Email Address are required.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        err('Please provide a valid email address.');
    }
    if (strlen($password) < 6) {
        err('Password must be at least 6 characters long.');
    }

    $rawRole = strtoupper(clean_str($data['role'] ?? 'ENTRY_USER', 30));
    $validRoles = ['ADMIN', 'OPS_MANAGER', 'ENTRY_USER', 'AGENT', 'TEAM_LEADER', 'ACCOUNTS'];
    if (!in_array($rawRole, $validRoles, true) || $rawRole === 'AGENT' || $rawRole === 'TEAM_LEADER' || empty($rawRole)) {
        $rawRole = 'ENTRY_USER';
    }
    $role = $rawRole;

    // Ensure role column in pp_users supports VARCHAR so it never rejects valid roles
    try {
        $pdo->exec("ALTER TABLE `pp_users` MODIFY COLUMN `role` VARCHAR(50) NOT NULL DEFAULT 'AGENT'");
    } catch(Throwable $e) {}

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

    // Inspect pp_users schema to dynamically construct compatible INSERT query
    $desc = [];
    try {
        $desc = $pdo->query("DESCRIBE pp_users")->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {}

    $fieldsToInsert = [];
    $valuesToInsert = [];

    if (!empty($desc)) {
        foreach ($desc as $col) {
            $field = $col['Field'];
            $fieldLower = strtolower($field);
            $type = strtolower($col['Type'] ?? '');

            if ($fieldLower === 'id') continue; // auto increment

            if (in_array($fieldLower, ['username', 'user_name', 'uname'])) {
                $fieldsToInsert[] = "`$field`";
                $valuesToInsert[] = $username;
            } elseif (in_array($fieldLower, ['name', 'full_name', 'fullname', 'display_name'])) {
                $fieldsToInsert[] = "`$field`";
                $valuesToInsert[] = $name;
            } elseif ($fieldLower === 'email') {
                $fieldsToInsert[] = "`$field`";
                $valuesToInsert[] = $email;
            } elseif (in_array($fieldLower, ['password', 'password_hash', 'pwd', 'pass'])) {
                $fieldsToInsert[] = "`$field`";
                $valuesToInsert[] = $passHash;
            } elseif ($fieldLower === 'role') {
                $fieldsToInsert[] = "`$field`";
                // If enum in MySQL uses lowercase values
                if (strpos($type, "'entry_user'") !== false || strpos($type, "'admin'") !== false) {
                    $valuesToInsert[] = strtolower($role);
                } else {
                    $valuesToInsert[] = $role;
                }
            } elseif (in_array($fieldLower, ['active', 'is_active', 'status'])) {
                $fieldsToInsert[] = "`$field`";
                $valuesToInsert[] = 1;
            } elseif ($fieldLower === 'created_at') {
                $fieldsToInsert[] = "`$field`";
                $valuesToInsert[] = date('Y-m-d H:i:s');
            }
        }
    }

    $created = false;
    $lastErr = '';

    if (!empty($fieldsToInsert)) {
        $placeholders = array_fill(0, count($fieldsToInsert), '?');
        $sql = "INSERT INTO pp_users (" . implode(', ', $fieldsToInsert) . ") VALUES (" . implode(', ', $placeholders) . ")";
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($valuesToInsert);
            $created = true;
        } catch (Throwable $e) {
            $lastErr = $e->getMessage();
        }
    }

    // Fallback if dynamic discovery yielded no fields or failed
    if (!$created) {
        try {
            $stmt = $pdo->prepare("INSERT INTO pp_users (name, email, password, role, active) VALUES (?, ?, ?, ?, 1)");
            $stmt->execute([$name, $email, $passHash, $role]);
            $created = true;
        } catch (Throwable $e1) {
            try {
                $stmt = $pdo->prepare("INSERT INTO pp_users (username, full_name, email, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?, 1)");
                $stmt->execute([$username, $name, $email, $role, $passHash]);
                $created = true;
            } catch (Throwable $e2) {
                $lastErr = $e2->getMessage() ?: $e1->getMessage();
            }
        }
    }

    if ($created) {
        out(['id' => (int)$pdo->lastInsertId(), 'success' => true]);
    } else {
        error_log("Create User Error: " . $lastErr);
        err('Failed to create user: ' . $lastErr);
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
    if (!$foundId && $ecode) {
        $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?)");
        $st->execute([$ecode, $ecode]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId) {
        $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(name)) = LOWER(?)");
        $st->execute([$name]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId) {
        $firstToken = explode(' ', strtolower(trim($name)))[0];
        if (strlen($firstToken) >= 3) {
            $all = $pdo->query("SELECT id, name FROM pp_ops_managers")->fetchAll();
            foreach ($all as $item) {
                $itemFirst = explode(' ', strtolower(trim($item['name'] ?? '')))[0];
                if ($itemFirst === $firstToken) {
                    $foundId = $item['id'];
                    break;
                }
            }
        }
    }

    if ($foundId) {
        $st = $pdo->prepare("SELECT * FROM pp_ops_managers WHERE id = ?");
        $st->execute([$foundId]);
        $old = $st->fetch();
        if ($old) {
            if (!$ecode && !empty($old['ecode'])) $ecode = $old['ecode'];
            if (!$rep && !empty($old['reporting_to'])) $rep = $old['reporting_to'];
            if ($target <= 0 && !empty($old['target'])) $target = floatval($old['target']);
        }
        $stmt = $pdo->prepare("UPDATE pp_ops_managers SET ecode=?, emp_id=?, name=?, reporting_to=?, reporting_level_1=?, target=?, monthly_target=? WHERE id=?");
        $stmt->execute([$ecode, $ecode, $name, $rep, $rep, $target, $target, $foundId]);
        if ($ecode) {
            $pdo->prepare("DELETE FROM pp_ops_managers WHERE id != ? AND (LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?) OR LOWER(TRIM(name)) = LOWER(?))")->execute([$foundId, $ecode, $ecode, $name]);
        }
    } else {
        $stmt = $pdo->prepare("INSERT INTO pp_ops_managers (ecode, emp_id, name, reporting_to, reporting_level_1, target, monthly_target) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$ecode, $ecode, $name, $rep, $rep, $target, $target]);
    }

    if ($prevName && strcasecmp($prevName, $name) !== 0) {
        $pdo->prepare("UPDATE pp_team_leaders SET reporting_level_1 = ?, ops_manager = ?, reporting_to = ? WHERE LOWER(TRIM(reporting_level_1)) = LOWER(?) OR LOWER(TRIM(ops_manager)) = LOWER(?) OR LOWER(TRIM(reporting_to)) = LOWER(?)")->execute([$name, $name, $name, $prevName, $prevName, $prevName]);
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
        try { $pdo->prepare("UPDATE pp_team_leaders SET reporting_level_1 = '', ops_manager = '', reporting_to = '' WHERE LOWER(TRIM(reporting_level_1)) = LOWER(?) OR LOWER(TRIM(ops_manager)) = LOWER(?) OR LOWER(TRIM(reporting_to)) = LOWER(?)")->execute([$name, $name, $name]); } catch (Throwable $e) {}
        try { $pdo->prepare("UPDATE pp_agents SET ops_manager = '' WHERE LOWER(TRIM(ops_manager)) = LOWER(?)")->execute([$name]); } catch (Throwable $e) {}
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
    if (!$foundId && $ecode) {
        $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?)");
        $st->execute([$ecode, $ecode]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId) {
        $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(name)) = LOWER(?)");
        $st->execute([$name]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId) {
        $firstToken = explode(' ', strtolower(trim($name)))[0];
        if (strlen($firstToken) >= 3) {
            $all = $pdo->query("SELECT id, name FROM pp_team_leaders")->fetchAll();
            foreach ($all as $item) {
                $itemFirst = explode(' ', strtolower(trim($item['name'] ?? '')))[0];
                if ($itemFirst === $firstToken) {
                    $foundId = $item['id'];
                    break;
                }
            }
        }
    }

    if ($foundId) {
        $st = $pdo->prepare("SELECT * FROM pp_team_leaders WHERE id = ?");
        $st->execute([$foundId]);
        $old = $st->fetch();
        if ($old) {
            if (!$ecode && !empty($old['ecode'])) $ecode = $old['ecode'];
            if (!$ops && !empty($old['ops_manager'])) $ops = $old['ops_manager'];
            if ($target <= 0 && !empty($old['target'])) $target = floatval($old['target']);
        }
        $stmt = $pdo->prepare("UPDATE pp_team_leaders SET ecode=?, emp_id=?, name=?, ops_manager=?, reporting_level_1=?, reporting_to=?, target=?, monthly_target=? WHERE id=?");
        $stmt->execute([$ecode, $ecode, $name, $ops, $ops, $ops, $target, $target, $foundId]);
        if ($ecode) {
            $pdo->prepare("DELETE FROM pp_team_leaders WHERE id != ? AND (LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?) OR LOWER(TRIM(name)) = LOWER(?))")->execute([$foundId, $ecode, $ecode, $name]);
        }
    } else {
        $stmt = $pdo->prepare("INSERT INTO pp_team_leaders (ecode, emp_id, name, ops_manager, reporting_level_1, reporting_to, target, monthly_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$ecode, $ecode, $name, $ops, $ops, $ops, $target, $target]);
    }

    if ($prevName && strcasecmp($prevName, $name) !== 0) {
        $pdo->prepare("UPDATE pp_agents SET tl = ?, team_leader = ? WHERE LOWER(TRIM(tl)) = LOWER(?) OR LOWER(TRIM(team_leader)) = LOWER(?)")->execute([$name, $name, $prevName, $prevName]);
        $pdo->prepare("UPDATE pp_payments SET tl = ?, tl_name = ? WHERE LOWER(TRIM(tl)) = LOWER(?) OR LOWER(TRIM(tl_name)) = LOWER(?)")->execute([$name, $name, $prevName, $prevName]);
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
        try { $pdo->prepare("UPDATE pp_agents SET tl = '', team_leader = '' WHERE LOWER(TRIM(tl)) = LOWER(?) OR LOWER(TRIM(team_leader)) = LOWER(?)")->execute([$name, $name]); } catch (Throwable $e) {}
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
        $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?) OR LOWER(TRIM(name)) = LOWER(?)");
        $st->execute([$prevName, $prevName]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId && $ecode) {
        $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?)");
        $st->execute([$ecode, $ecode]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId) {
        $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?) OR LOWER(TRIM(name)) = LOWER(?)");
        $st->execute([$name, $name]);
        $foundId = $st->fetchColumn();
    }

    if ($foundId) {
        $stmt = $pdo->prepare("UPDATE pp_agents SET ecode=?, emp_id=?, agent_name=?, name=?, ops_manager=?, tl=?, team_leader=? WHERE id=?");
        $stmt->execute([$ecode, $ecode, $name, $name, $ops, $tl, $tl, $foundId]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO pp_agents (ecode, emp_id, agent_name, name, ops_manager, tl, team_leader) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$ecode, $ecode, $name, $name, $ops, $tl, $tl]);
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
        try { $pdo->prepare("DELETE FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?) OR LOWER(TRIM(name)) = LOWER(?)")->execute([$name, $name]); } catch (Throwable $e) {}
    }
    if ($ecode) {
        try { $pdo->prepare("DELETE FROM pp_agents WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?)")->execute([$ecode, $ecode]); } catch (Throwable $e) {}
    }
    out(['success' => true]);
}

// 12. CLIENTS MANAGEMENT
if ($action === 'upsert_client_node') {
    require_auth(); // Allowed during payment recording by any authenticated staff

    $cName = clean_str($data['client_name'] ?? '', 150);
    $cNum = clean_phone($data['client_number'] ?? '');
    $email = strtolower(trim(clean_str($data['email_id'] ?? '', 150)));
    $pan = clean_pan($data['pan_no'] ?? '');
    $aadhar = clean_aadhar($data['aadhar_no'] ?? '');
    $state = clean_str($data['state'] ?? '', 100);

    if (!$cName && !$cNum) err('Client Name or Phone Number is required.');

    $kycErr = validate_kyc_rules($cNum, $pan, $aadhar, $email, false);
    if ($kycErr) {
        err($kycErr);
    }

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

// 13. ACCOUNTS LEDGER MANAGEMENT (REQUIRES ADMIN ONLY)
if ($action === 'accounts') {
    require_role(['ADMIN']);

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
    } catch(Throwable $e) {}    

    // Auto-migrate any missing columns on existing Hostinger table
    try {
        $existingCols = $pdo->query("DESCRIBE `pp_accounts`")->fetchAll(PDO::FETCH_COLUMN);
        $colLower = array_map('strtolower', $existingCols ?: []);
        if (!in_array('type', $colLower)) {
            @$pdo->exec("ALTER TABLE `pp_accounts` ADD COLUMN `type` varchar(50) DEFAULT 'CASH_HANDOVER'");
        }
        if (!in_array('remarks', $colLower) && !in_array('description', $colLower)) {
            @$pdo->exec("ALTER TABLE `pp_accounts` ADD COLUMN `remarks` text DEFAULT NULL");
        }
        if (!in_array('handled_by', $colLower)) {
            @$pdo->exec("ALTER TABLE `pp_accounts` ADD COLUMN `handled_by` varchar(255) DEFAULT NULL");
        }
        if (!in_array('created_at', $colLower)) {
            @$pdo->exec("ALTER TABLE `pp_accounts` ADD COLUMN `created_at` datetime DEFAULT CURRENT_TIMESTAMP");
        }
    } catch (Throwable $e) {}

    $entries = [];
    try {
        $raw = $pdo->query("SELECT * FROM pp_accounts ORDER BY id DESC")->fetchAll();
        foreach ($raw as $r) {
            $entries[] = [
                'id' => (int)($r['id'] ?? 0),
                'date' => $r['date'] ?? date('Y-m-d'),
                'type' => $r['type'] ?? 'CASH_HANDOVER',
                'amount' => floatval($r['amount'] ?? 0),
                'remarks' => $r['remarks'] ?? $r['description'] ?? '',
                'handled_by' => $r['handled_by'] ?? '',
                'created_at' => $r['created_at'] ?? ''
            ];
        }
    } catch(Throwable $e) {
        error_log("Accounts fetch error: " . $e->getMessage());
    }

    out(['rows' => $entries]);
}

if ($action === 'upsert_account_node') {
    require_role(['ADMIN']);    

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
    require_role(['ADMIN']);

    $id = (int)($data['id'] ?? 0);
    if ($id <= 0) err('A ledger entry id is required to delete an entry.');
    $pdo->prepare("DELETE FROM pp_accounts WHERE id = ?")->execute([$id]);
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
        $stmt = $pdo->prepare("UPDATE pp_ops_managers SET target = ?, monthly_target = ? WHERE LOWER(TRIM(name)) = LOWER(?)");
        $stmt->execute([$target, $target, $name]);
    } elseif ($type === 'TL') {
        $stmt = $pdo->prepare("UPDATE pp_team_leaders SET target = ?, monthly_target = ? WHERE LOWER(TRIM(name)) = LOWER(?)");
        $stmt->execute([$target, $target, $name]);
    }
    out(['success' => true]);
}

// 15. SAFE PRODUCTION DATA RESET (ADMIN ONLY, DISABLED BY DEFAULT)
if ($action === 'wipe_database_records') {
    $me = require_role(['ADMIN']);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required.', 405);
    if (empty($pp_allow_wipe)) err('Database wipe is disabled on this server (set allow_wipe in config.php to enable it temporarily).', 403);

    $scope = $data['scope'] ?? 'all';
    if (!in_array($scope, ['all', 'payments', 'accounts'], true)) err('Invalid scope.');

    if (($data['confirm'] ?? '') !== 'DELETE ' . strtoupper($scope)) {
        err('Confirmation text missing or incorrect.');
    }
    // Re-authenticate: a hijacked session alone must not be able to wipe data
    $st = $pdo->prepare("SELECT * FROM pp_users WHERE id = ?");
    $st->execute([(int)$me['id']]);
    $meRow = $st->fetch();
    $storedPw = (string)($meRow['password_hash'] ?? $meRow['password'] ?? '');
    $inputPw = (string)($data['password'] ?? '');
    $validPw = ($storedPw !== '' && password_verify($inputPw, $storedPw))
            || ($storedPw !== '' && ($storedPw === $inputPw || md5($inputPw) === $storedPw));
    if (!$validPw) {
        err('Password confirmation failed.', 403);
    }

    // 1. AUTOMATIC SERVER-SIDE BACKUP BEFORE WIPING
    $serverBackupFile = null;
    try {
        $backupDir = __DIR__ . '/backups';
        if (!is_dir($backupDir)) {
            @mkdir($backupDir, 0755, true);
            @file_put_contents($backupDir . '/.htaccess', "Order Deny,Allow\nDeny from all\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n");
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

    if (!$serverBackupFile || !is_file(__DIR__ . '/backups/' . $serverBackupFile) || filesize(__DIR__ . '/backups/' . $serverBackupFile) < 50) {
        err('Pre-wipe backup failed; nothing was deleted.', 500);
    }

    // Disable foreign key constraints temporarily for clean wipe
    try { $pdo->exec("SET FOREIGN_KEY_CHECKS = 0"); } catch (Throwable $e) {}

    if ($scope === 'all' || $scope === 'payments') {
        $pdo->exec("DELETE FROM pp_payments");
    }

    if ($scope === 'all' || $scope === 'accounts') {
        $pdo->exec("DELETE FROM pp_accounts");
    }

    if ($scope === 'all') {
        $otherTables = ['pp_clients', 'pp_agents', 'pp_ops_managers', 'pp_team_leaders'];
        foreach ($otherTables as $tbl) {
            try { $pdo->exec("DELETE FROM `$tbl`"); } catch (Throwable $t) { error_log("Wipe failed for $tbl: " . $t->getMessage()); }
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
