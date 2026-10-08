<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// UPDATE THESE WITH YOUR HOSTINGER MYSQL CREDENTIALS
$db_host = 'localhost';
$db_user = 'u303154098_o3Qhw'; // e.g. u303154098_admin
$db_pass = 'u303154098_ZtY2h';
$db_name = 'u303154098_ZtY2h'; 

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'DB Connection Failed: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';

if ($action === 'sync_push') {
    $data = json_decode(file_get_contents('php://input'), true);    
    if (!$data) {
        echo json_encode(['success' => false, 'message' => 'No data provided']);
        exit;
    }
    
    $stmt = $pdo->prepare("INSERT INTO payment_portal_store (store_key, store_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE store_value=VALUES(store_value)");
    
    $pdo->beginTransaction();
    try {
        foreach ($data as $key => $val) {
            $stmt->execute([$key, is_string($val) ? $val : json_encode($val)]);
        }
        $pdo->commit();
        echo json_encode(['success' => true]);
    } catch(Exception $e) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

if ($action === 'sync_pull') {
    $stmt = $pdo->query("SELECT store_key, store_value FROM payment_portal_store");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $res = [];
    foreach ($rows as $row) {
        $res[$row['store_key']] = $row['store_value'];
    }
    echo json_encode(['success' => true, 'data' => $res]);
    exit;
}

// Ensure old api.js compatibility if needed
echo json_encode(['success' => false, 'message' => 'Unknown action or use sync_push/sync_pull']);
?>
