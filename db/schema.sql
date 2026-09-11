BEGIN;

CREATE TABLE IF NOT EXISTS business_portfolios (
  id text PRIMARY KEY,
  name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_accounts (
  id text PRIMARY KEY,
  portfolio_id text REFERENCES business_portfolios(id) ON DELETE SET NULL,
  name text NOT NULL,
  currency char(3) NOT NULL,
  timezone_name text NOT NULL,
  account_status integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  effective_status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adsets (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  effective_status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  adset_id text NOT NULL REFERENCES adsets(id) ON DELETE CASCADE,
  name text NOT NULL,
  effective_status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_ad_insights_daily (
  account_id text NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  ad_id text NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  insight_date date NOT NULL,
  spend numeric(18,6) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  leads bigint NOT NULL DEFAULT 0,
  raw_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, ad_id, insight_date)
);

CREATE TABLE IF NOT EXISTS meta_ad_age_daily (
  account_id text NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  ad_id text NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  insight_date date NOT NULL,
  age_bucket text NOT NULL,
  spend numeric(18,6) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  leads bigint NOT NULL DEFAULT 0,
  raw_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, ad_id, insight_date, age_bucket)
);


CREATE TABLE IF NOT EXISTS gc_leads (
  email text NOT NULL,
  gc_order_number text PRIMARY KEY,
  created_at timestamptz,
  lead_date date,
  product_name text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gc_orders (
  order_number text PRIMARY KEY,
  email text NOT NULL,
  status text,
  positions text,
  cost_amount numeric(18,6) NOT NULL DEFAULT 0,
  paid_amount numeric(18,6) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'EUR',
  created_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gc_events (
  email text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('l1in','l1sent','graduates')),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, event_type)
);

CREATE INDEX IF NOT EXISTS gc_leads_utm_idx ON gc_leads (utm_campaign, utm_content, utm_term);
CREATE INDEX IF NOT EXISTS gc_leads_email_idx ON gc_leads (email);
CREATE INDEX IF NOT EXISTS gc_orders_email_idx ON gc_orders (email);

CREATE TABLE IF NOT EXISTS entity_tags (
  entity_type text NOT NULL CHECK (entity_type IN ('campaign','adset','ad')),
  entity_id text NOT NULL,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, tag)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL DEFAULT 'meta',
  trigger_type text NOT NULL CHECK (trigger_type IN ('manual','scheduled')),
  requested_from date NOT NULL,
  requested_to date NOT NULL,
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  accounts_total integer NOT NULL DEFAULT 0,
  accounts_completed integer NOT NULL DEFAULT 0,
  rows_imported integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (requested_from <= requested_to)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_running_meta_sync ON sync_runs (source) WHERE status='running';

-- Existing local databases created before the `unknown` Meta bucket was observed.
ALTER TABLE meta_ad_age_daily DROP CONSTRAINT IF EXISTS meta_ad_age_daily_age_bucket_check;
CREATE INDEX IF NOT EXISTS insights_date_idx ON meta_ad_insights_daily (insight_date);
CREATE INDEX IF NOT EXISTS age_date_idx ON meta_ad_age_daily (insight_date);
CREATE INDEX IF NOT EXISTS campaigns_account_idx ON campaigns (account_id);
CREATE INDEX IF NOT EXISTS adsets_campaign_idx ON adsets (campaign_id);
CREATE INDEX IF NOT EXISTS ads_adset_idx ON ads (adset_id);

COMMIT;
