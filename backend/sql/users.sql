CREATE DATABASE IF NOT EXISTS `QuickTrack`;
USE `QuickTrack`;

CREATE TABLE IF NOT EXISTS `QTusers` (
  `id` CHAR(36) PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `username` VARCHAR(60) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NULL,
  `email` VARCHAR(254) NULL UNIQUE,
  `email_verified` BOOLEAN NULL,
  `google_id` VARCHAR(255) NULL UNIQUE,
  `age` SMALLINT UNSIGNED NOT NULL,
  `height` DECIMAL(5,2) NOT NULL,
  `weight` DECIMAL(5,2) NOT NULL,
  `meds` TEXT NOT NULL,
  `goal` VARCHAR(20) NOT NULL,
  `target_goal` VARCHAR(20) NULL,
  `target_weight` DECIMAL(5,2) NULL,
  `target_time_value` SMALLINT UNSIGNED NULL,
  `target_time_unit` VARCHAR(10) NULL,
  `measurements` JSON NULL,
  `created_at` DATETIME(3) NOT NULL
) ENGINE=InnoDB;
