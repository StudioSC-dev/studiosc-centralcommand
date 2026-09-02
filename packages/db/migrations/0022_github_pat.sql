-- GitHub card — encrypted personal access token for the GitHub activity card.
ALTER TABLE `user_settings` ADD COLUMN `github_pat` text;
