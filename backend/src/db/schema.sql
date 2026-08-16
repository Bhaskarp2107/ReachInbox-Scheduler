CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_campaigns (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    delay_ms INTEGER NOT NULL CHECK (delay_ms >= 0),
    hourly_limit INTEGER NOT NULL CHECK (hourly_limit > 0),
    sender_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_emails (
    id BIGSERIAL PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    recipient VARCHAR(320) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    attempts INTEGER NOT NULL DEFAULT 0,
    job_id VARCHAR(255) UNIQUE,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT scheduled_emails_status_check
        CHECK (status IN ('scheduled', 'processing', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id
    ON email_campaigns(user_id);

CREATE INDEX IF NOT EXISTS idx_emails_campaign_id
    ON scheduled_emails(campaign_id);

CREATE INDEX IF NOT EXISTS idx_emails_status
    ON scheduled_emails(status);

CREATE INDEX IF NOT EXISTS idx_emails_scheduled_at
    ON scheduled_emails(scheduled_at);