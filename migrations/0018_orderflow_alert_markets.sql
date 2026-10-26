-- Members choose which markets their LINE order-flow alerts cover (docs/ORDERFLOW-ETH.md). Rows from
-- before ETH keep BTC only, and each delivery records its event's market so a member who drops a market
-- stops receiving its queued alerts too.
ALTER TABLE orderflow_alert_subs ADD COLUMN markets TEXT NOT NULL DEFAULT 'btc';
ALTER TABLE orderflow_alert_deliveries ADD COLUMN market TEXT NOT NULL DEFAULT 'btc';
