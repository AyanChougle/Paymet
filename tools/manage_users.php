<?php
// CLI only:  php tools/manage_users.php <command> [args]
//   create-admin <email>        create an ADMIN (prompts for password)
//   reset-password <email>      set a new password (prompts)
//   migrate-passwords           hash any plaintext passwords still in pp_users
//   list                        list users and whether their password is hashed
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$cfg = require __DIR__ . '/../config.php';
$pdo = new PDO("mysql:host=" . ($cfg['host'] ?? 'localhost') . ";dbname={$cfg['name']};charset=utf8mb4", $cfg['user'], $cfg['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$cols = array_map('strtolower', $pdo->query("DESCRIBE pp_users")->fetchAll(PDO::FETCH_COLUMN));
$pwCols = array_values(array_intersect(['password_hash', 'password'], $cols));
$isHash = fn($v) => is_string($v) && preg_match('/^\$(2[aby]|argon2id?)\$/', $v);

function prompt_password(): string {
    fwrite(STDERR, "New password (min 12 chars): ");
    if (DIRECTORY_SEPARATOR === '/') system('stty -echo');
    $p = trim((string)fgets(STDIN));
    if (DIRECTORY_SEPARATOR === '/') system('stty echo');
    fwrite(STDERR, "\n");
    if (strlen($p) < 12) { fwrite(STDERR, "Too short.\n"); exit(1); }
    return $p;
}
function set_pw(PDO $pdo, array $pwCols, int $id, string $plain): void {
    $h = password_hash($plain, PASSWORD_DEFAULT);
    foreach ($pwCols as $c) $pdo->prepare("UPDATE pp_users SET `$c` = ? WHERE id = ?")->execute([$h, $id]);
}

$cmd = $argv[1] ?? '';
switch ($cmd) {
    case 'migrate-passwords':
        $n = 0;
        foreach ($pdo->query("SELECT * FROM pp_users")->fetchAll() as $u) {
            foreach ($pwCols as $c) {
                $v = $u[$c] ?? '';
                if ($v !== '' && !$isHash($v)) {
                    $pdo->prepare("UPDATE pp_users SET `$c` = ? WHERE id = ?")->execute([password_hash($v, PASSWORD_DEFAULT), $u['id']]);
                    $n++;
                }
            }
        }
        echo "Hashed $n plaintext value(s).\n";
        break;
    case 'list':
        foreach ($pdo->query("SELECT * FROM pp_users")->fetchAll() as $u) {
            $state = [];
            foreach ($pwCols as $c) $state[] = "$c:" . ($isHash($u[$c] ?? '') ? 'hashed' : 'PLAINTEXT/empty');
            echo ($u['id'] . "\t" . ($u['email'] ?? $u['username'] ?? '') . "\t" . ($u['role'] ?? '') . "\t" . implode(' ', $state)) . "\n";
        }
        break;
    case 'create-admin':
    case 'reset-password':
        $email = strtolower(trim($argv[2] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { fwrite(STDERR, "Valid email required.\n"); exit(1); }
        $plain = prompt_password();
        $st = $pdo->prepare("SELECT id FROM pp_users WHERE LOWER(email) = ?"); $st->execute([$email]);
        $id = $st->fetchColumn();
        if ($cmd === 'reset-password') {
            if (!$id) { fwrite(STDERR, "No such user.\n"); exit(1); }
            set_pw($pdo, $pwCols, (int)$id, $plain);
            echo "Password updated.\n";
        } else {
            if ($id) { fwrite(STDERR, "User exists; use reset-password.\n"); exit(1); }
            $name = in_array('full_name', $cols) ? 'full_name' : 'name';
            $act = in_array('is_active', $cols) ? 'is_active' : 'active';
            $h = password_hash($plain, PASSWORD_DEFAULT);
            $pc = $pwCols[0];
            $pdo->prepare("INSERT INTO pp_users (`$name`, email, `$pc`, role, `$act`) VALUES ('Administrator', ?, ?, 'ADMIN', 1)")->execute([$email, $h]);
            echo "Admin created.\n";
        }
        break;
    default:
        fwrite(STDERR, "Commands: create-admin <email> | reset-password <email> | migrate-passwords | list\n");
        exit(1);
}
