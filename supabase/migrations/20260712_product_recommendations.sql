-- ============================================================
-- Migration 20260712: product_recommendations + commerce_clicks
-- 购物推荐闭环：商品库与购买点击记录
-- 可在 Supabase Dashboard → SQL Editor 中单独执行
-- 说明：完整建表也可直接执行 supabase/schema.sql（含本节同等定义）
-- ============================================================

-- 1. product_recommendations（商品推荐表）
create table if not exists public.product_recommendations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text,
  category text,
  color text,
  style_tags text[] not null default '{}',
  occasion_tags text[] not null default '{}',
  price_min numeric,
  price_max numeric,
  image_url text,
  product_url text not null,
  merchant text,
  commission_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists product_recommendations_active_idx
  on public.product_recommendations (is_active)
  where is_active = true;

create index if not exists product_recommendations_category_idx
  on public.product_recommendations (category);

create index if not exists product_recommendations_style_tags_idx
  on public.product_recommendations using gin (style_tags);

alter table public.product_recommendations enable row level security;

drop policy if exists "product_recommendations_select_active" on public.product_recommendations;

create policy "product_recommendations_select_active"
  on public.product_recommendations for select
  to authenticated
  using (is_active = true);

-- 2. commerce_clicks（购买点击转化追踪）
-- 字段与 app/api/commerce/click/route.ts 写入结构一致
create table if not exists public.commerce_clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  product_recommendation_id uuid references public.product_recommendations (id) on delete set null,
  shopping_check_id uuid references public.shopping_checks (id) on delete set null,
  source text not null default 'shopping_check',
  target_url text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists commerce_clicks_user_id_idx
  on public.commerce_clicks (user_id);

create index if not exists commerce_clicks_product_id_idx
  on public.commerce_clicks (product_recommendation_id);

create index if not exists commerce_clicks_created_at_idx
  on public.commerce_clicks (created_at desc);

alter table public.commerce_clicks enable row level security;

drop policy if exists "commerce_clicks_insert_own" on public.commerce_clicks;
drop policy if exists "commerce_clicks_select_own" on public.commerce_clicks;

create policy "commerce_clicks_insert_own"
  on public.commerce_clicks for insert
  to authenticated
  with check (user_id is null or auth.uid() = user_id);

create policy "commerce_clicks_select_own"
  on public.commerce_clicks for select
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
