-- Run this SQL in your Hostinger phpMyAdmin (e.g. u303154098_o3Qhw)

CREATE TABLE IF NOT EXISTS `payment_portal_store` (
  `store_key` varchar(100) NOT NULL,
  `store_value` longtext NOT NULL,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`store_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: You can delete the old WordPress tables (wp_*) if this database is ONLY for the Payment Portal.
