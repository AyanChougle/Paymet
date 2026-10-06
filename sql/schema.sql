-- =======================================================
-- PAYMENT PORTAL DATABASE SCHEMA
-- =======================================================

CREATE DATABASE IF NOT EXISTS `payment_portal` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `payment_portal`;

-- 1. Users & Authentication
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(190) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'OPS_MANAGER', 'ENTRY_USER') NOT NULL DEFAULT 'ENTRY_USER',
    `active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Performance Targets (OPS & TL)
CREATE TABLE IF NOT EXISTS `targets` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `type` ENUM('OPS', 'TL') NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `target_inr` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_target_role_name` (`type`, `name`)
) ENGINE=InnoDB;

-- 3. Agents Directory & Mapping
CREATE TABLE IF NOT EXISTS `agents` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ecode` VARCHAR(80) NOT NULL UNIQUE,
    `agent_name` VARCHAR(150) NOT NULL,
    `ops_manager` VARCHAR(150) DEFAULT NULL,
    `tl` VARCHAR(150) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4. Clients Directory & KYC
CREATE TABLE IF NOT EXISTS `clients` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `client_name` VARCHAR(150) NOT NULL,
    `client_number` VARCHAR(50) NOT NULL,
    `email_id` VARCHAR(190) DEFAULT NULL,
    `pan_no` VARCHAR(50) DEFAULT NULL,
    `aadhar_no` VARCHAR(50) DEFAULT NULL,
    `state` VARCHAR(100) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_client_number` (`client_number`),
    INDEX `idx_client_email` (`email_id`)
) ENGINE=InnoDB;

-- 5. Master Payment Transactions
CREATE TABLE IF NOT EXISTS `payments` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `payment_date` DATE NOT NULL,
    `ecode` VARCHAR(80) DEFAULT NULL,
    `agent_name` VARCHAR(150) NOT NULL,
    `tl` VARCHAR(150) DEFAULT NULL,
    `ops_manager` VARCHAR(150) DEFAULT NULL,
    `client_name` VARCHAR(150) DEFAULT NULL,
    `client_number` VARCHAR(50) DEFAULT NULL,
    `email_id` VARCHAR(190) DEFAULT NULL,
    `pan_no` VARCHAR(50) DEFAULT NULL,
    `aadhar_no` VARCHAR(50) DEFAULT NULL,
    `state` VARCHAR(100) DEFAULT NULL,
    `payment_mode` VARCHAR(50) NOT NULL DEFAULT 'P2P',
    `usdt` DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
    `divided_by` DECIMAL(18,6) NOT NULL DEFAULT 88.000000,
    `inr_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `ratio` VARCHAR(50) DEFAULT NULL,
    `received_in` VARCHAR(120) NOT NULL DEFAULT 'Digital Verse',
    `remarks` TEXT DEFAULT NULL,
    `created_by_name` VARCHAR(120) DEFAULT NULL,
    `created_by_email` VARCHAR(190) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_payment_date` (`payment_date`),
    INDEX `idx_agent_name` (`agent_name`),
    INDEX `idx_tl` (`tl`),
    INDEX `idx_ops_manager` (`ops_manager`),
    INDEX `idx_payment_mode` (`payment_mode`),
    INDEX `idx_received_in` (`received_in`)
) ENGINE=InnoDB;

-- 6. Accounts Cash Handover Ledger
CREATE TABLE IF NOT EXISTS `accounts_ledger` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `handover_date` DATE NOT NULL,
    `amount_inr` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `remarks` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
