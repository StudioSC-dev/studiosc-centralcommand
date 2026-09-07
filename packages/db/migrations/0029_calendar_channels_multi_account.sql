CREATE TABLE calendar_channels_new (
  user_id TEXT NOT NULL REFERENCES users(id),
  account_id TEXT NOT NULL DEFAULT 'legacy',
  channel_id TEXT NOT NULL UNIQUE,
  resource_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expiration INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, account_id)
);
INSERT INTO calendar_channels_new (user_id, account_id, channel_id, resource_id, token, expiration, created_at)
  SELECT user_id, 'legacy', channel_id, resource_id, token, expiration, created_at FROM calendar_channels;
DROP TABLE calendar_channels;
ALTER TABLE calendar_channels_new RENAME TO calendar_channels;
CREATE UNIQUE INDEX calendar_channels_channel_id_idx ON calendar_channels(channel_id);
