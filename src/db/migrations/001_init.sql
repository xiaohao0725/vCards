-- vCards 数据库初始化
-- v1.0.0 / 2026-07-05
-- 执行方式: psql -U codexs_fbk -d vcards -f 001_init.sql

-- ============================================================
-- 1. 分类表
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (name, sort_order) VALUES
    ('本地生活', 1),
    ('出行购票', 2),
    ('电商购物', 3),
    ('房产中介', 4),
    ('互联网', 5),
    ('金融银行', 6),
    ('酒店住宿', 7),
    ('快递物流', 8),
    ('民用航空', 9),
    ('其它', 10),
    ('汽车行业', 11),
    ('通讯服务', 12),
    ('外卖订餐', 13),
    ('应用软件', 14),
    ('影音娱乐', 15),
    ('云服务', 16),
    ('证券保险', 17),
    ('政府机构', 18),
    ('租车代驾', 19)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 2. 用户表（Console 认证）
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. 联系人主表
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
    id            SERIAL PRIMARY KEY,
    organization  VARCHAR(200) NOT NULL,
    category_id   INT REFERENCES categories(id) ON DELETE SET NULL,
    url           VARCHAR(500),
    image_path    VARCHAR(500),
    status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization);

-- ============================================================
-- 4. 电话表
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_phones (
    id          SERIAL PRIMARY KEY,
    contact_id  INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    number      VARCHAR(50) NOT NULL,
    label       VARCHAR(100),
    sort_order  INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_phones_contact ON contact_phones(contact_id);

-- ============================================================
-- 5. 邮箱表
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_emails (
    id          SERIAL PRIMARY KEY,
    contact_id  INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    email       VARCHAR(200) NOT NULL,
    label       VARCHAR(100),
    sort_order  INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_emails_contact ON contact_emails(contact_id);

-- ============================================================
-- 更新 contacts.updated_at 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contacts_updated_at ON contacts;
CREATE TRIGGER trigger_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
