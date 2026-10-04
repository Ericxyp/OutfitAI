-- ============================================================
-- Migration 20261003: closet_items 自定义风格 / 自定义场景标签
-- 可在 Supabase Dashboard → SQL Editor 中单独执行（可重复执行）
--
-- - 新增 custom_style_tags / custom_occasion_tags，默认空数组，旧数据无需回填
-- - 不修改 / 删除任何现有字段
-- - 不改动 closet_items 的 RLS：沿用 closet_items_*_own 策略（auth.uid() = user_id），
--   不新增任何公开访问策略
-- - 数量上限与应用层一致（每类最多 5 个），作为数据库兜底
--
-- 回滚（会丢失用户已填写的自定义标签）：
--   alter table public.closet_items drop constraint if exists closet_items_custom_style_tags_limit;
--   alter table public.closet_items drop constraint if exists closet_items_custom_occasion_tags_limit;
--   alter table public.closet_items drop column if exists custom_style_tags;
--   alter table public.closet_items drop column if exists custom_occasion_tags;
-- ============================================================

alter table if exists public.closet_items
  add column if not exists custom_style_tags text[] not null default '{}';

alter table if exists public.closet_items
  add column if not exists custom_occasion_tags text[] not null default '{}';

alter table public.closet_items
  drop constraint if exists closet_items_custom_style_tags_limit;
alter table public.closet_items
  add constraint closet_items_custom_style_tags_limit
  check (cardinality(custom_style_tags) <= 5);

alter table public.closet_items
  drop constraint if exists closet_items_custom_occasion_tags_limit;
alter table public.closet_items
  add constraint closet_items_custom_occasion_tags_limit
  check (cardinality(custom_occasion_tags) <= 5);

-- RLS 保持启用（幂等，不改变策略）
alter table public.closet_items enable row level security;

notify pgrst, 'reload schema';
