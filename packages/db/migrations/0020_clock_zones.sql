-- World-clock card — user-configured timezone list for the clock card.
-- Stored as a JSON array of IANA timezone names, e.g. '["Asia/Manila","America/New_York"]'.
ALTER TABLE `user_settings` ADD COLUMN `clock_zones` text;
