<?php
date_default_timezone_set('Asia/Kolkata');

// ========================================================
// SECURITY HEADERS & CORS HARDENING
// ========================================================
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$httpHost = $_SERVER['HTTP_HOST'] ?? '';

// Restrict CORS safely (allow same host, subdomain, or local dev origins)
if (!empty($origin)) {
    $originHost = parse_url($origin, PHP_URL_HOST);
    $isLocal = in_array($originHost, ['localhost', '127.0.0.1', '::1'], true);
    if ($originHost === $httpHost || (strpos($httpHost, ':') !== false && $originHost === explode(':', $httpHost)[0]) || $isLocal) {
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
$pp_allow_wipe = false; // Disabled by default for security

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

function is_local_env(): bool {
    $h = $_SERVER['HTTP_HOST'] ?? '';
    return in_array($h, ['localhost', '127.0.0.1', '::1'], true) || strpos($h, 'localhost:') === 0;
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

try {
    $pdo->exec("SET time_zone = '+05:30'");
} catch(Throwable $e) {}

// Auto-align all database table columns with live system requirements safely and independently
function safe_db_exec(PDO $pdo, string $sql, array $params = []) {
    try {
        if (empty($params)) {
            $pdo->exec($sql);
        } else {
            $st = $pdo->prepare($sql);
            $st->execute($params);
        }
    } catch (Throwable $e) {
        error_log("safe_db_exec notice: " . $e->getMessage());
    }
}

function get_table_cols(PDO $pdo, string $table): array {
    static $cache = [];
    if (!isset($cache[$table])) {
        try {
            $raw = $pdo->query("DESCRIBE `$table`")->fetchAll(PDO::FETCH_COLUMN) ?: [];
            $cache[$table] = array_map('strtolower', $raw);
        } catch (Throwable $e) {
            $cache[$table] = [];
        }
    }
    return $cache[$table];
}

// 1. pp_users
try {
    $uCols = get_table_cols($pdo, 'pp_users');
    if (!in_array('name', $uCols) && in_array('full_name', $uCols)) {
        safe_db_exec($pdo, "ALTER TABLE `pp_users` ADD COLUMN `name` VARCHAR(150) DEFAULT NULL");
        safe_db_exec($pdo, "UPDATE `pp_users` SET `name` = `full_name` WHERE `name` IS NULL");
    }
    if (!in_array('email', $uCols)) {
        safe_db_exec($pdo, "ALTER TABLE `pp_users` ADD COLUMN `email` VARCHAR(150) DEFAULT NULL");
        safe_db_exec($pdo, "UPDATE `pp_users` SET `email` = `full_name` WHERE `full_name` LIKE '%@%' AND (`email` IS NULL OR `email` = '')");
    }
    if (!in_array('password', $uCols) && in_array('password_hash', $uCols)) {
        safe_db_exec($pdo, "ALTER TABLE `pp_users` ADD COLUMN `password` VARCHAR(255) DEFAULT NULL");
        safe_db_exec($pdo, "UPDATE `pp_users` SET `password` = `password_hash` WHERE `password` IS NULL");
    }
    if (!in_array('password_hash', $uCols) && in_array('password', $uCols)) {
        safe_db_exec($pdo, "ALTER TABLE `pp_users` ADD COLUMN `password_hash` VARCHAR(255) DEFAULT NULL");
        safe_db_exec($pdo, "UPDATE `pp_users` SET `password_hash` = `password` WHERE `password_hash` IS NULL");
    }
    if (!in_array('is_active', $uCols)) {
        safe_db_exec($pdo, "ALTER TABLE `pp_users` ADD COLUMN `is_active` TINYINT(1) DEFAULT 1");
    }
    safe_db_exec($pdo, "ALTER TABLE `pp_users` MODIFY COLUMN `role` VARCHAR(50) NOT NULL DEFAULT 'ENTRY_USER'");
    safe_db_exec($pdo, "UPDATE `pp_users` SET `role` = 'ENTRY_USER' WHERE `role` IS NULL OR TRIM(`role`) = '' OR `role` = 'AGENT' OR `role` = 'TEAM_LEADER'");
} catch (Throwable $e) { error_log("Migration pp_users: " . $e->getMessage()); }

// 2. pp_ops_managers
try {
    $opsCols = get_table_cols($pdo, 'pp_ops_managers');
    if (!in_array('ecode', $opsCols)) safe_db_exec($pdo, "ALTER TABLE `pp_ops_managers` ADD COLUMN `ecode` VARCHAR(50) DEFAULT NULL");
    if (!in_array('emp_id', $opsCols)) safe_db_exec($pdo, "ALTER TABLE `pp_ops_managers` ADD COLUMN `emp_id` VARCHAR(50) DEFAULT NULL");
    if (!in_array('target', $opsCols)) safe_db_exec($pdo, "ALTER TABLE `pp_ops_managers` ADD COLUMN `target` DECIMAL(15,2) DEFAULT 0.00");
    if (!in_array('monthly_target', $opsCols)) safe_db_exec($pdo, "ALTER TABLE `pp_ops_managers` ADD COLUMN `monthly_target` DECIMAL(15,2) DEFAULT 0.00");
    if (!in_array('reporting_to', $opsCols)) safe_db_exec($pdo, "ALTER TABLE `pp_ops_managers` ADD COLUMN `reporting_to` VARCHAR(255) DEFAULT NULL");
    if (!in_array('reporting_level_1', $opsCols)) safe_db_exec($pdo, "ALTER TABLE `pp_ops_managers` ADD COLUMN `reporting_level_1` VARCHAR(255) DEFAULT NULL");
    safe_db_exec($pdo, "UPDATE `pp_ops_managers` SET `ecode` = `emp_id` WHERE (`ecode` IS NULL OR `ecode` = '') AND `emp_id` IS NOT NULL AND `emp_id` != ''");
    safe_db_exec($pdo, "UPDATE `pp_ops_managers` SET `emp_id` = `ecode` WHERE (`emp_id` IS NULL OR `emp_id` = '') AND `ecode` IS NOT NULL AND `ecode` != ''");
    safe_db_exec($pdo, "UPDATE `pp_ops_managers` SET `target` = `monthly_target` WHERE (`target` IS NULL OR `target` = 0) AND `monthly_target` > 0");
    safe_db_exec($pdo, "UPDATE `pp_ops_managers` SET `monthly_target` = `target` WHERE (`monthly_target` IS NULL OR `monthly_target` = 0) AND `target` > 0");
    safe_db_exec($pdo, "UPDATE `pp_ops_managers` SET `reporting_to` = `reporting_level_1` WHERE (`reporting_to` IS NULL OR `reporting_to` = '') AND `reporting_level_1` IS NOT NULL");
    safe_db_exec($pdo, "UPDATE `pp_ops_managers` SET `reporting_level_1` = `reporting_to` WHERE (`reporting_level_1` IS NULL OR `reporting_level_1` = '') AND `reporting_to` IS NOT NULL");
} catch (Throwable $e) { error_log("Migration pp_ops_managers: " . $e->getMessage()); }

// 3. pp_team_leaders
try {
    $tlCols = get_table_cols($pdo, 'pp_team_leaders');
    if (!in_array('ecode', $tlCols)) safe_db_exec($pdo, "ALTER TABLE `pp_team_leaders` ADD COLUMN `ecode` VARCHAR(50) DEFAULT NULL");
    if (!in_array('emp_id', $tlCols)) safe_db_exec($pdo, "ALTER TABLE `pp_team_leaders` ADD COLUMN `emp_id` VARCHAR(50) DEFAULT NULL");
    if (!in_array('target', $tlCols)) safe_db_exec($pdo, "ALTER TABLE `pp_team_leaders` ADD COLUMN `target` DECIMAL(15,2) DEFAULT 0.00");
    if (!in_array('monthly_target', $tlCols)) safe_db_exec($pdo, "ALTER TABLE `pp_team_leaders` ADD COLUMN `monthly_target` DECIMAL(15,2) DEFAULT 0.00");
    if (!in_array('ops_manager', $tlCols)) safe_db_exec($pdo, "ALTER TABLE `pp_team_leaders` ADD COLUMN `ops_manager` VARCHAR(255) DEFAULT NULL");
    if (!in_array('reporting_level_1', $tlCols)) safe_db_exec($pdo, "ALTER TABLE `pp_team_leaders` ADD COLUMN `reporting_level_1` VARCHAR(255) DEFAULT NULL");
    if (!in_array('reporting_to', $tlCols)) safe_db_exec($pdo, "ALTER TABLE `pp_team_leaders` ADD COLUMN `reporting_to` VARCHAR(255) DEFAULT NULL");
    safe_db_exec($pdo, "UPDATE `pp_team_leaders` SET `ecode` = `emp_id` WHERE (`ecode` IS NULL OR `ecode` = '') AND `emp_id` IS NOT NULL AND `emp_id` != ''");
    safe_db_exec($pdo, "UPDATE `pp_team_leaders` SET `emp_id` = `ecode` WHERE (`emp_id` IS NULL OR `emp_id` = '') AND `ecode` IS NOT NULL AND `ecode` != ''");
    safe_db_exec($pdo, "UPDATE `pp_team_leaders` SET `target` = `monthly_target` WHERE (`target` IS NULL OR `target` = 0) AND `monthly_target` > 0");
    safe_db_exec($pdo, "UPDATE `pp_team_leaders` SET `monthly_target` = `target` WHERE (`monthly_target` IS NULL OR `monthly_target` = 0) AND `target` > 0");
    safe_db_exec($pdo, "UPDATE `pp_team_leaders` SET `ops_manager` = COALESCE(NULLIF(`reporting_level_1`,''), `reporting_to`) WHERE `ops_manager` IS NULL OR `ops_manager` = ''");
    safe_db_exec($pdo, "UPDATE `pp_team_leaders` SET `reporting_level_1` = `ops_manager` WHERE `reporting_level_1` IS NULL OR `reporting_level_1` = ''");
    safe_db_exec($pdo, "UPDATE `pp_team_leaders` SET `reporting_to` = `ops_manager` WHERE `reporting_to` IS NULL OR `reporting_to` = ''");
} catch (Throwable $e) { error_log("Migration pp_team_leaders: " . $e->getMessage()); }

// 4. pp_agents
try {
    $agCols = get_table_cols($pdo, 'pp_agents');
    if (!in_array('ecode', $agCols)) safe_db_exec($pdo, "ALTER TABLE `pp_agents` ADD COLUMN `ecode` VARCHAR(50) DEFAULT NULL");
    if (!in_array('emp_id', $agCols)) safe_db_exec($pdo, "ALTER TABLE `pp_agents` ADD COLUMN `emp_id` VARCHAR(50) DEFAULT NULL");
    if (!in_array('agent_name', $agCols)) safe_db_exec($pdo, "ALTER TABLE `pp_agents` ADD COLUMN `agent_name` VARCHAR(255) DEFAULT NULL");
    if (!in_array('name', $agCols)) safe_db_exec($pdo, "ALTER TABLE `pp_agents` ADD COLUMN `name` VARCHAR(255) DEFAULT NULL");
    if (!in_array('tl', $agCols)) safe_db_exec($pdo, "ALTER TABLE `pp_agents` ADD COLUMN `tl` VARCHAR(255) DEFAULT NULL");
    if (!in_array('team_leader', $agCols)) safe_db_exec($pdo, "ALTER TABLE `pp_agents` ADD COLUMN `team_leader` VARCHAR(255) DEFAULT NULL");
    safe_db_exec($pdo, "UPDATE `pp_agents` SET `ecode` = `emp_id` WHERE (`ecode` IS NULL OR `ecode` = '') AND `emp_id` IS NOT NULL AND `emp_id` != ''");
    safe_db_exec($pdo, "UPDATE `pp_agents` SET `emp_id` = `ecode` WHERE (`emp_id` IS NULL OR `emp_id` = '') AND `ecode` IS NOT NULL AND `ecode` != ''");
    safe_db_exec($pdo, "UPDATE `pp_agents` SET `agent_name` = `name` WHERE (`agent_name` IS NULL OR `agent_name` = '') AND `name` IS NOT NULL AND `name` != ''");
    safe_db_exec($pdo, "UPDATE `pp_agents` SET `name` = `agent_name` WHERE (`name` IS NULL OR `name` = '') AND `agent_name` IS NOT NULL AND `agent_name` != ''");
    safe_db_exec($pdo, "UPDATE `pp_agents` SET `tl` = `team_leader` WHERE (`tl` IS NULL OR `tl` = '') AND `team_leader` IS NOT NULL AND `team_leader` != ''");
    safe_db_exec($pdo, "UPDATE `pp_agents` SET `team_leader` = `tl` WHERE (`team_leader` IS NULL OR `team_leader` = '') AND `tl` IS NOT NULL AND `tl` != ''");
} catch (Throwable $e) { error_log("Migration pp_agents: " . $e->getMessage()); }

// 5. pp_clients
try {
    $clCols = get_table_cols($pdo, 'pp_clients');
    if (!in_array('state', $clCols)) safe_db_exec($pdo, "ALTER TABLE `pp_clients` ADD COLUMN `state` VARCHAR(100) DEFAULT NULL");
} catch (Throwable $e) { error_log("Migration pp_clients: " . $e->getMessage()); }

// 6. pp_payments
try {
    $payCols = get_table_cols($pdo, 'pp_payments');
    if (!in_array('ecode', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `ecode` VARCHAR(50) DEFAULT NULL");
    if (!in_array('e_code', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `e_code` VARCHAR(50) DEFAULT NULL");
    if (!in_array('tl', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `tl` VARCHAR(255) DEFAULT NULL");
    if (!in_array('tl_name', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `tl_name` VARCHAR(255) DEFAULT NULL");
    if (!in_array('received_in', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `received_in` VARCHAR(100) DEFAULT 'Digital Verse'");
    if (!in_array('received_company', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `received_company` VARCHAR(100) DEFAULT 'Digital Verse'");
    if (!in_array('state', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `state` VARCHAR(100) DEFAULT NULL");
    if (!in_array('payment_mode', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `payment_mode` VARCHAR(50) DEFAULT 'P2P'");
    if (!in_array('entered_by', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `entered_by` VARCHAR(150) DEFAULT NULL");
    if (!in_array('created_by_name', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `created_by_name` VARCHAR(150) DEFAULT NULL");
    if (!in_array('divided_by', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `divided_by` DECIMAL(10,2) DEFAULT 88.00");
    if (!in_array('ratio', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `ratio` VARCHAR(50) DEFAULT NULL");
    if (!in_array('remarks', $payCols)) safe_db_exec($pdo, "ALTER TABLE `pp_payments` ADD COLUMN `remarks` TEXT DEFAULT NULL");
} catch (Throwable $e) { error_log("Migration pp_payments: " . $e->getMessage()); }

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
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_SEC = 300;
const LOGIN_LOCK_SEC = 180;

function get_client_ip(): string {
    $headers = [
        'HTTP_CF_CONNECTING_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'REMOTE_ADDR'
    ];
    foreach ($headers as $h) {
        if (!empty($_SERVER[$h])) {
            $ips = explode(',', $_SERVER[$h]);
            $clientIp = trim($ips[0]);
            if (filter_var($clientIp, FILTER_VALIDATE_IP)) {
                return $clientIp;
            }
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function login_keys(string $account): array {
    $ip = get_client_ip();
    $keys = [];
    if (!empty($account)) {
        $keys[] = 'acct:' . hash('sha256', strtolower(trim($account)));
    }
    $keys[] = 'ip:' . hash('sha256', $ip);
    return $keys;
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
function is_excel_error(?string $val): bool {
    if (!$val) return false;
    $v = trim((string)$val);
    return (bool)preg_match('/^(#N/A|#VALUE!|#REF!|#DIV/0!|#NAME\?|#NUM!|#NULL!|#N/A N/A)$/i', $v);
}

// Input sanitizer helper
function clean_str($val, $maxLen = 255) {
    if ($val === null) return '';
    $val = trim((string)$val);
    if (is_excel_error($val)) return '';
    $low = strtolower($val);
    if (in_array($low, ['(blank)', '-', 'null', 'undefined', 'na', 'n/a', 'none', 'pending'], true)) return '';
    $val = strip_tags($val);
    if ($maxLen > 0 && mb_strlen($val) > $maxLen) {
        $val = mb_substr($val, 0, $maxLen);
    }
    return $val;
}

function to_title_case(?string $str): string {
    if (!$str) return '';
    return mb_convert_case(trim($str), MB_CASE_TITLE, "UTF-8");
}

// KYC Rules, Normalization & Validation Helpers
function clean_phone(?string $num): string {
    if (!$num) return '';
    if (is_excel_error($num)) return '';
    $digits = preg_replace('/\D/', '', $num);
    if (strlen($digits) === 12 && substr($digits, 0, 2) === '91') {
        $digits = substr($digits, 2);
    } elseif (strlen($digits) === 11 && substr($digits, 0, 1) === '0') {
        $digits = substr($digits, 1);
    }
    return substr($digits, 0, 10);
}

function clean_email(?string $email): string {
    if (!$email) return '';
    if (is_excel_error($email)) return '';
    $val = strtolower(trim((string)$email));
    if (preg_match('/(#|n/a|na|value|ref|div|null|none|pending|\(blank\))/i', $val)) return '';
    return filter_var($val, FILTER_VALIDATE_EMAIL) ? $val : '';
}

function clean_aadhar(?string $aadhar): string {
    if (!$aadhar) return '';
    if (is_excel_error($aadhar)) return '';
    $val = trim((string)$aadhar);
    if (preg_match('/(#|pending|none|null|test|na|n/a|\(blank\))/i', $val)) return '';
    $digits = preg_replace('/\D/', '', $val);
    if (strlen($digits) === 12) {
        if (preg_match('/^(\d)\1{11}$/', $digits)) return '';
        return $digits;
    }
    if (strpos($val, '*') !== false && strlen($val) >= 8) return substr($val, 0, 14);
    return '';
}

function clean_pan(?string $pan): string {
    if (!$pan) return '';
    if (is_excel_error($pan)) return '';
    $val = trim((string)$pan);
    if (preg_match('/(#|mail|consent|received|test|none|null|pending|na|n/a|\(blank\))/i', $val)) {
        if (!preg_match('/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/', strtoupper($val))) {
            return '';
        }
    }
    $cleaned = substr(strtoupper(preg_replace('/[^A-Za-z0-9*]/', '', $val)), 0, 10);
    if (strlen($cleaned) < 10) return '';
    return (preg_match('/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/', $cleaned) || strpos($cleaned, '*') !== false) ? $cleaned : '';
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

    return $tls;
}

// ========================================================
// REQUEST ROUTING
// ========================================================
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$rawBody = file_get_contents('php://input');
$jsonBody = json_decode($rawBody, true);
$data = is_array($jsonBody) ? array_merge($_POST, $jsonBody) : array_merge($_POST, $_GET);

try {
// 0. HEALTH CHECK
if ($action === 'health' || $action === 'ping') {
    $tbls = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $counts = [];
    foreach (['pp_payments', 'pp_agents', 'pp_ops_managers', 'pp_team_leaders', 'pp_clients', 'pp_users'] as $t) {
        if (in_array($t, $tbls, true)) {
            $counts[$t] = (int)$pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
        }
    }
    $payCols = in_array('pp_payments', $tbls, true) ? get_table_cols($pdo, 'pp_payments') : [];
    out([
        'status' => 'ok',
        'database' => 'connected',
        'counts' => $counts,
        'payment_columns' => $payCols,
        'tables' => $tbls
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

// 2. FORGOT PASSWORD (REQUEST RESET LINK / CODE VIA MAIL)
if ($action === 'forgot_password') {
    $rawInput = clean_str($data['email'] ?? $data['username'] ?? '', 150);
    if (empty($rawInput)) {
        err('Please provide your registered email address or username.');
    }

    // Rate-limit forgot password requests per IP & account to avoid spam
    $ip = get_client_ip();
    $throttleKey = 'pwd_reset:' . hash('sha256', $ip . ':' . strtolower($rawInput));
    $pdo->exec("CREATE TABLE IF NOT EXISTS pp_password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(150) NOT NULL,
        token VARCHAR(80) NOT NULL UNIQUE,
        otp_code VARCHAR(10) NOT NULL,
        expires_at INT NOT NULL,
        used INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token),
        INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Check recent request in last 60 seconds
    $recentSt = $pdo->prepare("SELECT COUNT(*) FROM pp_password_resets WHERE email = ? AND expires_at > ? AND used = 0");
    $recentSt->execute([strtolower($rawInput), time()]);
    $recentCount = (int)$recentSt->fetchColumn();
    if ($recentCount >= 3) {
        err('Too many password reset requests. Please wait a few minutes before trying again.', 429);
    }

    // Locate user by email, username, or name
    $foundUser = null;
    try {
        $st = $pdo->prepare("SELECT * FROM pp_users WHERE LOWER(TRIM(COALESCE(email, ''))) = LOWER(?) OR LOWER(TRIM(COALESCE(username, ''))) = LOWER(?) OR LOWER(TRIM(COALESCE(full_name, ''))) = LOWER(?) OR LOWER(TRIM(COALESCE(name, ''))) = LOWER(?) LIMIT 1");
        $st->execute([$rawInput, $rawInput, $rawInput, $rawInput]);
        $foundUser = $st->fetch();
    } catch (Throwable $e) {}

    // For privacy, always report success to the frontend even if user doesn't exist
    if (!$foundUser) {
        out(['message' => 'If an account exists with that email address, a password reset link has been sent.']);
    }

    $destEmail = trim((string)($foundUser['email'] ?? ''));
    if (empty($destEmail) || !filter_var($destEmail, FILTER_VALIDATE_EMAIL)) {
        // Fallback if email was stored in username or full_name
        $fName = trim((string)($foundUser['full_name'] ?? $foundUser['name'] ?? ''));
        if (filter_var($fName, FILTER_VALIDATE_EMAIL)) {
            $destEmail = $fName;
        } else {
            out(['message' => 'If an account exists with that email address, a password reset link has been sent.']);
        }
    }

    $userId = (int)$foundUser['id'];
    $userName = trim((string)($foundUser['full_name'] ?? $foundUser['name'] ?? $foundUser['username'] ?? 'User'));

    // Invalidate prior unused tokens for this user
    try {
        $pdo->prepare("UPDATE pp_password_resets SET used = 1 WHERE user_id = ? AND used = 0")->execute([$userId]);
    } catch (Throwable $e) {}

    // Generate cryptographically secure token & 6-digit OTP code
    $token = bin2hex(random_bytes(24));
    $otp = (string)random_int(100000, 999999);
    $expiresAt = time() + 1800; // 30 minutes validity

    $ins = $pdo->prepare("INSERT INTO pp_password_resets (user_id, email, token, otp_code, expires_at) VALUES (?, ?, ?, ?, ?)");
    $ins->execute([$userId, strtolower($destEmail), $token, $otp, $expiresAt]);

    // Build Reset URL
    $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'zipcar.in';
    $resetUrl = "{$proto}://{$host}/reset-password.html?token=" . urlencode($token);

    // Compose HTML Email
    $subject = "Password Reset Request - Payment Portal";
    $mailHeaders = [
        'MIME-Version: 1.0',
        'Content-type: text/html; charset=utf-8',
        'From: Payment Portal <no-reply@' . preg_replace('/^www\./i', '', $host) . '>',
        'X-Mailer: PHP/' . phpversion()
    ];

    $htmlBody = '<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
            .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            h2 { margin-top: 0; color: #0f172a; font-size: 22px; font-weight: 700; }
            p { font-size: 14.5px; line-height: 1.6; color: #475569; margin: 12px 0; }
            .btn-wrap { margin: 24px 0; text-align: center; }
            .btn { display: inline-block; padding: 13px 26px; background-color: #0284c7; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; }
            .otp-box { background: #f1f5f9; padding: 14px 20px; border-radius: 6px; font-family: monospace; font-size: 22px; font-weight: 700; letter-spacing: 4px; text-align: center; margin: 18px 0; color: #0f172a; }
            .footer { font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 18px; margin-top: 24px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Reset Your Password</h2>
            <p>Hello ' . htmlspecialchars($userName) . ',</p>
            <p>We received a request to reset the password for your Payment Portal account. You can reset your password by clicking the button below or entering the verification code:</p>
            <div class="btn-wrap">
                <a href="' . htmlspecialchars($resetUrl) . '" class="btn" target="_blank">Reset My Password</a>
            </div>
            <p style="text-align:center; font-size:13px; color:#64748b;">Or use this verification code:</p>
            <div class="otp-box">' . htmlspecialchars($otp) . '</div>
            <p style="font-size:13px; color:#64748b;">This reset link and code will expire in 30 minutes. If you did not request this, you can safely ignore this email.</p>
            <div class="footer">
                Payment Portal Security Team
            </div>
        </div>
    </body>
    </html>';

    // SMTP Configuration with fallback
    $smtpHost = getenv('PP_SMTP_HOST') ?: 'smtp.gmail.com';
    $smtpPort = (int)(getenv('PP_SMTP_PORT') ?: 587);
    $smtpUser = getenv('PP_SMTP_USER') ?: 'carrentpedatabase@gmail.com';
    $smtpPass = getenv('PP_SMTP_PASS') ?: 'ydgallypuahfjnrc';
    $fromEmail = getenv('PP_SMTP_FROM') ?: 'carrentpedatabase@gmail.com';
    $fromName = 'Payment Portal Security';

    // Dispatch mail via SMTP with TLS
    $sent = false;
    $mailError = '';

    if (!empty($smtpHost) && !empty($smtpUser) && !empty($smtpPass)) {
        try {
            $socket = @fsockopen(($smtpPort === 465 ? "ssl://$smtpHost" : $smtpHost), $smtpPort, $errno, $errstr, 12);
            if ($socket) {
                $read = function($s) {
                    $res = "";
                    while ($str = fgets($s, 515)) {
                        $res .= $str;
                        if (substr($str, 3, 1) === ' ') break;
                    }
                    return $res;
                };
                $cmd = function($s, $c) use ($read) {
                    fwrite($s, $c . "\r\n");
                    return $read($s);
                };

                $read($socket);
                $cmd($socket, "EHLO " . ($_SERVER['SERVER_NAME'] ?? 'paymentportal'));

                if ($smtpPort === 587) {
                    $cmd($socket, "STARTTLS");
                    stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                    $cmd($socket, "EHLO " . ($_SERVER['SERVER_NAME'] ?? 'paymentportal'));
                }

                $cmd($socket, "AUTH LOGIN");
                $cmd($socket, base64_encode($smtpUser));
                $cmd($socket, base64_encode($smtpPass));

                $cmd($socket, "MAIL FROM: <$fromEmail>");
                $cmd($socket, "RCPT TO: <$destEmail>");
                $cmd($socket, "DATA");

                $headers = [
                    "From: $fromName <$fromEmail>",
                    "To: <$destEmail>",
                    "Subject: $subject",
                    "MIME-Version: 1.0",
                    "Content-Type: text/html; charset=UTF-8",
                    "X-Mailer: PaymentPortal-PHP-SMTP/1.0"
                ];

                $bodyPayload = implode("\r\n", $headers) . "\r\n\r\n" . $htmlBody . "\r\n.\r\n";
                fwrite($socket, $bodyPayload);
                $read($socket);

                $cmd($socket, "QUIT");
                fclose($socket);
                $sent = true;
            }
        } catch (Throwable $e) {
            $mailError = $e->getMessage();
            error_log("SMTP Error: " . $mailError);
        }
    }

    // Fallback to PHP native mail() if SMTP was not able to connect
    if (!$sent) {
        $sent = @mail($destEmail, $subject, $htmlBody, implode("\r\n", $mailHeaders));
    }

    out([
        'message' => 'A password reset link and verification code have been sent to your email address.',
        'email_sent' => $sent,
        'debug_token' => is_local_env() ? $token : null,
        'debug_otp' => is_local_env() ? $otp : null
    ]);
}

// 3. RESET PASSWORD (VERIFY TOKEN & UPDATE PASSWORD)
if ($action === 'reset_password') {
    $token = clean_str($data['token'] ?? '', 80);
    $otp = clean_str($data['otp'] ?? '', 10);
    $newPass = (string)($data['password'] ?? '');

    if (empty($token) && empty($otp)) {
        err('Reset token or verification code is required.');
    }
    if (strlen($newPass) < 6) {
        err('New password must be at least 6 characters long.');
    }

    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS pp_password_resets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            email VARCHAR(150) NOT NULL,
            token VARCHAR(80) NOT NULL UNIQUE,
            otp_code VARCHAR(10) NOT NULL,
            expires_at INT NOT NULL,
            used INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_token (token),
            INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $now = time();
        $row = null;
        if (!empty($token)) {
            $st = $pdo->prepare("SELECT * FROM pp_password_resets WHERE token = ? AND used = 0 AND expires_at > ? LIMIT 1");
            $st->execute([$token, $now]);
            $row = $st->fetch();
        } elseif (!empty($otp)) {
            $st = $pdo->prepare("SELECT * FROM pp_password_resets WHERE otp_code = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1");
            $st->execute([$otp, $now]);
            $row = $st->fetch();
        }

        if (!$row) {
            err('The password reset link or verification code is invalid or has expired. Please request a new one.');
        }

        $userId = (int)$row['user_id'];
        $passHash = password_hash($newPass, PASSWORD_DEFAULT);

        // Update user password in pp_users
        $updated = false;
        try {
            $uSt = $pdo->prepare("UPDATE pp_users SET password_hash = ?, password = ? WHERE id = ?");
            $uSt->execute([$passHash, $passHash, $userId]);
            $updated = true;
        } catch (Throwable $e1) {
            try {
                $uSt = $pdo->prepare("UPDATE pp_users SET password = ? WHERE id = ?");
                $uSt->execute([$passHash, $userId]);
                $updated = true;
            } catch (Throwable $e2) {}
        }

        if (!$updated) {
            err('Failed to update password. Please contact your system administrator.');
        }

        // Mark reset token as used
        $pdo->prepare("UPDATE pp_password_resets SET used = 1 WHERE id = ?")->execute([$row['id']]);

        // Clear any login throttle locks for this account so they can sign in immediately
        clear_login_rate_limit($pdo, $row['email']);

        out(['message' => 'Password has been updated successfully. You can now log in with your new password.']);
    } catch (Throwable $e) {
        error_log('Reset password error: ' . $e->getMessage());
        err('An unexpected error occurred while resetting your password. Please try again.');
    }
}

// 4. LOGOUT (AUTHENTICATED)
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

    $raw = $pdo->query("SELECT * FROM pp_payments ORDER BY payment_date DESC, id DESC")->fetchAll();
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
    // Enforce newest-first ordering in PHP as well as SQL. This is deliberate:
    // some legacy rows may store dates as text, and frontend code may rely on
    // the first item being the newest payment.
    usort($payments, static function (array $a, array $b): int {
        $dateA = trim((string)($a['payment_date'] ?? ''));
        $dateB = trim((string)($b['payment_date'] ?? ''));
        $timeA = strtotime($dateA);
        $timeB = strtotime($dateB);

        // Valid dates sort ahead of unparseable/empty dates.
        if ($timeA === false && $timeB !== false) return 1;
        if ($timeA !== false && $timeB === false) return -1;
        if ($timeA !== false && $timeB !== false && $timeA !== $timeB) {
            return $timeB <=> $timeA;
        }

        // Stable tie-breaker: newest inserted record first for the same date.
        return ((int)($b['id'] ?? 0)) <=> ((int)($a['id'] ?? 0));
    });

    // Keep lastEntry consistent with newest-first report ordering.
    $lastEntry = $payments[0] ?? null;
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
            'tl' => $r['tl'] ?? $r['team_leader'] ?? $r['tl_name'] ?? '',
            'is_active' => isset($r['is_active']) ? (int)$r['is_active'] : 1
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

// Resilient Entity Upsert Helpers - adapt dynamically to MySQL schema and preserve existing data
function upsert_ops_manager_record(PDO $pdo, array $o): int {
    $cols = get_table_cols($pdo, 'pp_ops_managers');
    $name = to_title_case(clean_str($o['name'] ?? '', 150));
    $ecode = clean_str($o['ecode'] ?? $o['emp_id'] ?? '', 50);
    $rep = to_title_case(clean_str($o['reporting_to'] ?? $o['reporting_level_1'] ?? $o['parent'] ?? '', 150));
    $target = max(0, floatval($o['target'] ?? $o['monthly_target'] ?? 0));
    $id = (int)($o['id'] ?? 0);
    $prevName = clean_str($o['prev_name'] ?? '', 150);

    if (!$name && !$ecode) {
        throw new Exception("Ops Manager name or employee code is required");
    }

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
        $hasE = in_array('ecode', $cols, true);
        $hasEmp = in_array('emp_id', $cols, true);
        if ($hasE && $hasEmp) {
            $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?) LIMIT 1");
            $st->execute([$ecode, $ecode]);
            $foundId = $st->fetchColumn();
        } elseif ($hasE) {
            $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(ecode)) = LOWER(?) LIMIT 1");
            $st->execute([$ecode]);
            $foundId = $st->fetchColumn();
        } elseif ($hasEmp) {
            $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(emp_id)) = LOWER(?) LIMIT 1");
            $st->execute([$ecode]);
            $foundId = $st->fetchColumn();
        }
    }
    if (!$foundId && $name) {
        $st = $pdo->prepare("SELECT id FROM pp_ops_managers WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1");
        $st->execute([$name]);
        $foundId = $st->fetchColumn();
    }

    if ($foundId) {
        $st = $pdo->prepare("SELECT * FROM pp_ops_managers WHERE id = ?");
        $st->execute([$foundId]);
        $old = $st->fetch() ?: [];

        $finalName = $name ?: ($old['name'] ?? 'Unknown Ops');
        $finalEcode = $ecode ?: ($old['ecode'] ?? $old['emp_id'] ?? null);
        $finalRep = $rep ?: ($old['reporting_to'] ?? $old['reporting_level_1'] ?? null);
        $finalTarget = $target > 0 ? $target : floatval($old['target'] ?? $old['monthly_target'] ?? 0);

        $sets = ['name = ?'];
        $params = [$finalName];
        if (in_array('ecode', $cols, true)) { $sets[] = 'ecode = ?'; $params[] = $finalEcode; }
        if (in_array('emp_id', $cols, true)) { $sets[] = 'emp_id = ?'; $params[] = $finalEcode; }
        if (in_array('reporting_to', $cols, true)) { $sets[] = 'reporting_to = ?'; $params[] = $finalRep; }
        if (in_array('reporting_level_1', $cols, true)) { $sets[] = 'reporting_level_1 = ?'; $params[] = $finalRep; }
        if (in_array('target', $cols, true)) { $sets[] = 'target = ?'; $params[] = $finalTarget; }
        if (in_array('monthly_target', $cols, true)) { $sets[] = 'monthly_target = ?'; $params[] = $finalTarget; }

        $params[] = $foundId;
        $sql = "UPDATE pp_ops_managers SET " . implode(', ', $sets) . " WHERE id = ?";
        $pdo->prepare($sql)->execute($params);
        return (int)$foundId;
    } else {
        $fields = ['name' => $name ?: 'Unknown Ops'];
        if (in_array('ecode', $cols, true)) $fields['ecode'] = $ecode ?: null;
        if (in_array('emp_id', $cols, true)) $fields['emp_id'] = $ecode ?: null;
        if (in_array('reporting_to', $cols, true)) $fields['reporting_to'] = $rep ?: null;
        if (in_array('reporting_level_1', $cols, true)) $fields['reporting_level_1'] = $rep ?: null;
        if (in_array('target', $cols, true)) $fields['target'] = $target;
        if (in_array('monthly_target', $cols, true)) $fields['monthly_target'] = $target;

        $colList = array_keys($fields);
        $sql = "INSERT INTO pp_ops_managers (`" . implode('`, `', $colList) . "`) VALUES (" . implode(', ', array_fill(0, count($colList), '?')) . ")";
        $pdo->prepare($sql)->execute(array_values($fields));
        return (int)$pdo->lastInsertId();
    }
}

function upsert_team_leader_record(PDO $pdo, array $t): int {
    $cols = get_table_cols($pdo, 'pp_team_leaders');
    $name = to_title_case(clean_str($t['name'] ?? '', 150));
    $ecode = clean_str($t['ecode'] ?? $t['emp_id'] ?? '', 50);
    $ops = to_title_case(clean_str($t['ops_manager'] ?? $t['reporting_to'] ?? $t['reporting_level_1'] ?? $t['parent'] ?? '', 150));
    $target = max(0, floatval($t['target'] ?? $t['monthly_target'] ?? 0));
    $id = (int)($t['id'] ?? 0);
    $prevName = clean_str($t['prev_name'] ?? '', 150);

    if (!$name && !$ecode) {
        throw new Exception("Team Leader name or employee code is required");
    }

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
        $hasE = in_array('ecode', $cols, true);
        $hasEmp = in_array('emp_id', $cols, true);
        if ($hasE && $hasEmp) {
            $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?) LIMIT 1");
            $st->execute([$ecode, $ecode]);
            $foundId = $st->fetchColumn();
        } elseif ($hasE) {
            $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(ecode)) = LOWER(?) LIMIT 1");
            $st->execute([$ecode]);
            $foundId = $st->fetchColumn();
        } elseif ($hasEmp) {
            $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(emp_id)) = LOWER(?) LIMIT 1");
            $st->execute([$ecode]);
            $foundId = $st->fetchColumn();
        }
    }
    if (!$foundId && $name) {
        $st = $pdo->prepare("SELECT id FROM pp_team_leaders WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1");
        $st->execute([$name]);
        $foundId = $st->fetchColumn();
    }

    if ($foundId) {
        $st = $pdo->prepare("SELECT * FROM pp_team_leaders WHERE id = ?");
        $st->execute([$foundId]);
        $old = $st->fetch() ?: [];

        $finalName = $name ?: ($old['name'] ?? 'Unknown TL');
        $finalEcode = $ecode ?: ($old['ecode'] ?? $old['emp_id'] ?? null);
        $finalOps = $ops ?: ($old['ops_manager'] ?? $old['reporting_to'] ?? $old['reporting_level_1'] ?? null);
        $finalTarget = $target > 0 ? $target : floatval($old['target'] ?? $old['monthly_target'] ?? 0);

        $sets = ['name = ?'];
        $params = [$finalName];
        if (in_array('ecode', $cols, true)) { $sets[] = 'ecode = ?'; $params[] = $finalEcode; }
        if (in_array('emp_id', $cols, true)) { $sets[] = 'emp_id = ?'; $params[] = $finalEcode; }
        if (in_array('ops_manager', $cols, true)) { $sets[] = 'ops_manager = ?'; $params[] = $finalOps; }
        if (in_array('reporting_to', $cols, true)) { $sets[] = 'reporting_to = ?'; $params[] = $finalOps; }
        if (in_array('reporting_level_1', $cols, true)) { $sets[] = 'reporting_level_1 = ?'; $params[] = $finalOps; }
        if (in_array('target', $cols, true)) { $sets[] = 'target = ?'; $params[] = $finalTarget; }
        if (in_array('monthly_target', $cols, true)) { $sets[] = 'monthly_target = ?'; $params[] = $finalTarget; }

        $params[] = $foundId;
        $sql = "UPDATE pp_team_leaders SET " . implode(', ', $sets) . " WHERE id = ?";
        $pdo->prepare($sql)->execute($params);
        return (int)$foundId;
    } else {
        $fields = ['name' => $name ?: 'Unknown TL'];
        if (in_array('ecode', $cols, true)) $fields['ecode'] = $ecode ?: null;
        if (in_array('emp_id', $cols, true)) $fields['emp_id'] = $ecode ?: null;
        if (in_array('ops_manager', $cols, true)) $fields['ops_manager'] = $ops ?: null;
        if (in_array('reporting_to', $cols, true)) $fields['reporting_to'] = $ops ?: null;
        if (in_array('reporting_level_1', $cols, true)) $fields['reporting_level_1'] = $ops ?: null;
        if (in_array('target', $cols, true)) $fields['target'] = $target;
        if (in_array('monthly_target', $cols, true)) $fields['monthly_target'] = $target;

        $colList = array_keys($fields);
        $sql = "INSERT INTO pp_team_leaders (`" . implode('`, `', $colList) . "`) VALUES (" . implode(', ', array_fill(0, count($colList), '?')) . ")";
        $pdo->prepare($sql)->execute(array_values($fields));
        return (int)$pdo->lastInsertId();
    }
}

function upsert_agent_record(PDO $pdo, array $a): int {
    $cols = get_table_cols($pdo, 'pp_agents');
    $name = to_title_case(clean_str($a['name'] ?? $a['agent_name'] ?? '', 150));
    $ecode = clean_str($a['ecode'] ?? $a['emp_id'] ?? '', 50);
    $ops = to_title_case(clean_str($a['ops_manager'] ?? '', 150));
    $tl = to_title_case(clean_str($a['tl'] ?? $a['team_leader'] ?? '', 150));
    $id = (int)($a['id'] ?? 0);
    $isActive = isset($a['is_active']) ? (int)$a['is_active'] : 1;

    if (!$name && !$ecode) {
        throw new Exception("Agent name or employee code is required");
    }

    $foundId = null;
    if ($id > 0) {
        $st = $pdo->prepare("SELECT id FROM pp_agents WHERE id = ?");
        $st->execute([$id]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId && $ecode) {
        $hasE = in_array('ecode', $cols, true);
        $hasEmp = in_array('emp_id', $cols, true);
        if ($hasE && $hasEmp) {
            $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?) LIMIT 1");
            $st->execute([$ecode, $ecode]);
            $foundId = $st->fetchColumn();
        } elseif ($hasE) {
            $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(ecode)) = LOWER(?) LIMIT 1");
            $st->execute([$ecode]);
            $foundId = $st->fetchColumn();
        } elseif ($hasEmp) {
            $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(emp_id)) = LOWER(?) LIMIT 1");
            $st->execute([$ecode]);
            $foundId = $st->fetchColumn();
        }
    }
    if (!$foundId && $name) {
        $hasAgentName = in_array('agent_name', $cols, true);
        $hasName = in_array('name', $cols, true);
        if ($hasAgentName && $hasName) {
            $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?) OR LOWER(TRIM(name)) = LOWER(?) LIMIT 1");
            $st->execute([$name, $name]);
            $foundId = $st->fetchColumn();
        } elseif ($hasAgentName) {
            $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?) LIMIT 1");
            $st->execute([$name]);
            $foundId = $st->fetchColumn();
        } elseif ($hasName) {
            $st = $pdo->prepare("SELECT id FROM pp_agents WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1");
            $st->execute([$name]);
            $foundId = $st->fetchColumn();
        }
    }

    if ($foundId) {
        $st = $pdo->prepare("SELECT * FROM pp_agents WHERE id = ?");
        $st->execute([$foundId]);
        $old = $st->fetch() ?: [];

        $finalName = $name ?: ($old['agent_name'] ?? $old['name'] ?? 'Unknown Agent');
        $finalEcode = $ecode ?: ($old['ecode'] ?? $old['emp_id'] ?? null);
        $finalOps = $ops ?: ($old['ops_manager'] ?? null);
        $finalTl = $tl ?: ($old['tl'] ?? $old['team_leader'] ?? null);

        $sets = [];
        $params = [];
        if (in_array('agent_name', $cols, true)) { $sets[] = 'agent_name = ?'; $params[] = $finalName; }
        if (in_array('name', $cols, true)) { $sets[] = 'name = ?'; $params[] = $finalName; }
        if (in_array('ecode', $cols, true)) { $sets[] = 'ecode = ?'; $params[] = $finalEcode; }
        if (in_array('emp_id', $cols, true)) { $sets[] = 'emp_id = ?'; $params[] = $finalEcode; }
        if (in_array('ops_manager', $cols, true)) { $sets[] = 'ops_manager = ?'; $params[] = $finalOps; }
        if (in_array('tl', $cols, true)) { $sets[] = 'tl = ?'; $params[] = $finalTl; }
        if (in_array('team_leader', $cols, true)) { $sets[] = 'team_leader = ?'; $params[] = $finalTl; }
        if (in_array('is_active', $cols, true)) { $sets[] = 'is_active = ?'; $params[] = $isActive; }

        if (!empty($sets)) {
            $params[] = $foundId;
            $sql = "UPDATE pp_agents SET " . implode(', ', $sets) . " WHERE id = ?";
            $pdo->prepare($sql)->execute($params);
        }
        return (int)$foundId;
    } else {
        $fields = [];
        $finalName = $name ?: ($ecode ?: 'Unknown Agent');
        if (in_array('agent_name', $cols, true)) $fields['agent_name'] = $finalName;
        if (in_array('name', $cols, true)) $fields['name'] = $finalName;
        if (in_array('ecode', $cols, true)) $fields['ecode'] = $ecode ?: null;
        if (in_array('emp_id', $cols, true)) $fields['emp_id'] = $ecode ?: null;
        if (in_array('ops_manager', $cols, true)) $fields['ops_manager'] = $ops ?: null;
        if (in_array('tl', $cols, true)) $fields['tl'] = $tl ?: null;
        if (in_array('team_leader', $cols, true)) $fields['team_leader'] = $tl ?: null;
        if (in_array('is_active', $cols, true)) $fields['is_active'] = $isActive;

        $colList = array_keys($fields);
        $sql = "INSERT INTO pp_agents (`" . implode('`, `', $colList) . "`) VALUES (" . implode(', ', array_fill(0, count($colList), '?')) . ")";
        $pdo->prepare($sql)->execute(array_values($fields));
        return (int)$pdo->lastInsertId();
    }
}

function upsert_client_record(PDO $pdo, array $c): int {
    $cols = get_table_cols($pdo, 'pp_clients');
    $cName = to_title_case(clean_str($c['client_name'] ?? $c['name'] ?? '', 150));
    $cNum = clean_phone($c['client_number'] ?? $c['phone'] ?? $c['mobile'] ?? '');
    $email = clean_email($c['email_id'] ?? $c['email'] ?? '');
    $pan = clean_pan($c['pan_no'] ?? $c['pan'] ?? '');
    $aadhar = clean_aadhar($c['aadhar_no'] ?? $c['aadhar'] ?? '');
    $state = clean_str($c['state'] ?? '', 100);
    $id = (int)($c['id'] ?? 0);

    if (!$cName && !$cNum) {
        throw new Exception("Client Name or Phone Number is required");
    }

    $foundId = null;
    if ($id > 0) {
        $st = $pdo->prepare("SELECT id FROM pp_clients WHERE id = ?");
        $st->execute([$id]);
        $foundId = $st->fetchColumn();
    }
    if (!$foundId && $cNum) {
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
        $st = $pdo->prepare("SELECT * FROM pp_clients WHERE id = ?");
        $st->execute([$foundId]);
        $old = $st->fetch() ?: [];

        $finalName = $cName ?: ($old['client_name'] ?? 'Unknown Client');
        $finalNum = $cNum ?: ($old['client_number'] ?? null);
        $finalEmail = $email ?: ($old['email_id'] ?? null);
        $finalPan = $pan ?: ($old['pan_no'] ?? null);
        $finalAadhar = $aadhar ?: ($old['aadhar_no'] ?? null);
        $finalState = $state ?: ($old['state'] ?? null);

        $sets = ['client_name = ?', 'client_number = ?', 'email_id = ?', 'pan_no = ?', 'aadhar_no = ?'];
        $params = [$finalName, $finalNum, $finalEmail, $finalPan, $finalAadhar];
        if (in_array('state', $cols, true)) {
            $sets[] = 'state = ?';
            $params[] = $finalState;
        }
        $params[] = $foundId;

        $sql = "UPDATE pp_clients SET " . implode(', ', $sets) . " WHERE id = ?";
        $pdo->prepare($sql)->execute($params);
        return (int)$foundId;
    } else {
        $fields = [
            'client_name' => $cName ?: 'Unknown Client',
            'client_number' => $cNum ?: null,
            'email_id' => $email ?: null,
            'pan_no' => $pan ?: null,
            'aadhar_no' => $aadhar ?: null
        ];
        if (in_array('state', $cols, true)) {
            $fields['state'] = $state ?: null;
        }

        $colList = array_keys($fields);
        $sql = "INSERT INTO pp_clients (`" . implode('`, `', $colList) . "`) VALUES (" . implode(', ', array_fill(0, count($colList), '?')) . ")";
        $pdo->prepare($sql)->execute(array_values($fields));
        return (int)$pdo->lastInsertId();
    }
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

    $agent = to_title_case(clean_str($data['agent_name'] ?? '', 150));
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

    // Creator is stamped from authenticated session or payload
    $creator = trim($curUser['name'] ?? $curUser['username'] ?? '');
    if ($creator === '' || strtolower($creator) === 'staff' || strtolower($creator) === 'system') {
        $creator = trim(clean_str($data['created_by_name'] ?? 'Admin', 150));
    }
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
    $tl = to_title_case(clean_str($data['tl'] ?? '', 150));
    $ops = to_title_case(clean_str($data['ops_manager'] ?? '', 150));

    // Dynamic agent directory synchronization
    try {
        if ($ecode !== '') {
            $agSt = $pdo->prepare("SELECT ecode, emp_id, agent_name, name, ops_manager, tl, team_leader FROM pp_agents WHERE LOWER(TRIM(ecode)) = LOWER(?) OR LOWER(TRIM(emp_id)) = LOWER(?) LIMIT 1");
            $agSt->execute([$ecode, $ecode]);
            $foundAg = $agSt->fetch();
            if ($foundAg) {
                if (!$agent || strtolower($agent) === 'unassigned agent') $agent = to_title_case(trim($foundAg['agent_name'] ?? $foundAg['name'] ?? ''));
                if (!$ecode) $ecode = trim($foundAg['ecode'] ?? $foundAg['emp_id'] ?? '');
                if (!$ops) $ops = to_title_case(trim($foundAg['ops_manager'] ?? ''));
                if (!$tl) $tl = to_title_case(trim($foundAg['tl'] ?? $foundAg['team_leader'] ?? ''));
            }
        } elseif ($agent !== '' && strtolower($agent) !== 'unassigned agent') {
            $agSt = $pdo->prepare("SELECT ecode, emp_id, agent_name, name, ops_manager, tl, team_leader FROM pp_agents WHERE LOWER(TRIM(agent_name)) = LOWER(?) OR LOWER(TRIM(name)) = LOWER(?) LIMIT 1");
            $agSt->execute([$agent, $agent]);
            $foundAg = $agSt->fetch();
            if ($foundAg) {
                if (!$ecode) $ecode = trim($foundAg['ecode'] ?? $foundAg['emp_id'] ?? '');
                if (!$ops) $ops = to_title_case(trim($foundAg['ops_manager'] ?? ''));
                if (!$tl) $tl = to_title_case(trim($foundAg['tl'] ?? $foundAg['team_leader'] ?? ''));
            }
        }
    } catch (Throwable $e) {}

    $cName = to_title_case(clean_str($data['client_name'] ?? '', 150));
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
    @ini_set('memory_limit', '512M');
    @set_time_limit(300);

    $curUser = require_role(['ADMIN', 'OPS_MANAGER']);
    $creator = $curUser['name'] ?? 'Staff';

    try {
        $opsList = is_array($data['ops'] ?? null) ? $data['ops'] : [];
        $tlsList = is_array($data['tls'] ?? null) ? $data['tls'] : [];
        $agentsList = is_array($data['agents'] ?? null) ? $data['agents'] : [];
        $clientsList = is_array($data['clients'] ?? null) ? $data['clients'] : [];
        $paymentsList = is_array($data['payments'] ?? null) ? $data['payments'] : [];

        error_log(sprintf(
            "[Bulk Import] User '%s' started import: %d ops, %d tls, %d agents, %d clients, %d payments",
            $creator, count($opsList), count($tlsList), count($agentsList), count($clientsList), count($paymentsList)
        ));

        $saved = ['ops' => 0, 'tls' => 0, 'agents' => 0, 'clients' => 0, 'payments' => 0];
        $duplicates = ['payments' => 0];
        $errors = [];

        // 1. Ops Managers
        foreach ($opsList as $o) {
            $name = clean_str($o['name'] ?? '', 150);
            $ecode = clean_str($o['ecode'] ?? '', 50);
            if (!$name && !$ecode) continue;
            try {
                upsert_ops_manager_record($pdo, $o);
                $saved['ops']++;
            } catch (Throwable $e) {
                $errors[] = "Ops Manager " . ($name ?: $ecode) . ": " . $e->getMessage();
            }
        }

        // 2. Team Leaders
        foreach ($tlsList as $t) {
            $name = clean_str($t['name'] ?? '', 150);
            $ecode = clean_str($t['ecode'] ?? '', 50);
            if (!$name && !$ecode) continue;
            try {
                upsert_team_leader_record($pdo, $t);
                $saved['tls']++;
            } catch (Throwable $e) {
                $errors[] = "Team Leader " . ($name ?: $ecode) . ": " . $e->getMessage();
            }
        }

        // 3. Agents
        foreach ($agentsList as $a) {
            $name = clean_str($a['name'] ?? $a['agent_name'] ?? '', 150);
            $ecode = clean_str($a['ecode'] ?? $a['emp_id'] ?? '', 50);
            if (!$name && !$ecode) continue;
            try {
                upsert_agent_record($pdo, $a);
                $saved['agents']++;
            } catch (Throwable $e) {
                $errors[] = "Agent " . ($name ?: $ecode) . ": " . $e->getMessage();
            }
        }

        // 4. Clients KYC
        foreach ($clientsList as $c) {
            $cName = clean_str($c['client_name'] ?? $c['name'] ?? '', 150);
            $cNum = clean_phone($c['client_number'] ?? $c['phone'] ?? '');
            if (!$cName && !$cNum) continue;
            try {
                upsert_client_record($pdo, $c);
                $saved['clients']++;
            } catch (Throwable $e) {
                $errors[] = "Client " . ($cName ?: $cNum) . ": " . $e->getMessage();
            }
        }

        // 5. Payments
        $liveAgentsByCode = [];
        $liveAgentsByName = [];
        try {
            $agRows = $pdo->query("SELECT * FROM pp_agents")->fetchAll();
            foreach ($agRows as $ar) {
                $c = strtolower(trim((string)($ar['ecode'] ?? $ar['emp_id'] ?? '')));
                $n = strtolower(trim((string)($ar['agent_name'] ?? $ar['name'] ?? '')));
                $item = [
                    'ecode' => trim((string)($ar['ecode'] ?? $ar['emp_id'] ?? '')),
                    'name' => trim((string)($ar['agent_name'] ?? $ar['name'] ?? '')),
                    'ops' => trim((string)($ar['ops_manager'] ?? '')),
                    'tl' => trim((string)($ar['tl'] ?? $ar['team_leader'] ?? ''))
                ];
                if ($c !== '') $liveAgentsByCode[$c] = $item;
                if ($n !== '') $liveAgentsByName[$n] = $item;
            }
        } catch (Throwable $e) {}

        $existingKeys = [];
        try {
            $pCols = get_table_cols($pdo, 'pp_payments');
            $sel = ['payment_date'];
            foreach (['ecode', 'agent_name', 'client_number', 'client_name', 'usdt', 'inr_amount', 'payment_mode', 'received_in'] as $f) {
                if (in_array($f, $pCols, true)) $sel[] = "`$f`";
            }
            $st = $pdo->query("SELECT " . implode(', ', $sel) . " FROM pp_payments");
            while ($r = $st->fetch()) {
                $k = implode('|', [
                    substr((string)($r['payment_date'] ?? ''), 0, 10),
                    strtolower(trim((string)($r['ecode'] ?? $r['agent_name'] ?? ''))),
                    strtolower(trim((string)(clean_phone($r['client_number'] ?? '') ?: clean_str($r['client_name'] ?? '')))),
                    number_format(floatval($r['usdt'] ?? 0), 2, '.', ''),
                    number_format(floatval($r['inr_amount'] ?? 0), 2, '.', ''),
                    strtoupper(trim((string)($r['payment_mode'] ?? 'P2P'))),
                    strtolower(trim((string)($r['received_in'] ?? '')))
                ]);
                $existingKeys[$k] = true;
            }
        } catch (Throwable $e) {}

        foreach ($paymentsList as $idx => $p) {
            $pDate = clean_str($p['payment_date'] ?? date('Y-m-d'), 20);
            $agent = clean_str($p['agent_name'] ?? '', 150);
            $ecode = clean_str($p['ecode'] ?? $p['emp_id'] ?? '', 50);

            $matched = null;
            if ($ecode !== '' && isset($liveAgentsByCode[strtolower($ecode)])) {
                $matched = $liveAgentsByCode[strtolower($ecode)];
            } elseif ($agent !== '' && strtolower($agent) !== 'unassigned agent' && isset($liveAgentsByName[strtolower($agent)])) {
                $matched = $liveAgentsByName[strtolower($agent)];
            }

            if ($matched) {
                if ($matched['name'] && (!$agent || strtolower($agent) === 'unassigned agent')) $agent = $matched['name'];
                if ($matched['ecode'] && !$ecode) $ecode = $matched['ecode'];
                if ($matched['ops'] && empty($p['ops_manager'])) $p['ops_manager'] = $matched['ops'];
                if ($matched['tl'] && empty($p['tl'])) $p['tl'] = $matched['tl'];
            }

            if (!$agent) $agent = $ecode ?: 'Unassigned Agent';
            $usdt = round((float)($p['usdt'] ?? 0), 2);
            $inr = round((float)($p['inr_amount'] ?? 0), 2);
            if ($usdt <= 0 && $inr <= 0) continue;

            $tl = clean_str($p['tl'] ?? '', 150);
            $ops = clean_str($p['ops_manager'] ?? '', 150);
            $cName = clean_str($p['client_name'] ?? '', 150);
            $cNum = clean_phone($p['client_number'] ?? '');
            $email = clean_email($p['email_id'] ?? '');
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

            $key = implode('|', [
                substr($pDate, 0, 10),
                strtolower($ecode ?: $agent),
                strtolower($cNum ?: $cName),
                number_format($usdt, 2, '.', ''),
                number_format($inr, 2, '.', ''),
                strtoupper($mode ?: 'P2P'),
                strtolower($recIn)
            ]);

            if (isset($existingKeys[$key])) {
                $duplicates['payments']++;
                continue;
            }

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
                $existingKeys[$key] = true;
                $saved['payments']++;
            } catch (Throwable $pe) {
                $errors[] = "Payment row " . ($idx + 1) . " ($pDate - $agent): " . $pe->getMessage();
            }
        }

        out([
            'success' => true,
            'saved' => $saved,
            'duplicates' => $duplicates,
            'errors' => $errors
        ]);
    } catch (Throwable $mainErr) {
        $diag = sprintf(
            "Bulk import aborted: %s at %s:%d",
            $mainErr->getMessage(),
            basename($mainErr->getFile()),
            $mainErr->getLine()
        );
        error_log("[Bulk Import Error] " . $diag);
        err("Bulk import failed: " . $mainErr->getMessage(), 500);
    }
}

if ($action === 'delete_payment') {
    require_role(['ADMIN']);
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
    $newId = upsert_ops_manager_record($pdo, $data);
    out(['success' => true, 'id' => $newId]);
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
    $newId = upsert_team_leader_record($pdo, $data);
    out(['success' => true, 'id' => $newId]);
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
    $newId = upsert_agent_record($pdo, $data);
    out(['success' => true, 'id' => $newId]);
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
    require_auth();
    $newId = upsert_client_record($pdo, $data);
    out(['success' => true, 'id' => $newId]);
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

// 12b. TOGGLE AGENT STATUS (ACTIVE / INACTIVE)
if ($action === 'toggle_agent_status') {
    require_role(['ADMIN', 'OPS_MANAGER', 'ENTRY_USER']);
    $agentId = (int)($data['id'] ?? 0);
    $agentName = clean_str($data['agent_name'] ?? '', 150);
    $newStatus = isset($data['is_active']) ? (int)$data['is_active'] : null;

    try {
        $cols = array_map('strtolower', $pdo->query("DESCRIBE `pp_agents`")->fetchAll(PDO::FETCH_COLUMN) ?: []);
        if (!in_array('is_active', $cols, true)) {
            $pdo->exec("ALTER TABLE `pp_agents` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1");
        }
    } catch (Throwable $e) {}

    if ($agentId > 0) {
        if ($newStatus === null) {
            $pdo->prepare("UPDATE pp_agents SET is_active = IF(is_active = 0, 1, 0) WHERE id = ?")->execute([$agentId]);
        } else {
            $pdo->prepare("UPDATE pp_agents SET is_active = ? WHERE id = ?")->execute([$newStatus ? 1 : 0, $agentId]);
        }
    } elseif ($agentName) {
        if ($newStatus === null) {
            $pdo->prepare("UPDATE pp_agents SET is_active = IF(is_active = 0, 1, 0) WHERE LOWER(agent_name) = LOWER(?)")->execute([$agentName]);
        } else {
            $pdo->prepare("UPDATE pp_agents SET is_active = ? WHERE LOWER(agent_name) = LOWER(?)")->execute([$newStatus ? 1 : 0, $agentName]);
        }
    } else {
        err('Agent ID or Name is required.');
    }
    out(['success' => true]);
}

// 12c. SAVE USER SETTINGS
if ($action === 'save_user_settings') {
    $u = require_auth();
    $_SESSION['pp_user_settings'] = $data['settings'] ?? [];
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
    error_log("API Unhandled Error in action '{$action}': " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    $msg = $e->getMessage();
    // Provide explicit error description for debugging
    err("Server Error [{$action}]: " . $msg, 500);
}
?>
