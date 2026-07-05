-- vCards 多级分类 + 多对多关联迁移
-- v2.0.0 / 2026-07-05
-- 执行方式: psql -U codexs_fbk -d vcards -f 002_hierarchical_categories.sql
-- 建议执行前备份数据库

-- ============================================================
-- 1. 分类表添加 parent_id（自引用层级）
-- ============================================================
ALTER TABLE categories
    ADD COLUMN parent_id INT REFERENCES categories(id) ON DELETE SET NULL;

-- 现有 19 个根分类保持 parent_id IS NULL

-- ============================================================
-- 2. 创建联系人-分类关联表（多对多）
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_categories (
    contact_id  INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_category ON contact_categories(category_id);

-- ============================================================
-- 3. 迁移现有数据：contacts.category_id → contact_categories
-- ============================================================
INSERT INTO contact_categories (contact_id, category_id)
    SELECT id, category_id
    FROM contacts
    WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. 清理 contacts 旧的单分类字段
-- ============================================================
DROP INDEX IF EXISTS idx_contacts_category;
ALTER TABLE contacts DROP COLUMN IF EXISTS category_id;
