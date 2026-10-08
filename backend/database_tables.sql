-- --------------------------------------------------------
-- Payment Portal - Production SQL Schema
-- Run this in phpMyAdmin on Hostinger
-- --------------------------------------------------------

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS `pp_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL UNIQUE,
  `password` varchar(255) NOT NULL,
  `role` enum('ADMIN','OPS_MANAGER','ENTRY_USER') NOT NULL DEFAULT 'ENTRY_USER',
  `active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert Default Admin
INSERT IGNORE INTO `pp_users` (`name`, `email`, `password`, `role`) VALUES
('System Admin', 'admin@portal.com', '12121234', 'ADMIN');

-- 2. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS `pp_payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payment_date` date NOT NULL,
  `ecode` varchar(50) DEFAULT NULL,
  `agent_name` varchar(255) NOT NULL,
  `tl` varchar(255) DEFAULT NULL,
  `ops_manager` varchar(255) DEFAULT NULL,
  `client_name` varchar(255) DEFAULT NULL,
  `client_number` varchar(50) DEFAULT NULL,
  `email_id` varchar(255) DEFAULT NULL,
  `pan_no` varchar(50) DEFAULT NULL,
  `aadhar_no` varchar(50) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `payment_mode` varchar(50) DEFAULT 'P2P',
  `usdt` decimal(15,2) DEFAULT 0.00,
  `divided_by` decimal(10,2) DEFAULT 88.00,
  `inr_amount` decimal(15,2) DEFAULT 0.00,
  `ratio` varchar(50) DEFAULT NULL,
  `received_in` varchar(100) DEFAULT 'Digital Verse',
  `remarks` text DEFAULT NULL,
  `created_by_id` int(11) DEFAULT NULL,
  `created_by_name` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. AGENTS DIRECTORY
CREATE TABLE IF NOT EXISTS `pp_agents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ecode` varchar(50) NOT NULL UNIQUE,
  `agent_name` varchar(255) NOT NULL,
  `ops_manager` varchar(255) DEFAULT NULL,
  `tl` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. TEAM LEADERS
CREATE TABLE IF NOT EXISTS `pp_team_leaders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ecode` varchar(50) DEFAULT NULL,
  `name` varchar(255) NOT NULL UNIQUE,
  `ops_manager` varchar(255) DEFAULT NULL,
  `target` decimal(15,2) DEFAULT 0.00,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. OPS MANAGERS
CREATE TABLE IF NOT EXISTS `pp_ops_managers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ecode` varchar(50) DEFAULT NULL,
  `name` varchar(255) NOT NULL UNIQUE,
  `reporting_to` varchar(255) DEFAULT NULL,
  `target` decimal(15,2) DEFAULT 0.00,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. CLIENTS KYC DIRECTORY
CREATE TABLE IF NOT EXISTS `pp_clients` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_name` varchar(255) NOT NULL,
  `client_number` varchar(50) DEFAULT NULL,
  `email_id` varchar(255) DEFAULT NULL,
  `pan_no` varchar(50) DEFAULT NULL,
  `aadhar_no` varchar(50) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. ACCOUNTS LEDGER
CREATE TABLE IF NOT EXISTS `pp_accounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `type` enum('CASH_HANDOVER','EXPENSE','OTHER') DEFAULT 'CASH_HANDOVER',
  `amount` decimal(15,2) NOT NULL,
  `description` text DEFAULT NULL,
  `handled_by` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
