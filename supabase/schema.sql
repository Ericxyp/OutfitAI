-- ============================================================
-- OutfitAI MVP — Supabase Schema
-- 在 Supabase Dashboard → SQL Editor 中整段复制执行
-- ============================================================

create extension if not exists vector;

-- ============================================================
-- 1. profiles
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- 2. closet_items
-- ============================================================
create table if not exists public.closet_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_url text,
  name text,
  category text,
  color text,
  material text,
  style_tags text[] not null default '{}',
  season_tags text[] not null default '{}',
  occasion_tags text[] not null default '{}',
  notes text,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_items_status_check
    check (status in ('ready', 'processing', 'archived'))
);

create index if not exists closet_items_user_id_idx
  on public.closet_items (user_id);

alter table if exists public.closet_items
  add column if not exists embedding vector(1024);

alter table if exists public.closet_items
  add column if not exists embedding_text text;

alter table if exists public.closet_items
  add column if not exists embedding_updated_at timestamptz;

-- 自定义风格 / 场景标签（见 migrations/20261003_closet_custom_tags.sql）
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

alter table public.closet_items enable row level security;

drop policy if exists "closet_items_select_own" on public.closet_items;
drop policy if exists "closet_items_insert_own" on public.closet_items;
drop policy if exists "closet_items_update_own" on public.closet_items;
drop policy if exists "closet_items_delete_own" on public.closet_items;

create policy "closet_items_select_own"
  on public.closet_items for select
  using (auth.uid() = user_id);

create policy "closet_items_insert_own"
  on public.closet_items for insert
  with check (auth.uid() = user_id);

create policy "closet_items_update_own"
  on public.closet_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "closet_items_delete_own"
  on public.closet_items for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 3. outfit_recommendations
-- ============================================================
create table if not exists public.outfit_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_text text,
  title text,
  selected_item_ids uuid[] not null default '{}',
  summary text,
  reasoning text,
  style_tags text[] not null default '{}',
  occasion text,
  model_output jsonb,
  created_at timestamptz not null default now()
);

create index if not exists outfit_recommendations_user_id_idx
  on public.outfit_recommendations (user_id);

alter table public.outfit_recommendations enable row level security;

drop policy if exists "outfit_recommendations_select_own" on public.outfit_recommendations;
drop policy if exists "outfit_recommendations_insert_own" on public.outfit_recommendations;
drop policy if exists "outfit_recommendations_update_own" on public.outfit_recommendations;
drop policy if exists "outfit_recommendations_delete_own" on public.outfit_recommendations;

create policy "outfit_recommendations_select_own"
  on public.outfit_recommendations for select
  using (auth.uid() = user_id);

create policy "outfit_recommendations_insert_own"
  on public.outfit_recommendations for insert
  with check (auth.uid() = user_id);

create policy "outfit_recommendations_update_own"
  on public.outfit_recommendations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "outfit_recommendations_delete_own"
  on public.outfit_recommendations for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 4. feedback
-- ============================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recommendation_id uuid not null
    references public.outfit_recommendations (id) on delete cascade,
  rating text not null,
  reason_tags text[] not null default '{}',
  comment text,
  created_at timestamptz not null default now(),
  constraint feedback_rating_check
    check (rating in ('like', 'dislike', 'save')),
  constraint feedback_user_recommendation_unique
    unique (user_id, recommendation_id)
);

create index if not exists feedback_user_id_idx
  on public.feedback (user_id);

create index if not exists feedback_recommendation_id_idx
  on public.feedback (recommendation_id);

-- 为已存在的表补充唯一约束（幂等）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'feedback_user_recommendation_unique'
  ) then
    alter table public.feedback
      add constraint feedback_user_recommendation_unique
      unique (user_id, recommendation_id);
  end if;
end $$;

alter table if exists public.feedback
  add column if not exists reason_tags text[] not null default '{}';

alter table if exists public.feedback
  add column if not exists comment text;

alter table public.feedback enable row level security;

drop policy if exists "feedback_select_own" on public.feedback;
drop policy if exists "feedback_insert_own" on public.feedback;
drop policy if exists "feedback_update_own" on public.feedback;
drop policy if exists "feedback_delete_own" on public.feedback;

create policy "feedback_select_own"
  on public.feedback for select
  using (auth.uid() = user_id);

create policy "feedback_insert_own"
  on public.feedback for insert
  with check (auth.uid() = user_id);

create policy "feedback_update_own"
  on public.feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "feedback_delete_own"
  on public.feedback for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 4b. recommendation_wear_confirmations（实际穿着确认）
-- ============================================================
create table if not exists public.recommendation_wear_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recommendation_id uuid not null
    references public.outfit_recommendations (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint recommendation_wear_confirmations_user_rec_unique
    unique (user_id, recommendation_id)
);

create index if not exists recommendation_wear_confirmations_user_id_idx
  on public.recommendation_wear_confirmations (user_id);

create index if not exists recommendation_wear_confirmations_recommendation_id_idx
  on public.recommendation_wear_confirmations (recommendation_id);

alter table public.recommendation_wear_confirmations enable row level security;

drop policy if exists "recommendation_wear_confirmations_select_own"
  on public.recommendation_wear_confirmations;
drop policy if exists "recommendation_wear_confirmations_insert_own"
  on public.recommendation_wear_confirmations;
drop policy if exists "recommendation_wear_confirmations_update_own"
  on public.recommendation_wear_confirmations;
drop policy if exists "recommendation_wear_confirmations_delete_own"
  on public.recommendation_wear_confirmations;

create policy "recommendation_wear_confirmations_select_own"
  on public.recommendation_wear_confirmations for select
  using (auth.uid() = user_id);

create policy "recommendation_wear_confirmations_insert_own"
  on public.recommendation_wear_confirmations for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.outfit_recommendations r
      where r.id = recommendation_id
        and r.user_id = auth.uid()
    )
  );

create policy "recommendation_wear_confirmations_update_own"
  on public.recommendation_wear_confirmations for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.outfit_recommendations r
      where r.id = recommendation_id
        and r.user_id = auth.uid()
    )
  );

create policy "recommendation_wear_confirmations_delete_own"
  on public.recommendation_wear_confirmations for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 4c. recommendation_ratings（推荐评分 1-5）
-- ============================================================
create table if not exists public.recommendation_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recommendation_id uuid not null
    references public.outfit_recommendations (id) on delete cascade,
  rating integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendation_ratings_rating_check
    check (rating between 1 and 5),
  constraint recommendation_ratings_user_rec_unique
    unique (user_id, recommendation_id)
);

create index if not exists recommendation_ratings_user_id_idx
  on public.recommendation_ratings (user_id);

create index if not exists recommendation_ratings_recommendation_id_idx
  on public.recommendation_ratings (recommendation_id);

alter table public.recommendation_ratings enable row level security;

drop policy if exists "recommendation_ratings_select_own"
  on public.recommendation_ratings;
drop policy if exists "recommendation_ratings_insert_own"
  on public.recommendation_ratings;
drop policy if exists "recommendation_ratings_update_own"
  on public.recommendation_ratings;
drop policy if exists "recommendation_ratings_delete_own"
  on public.recommendation_ratings;

create policy "recommendation_ratings_select_own"
  on public.recommendation_ratings for select
  using (auth.uid() = user_id);

create policy "recommendation_ratings_insert_own"
  on public.recommendation_ratings for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.outfit_recommendations r
      where r.id = recommendation_id
        and r.user_id = auth.uid()
    )
  );

create policy "recommendation_ratings_update_own"
  on public.recommendation_ratings for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.outfit_recommendations r
      where r.id = recommendation_id
        and r.user_id = auth.uid()
    )
  );

create policy "recommendation_ratings_delete_own"
  on public.recommendation_ratings for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 5. user_style_profiles（Memory / 风格画像）
-- ============================================================
create table if not exists public.user_style_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferred_styles text[] not null default '{}',
  preferred_colors text[] not null default '{}',
  preferred_occasions text[] not null default '{}',
  avoid_styles text[] not null default '{}',
  avoid_colors text[] not null default '{}',
  favorite_item_ids uuid[] not null default '{}',
  disliked_item_ids uuid[] not null default '{}',
  style_summary text,
  feedback_count int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_style_profiles enable row level security;

drop policy if exists "user_style_profiles_select_own" on public.user_style_profiles;
drop policy if exists "user_style_profiles_insert_own" on public.user_style_profiles;
drop policy if exists "user_style_profiles_update_own" on public.user_style_profiles;
drop policy if exists "user_style_profiles_delete_own" on public.user_style_profiles;

create policy "user_style_profiles_select_own"
  on public.user_style_profiles for select
  using (auth.uid() = user_id);

create policy "user_style_profiles_insert_own"
  on public.user_style_profiles for insert
  with check (auth.uid() = user_id);

create policy "user_style_profiles_update_own"
  on public.user_style_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_style_profiles_delete_own"
  on public.user_style_profiles for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 5b. user_personal_profiles（个人信息 / 身体信息与穿衣目标）
-- ============================================================
create table if not exists public.user_personal_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  height_cm int,
  weight_kg int,
  age int,
  gender text,
  body_notes text,
  fit_goals text[] not null default '{}',
  size_notes text,
  avoid_body_focus text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_personal_profiles enable row level security;

drop policy if exists "user_personal_profiles_select_own" on public.user_personal_profiles;
drop policy if exists "user_personal_profiles_insert_own" on public.user_personal_profiles;
drop policy if exists "user_personal_profiles_update_own" on public.user_personal_profiles;
drop policy if exists "user_personal_profiles_delete_own" on public.user_personal_profiles;

create policy "user_personal_profiles_select_own"
  on public.user_personal_profiles for select
  using (auth.uid() = user_id);

create policy "user_personal_profiles_insert_own"
  on public.user_personal_profiles for insert
  with check (auth.uid() = user_id);

create policy "user_personal_profiles_update_own"
  on public.user_personal_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_personal_profiles_delete_own"
  on public.user_personal_profiles for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 6. travel_plans / travel_plan_days（旅行穿搭规划）
-- ============================================================
create table if not exists public.travel_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  destination text not null,
  start_date date,
  days int not null,
  purpose text,
  style_preference text,
  weather_context jsonb,
  packing_list jsonb,
  created_at timestamptz not null default now()
);

create index if not exists travel_plans_user_id_idx
  on public.travel_plans (user_id);

alter table public.travel_plans enable row level security;

drop policy if exists "travel_plans_select_own" on public.travel_plans;
drop policy if exists "travel_plans_insert_own" on public.travel_plans;
drop policy if exists "travel_plans_update_own" on public.travel_plans;
drop policy if exists "travel_plans_delete_own" on public.travel_plans;

create policy "travel_plans_select_own"
  on public.travel_plans for select
  using (auth.uid() = user_id);

create policy "travel_plans_insert_own"
  on public.travel_plans for insert
  with check (auth.uid() = user_id);

create policy "travel_plans_update_own"
  on public.travel_plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "travel_plans_delete_own"
  on public.travel_plans for delete
  using (auth.uid() = user_id);

create table if not exists public.travel_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.travel_plans (id) on delete cascade,
  day_index int not null,
  date date,
  title text,
  selected_item_ids uuid[] not null default '{}',
  summary text,
  reasoning text,
  weather jsonb,
  created_at timestamptz not null default now()
);

create index if not exists travel_plan_days_plan_id_idx
  on public.travel_plan_days (plan_id);

alter table public.travel_plan_days enable row level security;

drop policy if exists "travel_plan_days_select_own" on public.travel_plan_days;
drop policy if exists "travel_plan_days_insert_own" on public.travel_plan_days;
drop policy if exists "travel_plan_days_update_own" on public.travel_plan_days;
drop policy if exists "travel_plan_days_delete_own" on public.travel_plan_days;

create policy "travel_plan_days_select_own"
  on public.travel_plan_days for select
  using (
    exists (
      select 1 from public.travel_plans
      where travel_plans.id = travel_plan_days.plan_id
        and travel_plans.user_id = auth.uid()
    )
  );

create policy "travel_plan_days_insert_own"
  on public.travel_plan_days for insert
  with check (
    exists (
      select 1 from public.travel_plans
      where travel_plans.id = travel_plan_days.plan_id
        and travel_plans.user_id = auth.uid()
    )
  );

create policy "travel_plan_days_update_own"
  on public.travel_plan_days for update
  using (
    exists (
      select 1 from public.travel_plans
      where travel_plans.id = travel_plan_days.plan_id
        and travel_plans.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.travel_plans
      where travel_plans.id = travel_plan_days.plan_id
        and travel_plans.user_id = auth.uid()
    )
  );

create policy "travel_plan_days_delete_own"
  on public.travel_plan_days for delete
  using (
    exists (
      select 1 from public.travel_plans
      where travel_plans.id = travel_plan_days.plan_id
        and travel_plans.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. shopping_checks（购物搭配助手）
-- ============================================================
create table if not exists public.shopping_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_image_url text,
  product_analysis jsonb,
  compatibility_score int,
  matched_item_ids uuid[] not null default '{}',
  outfit_ideas jsonb,
  recommendation text,
  created_at timestamptz not null default now()
);

create index if not exists shopping_checks_user_id_idx
  on public.shopping_checks (user_id);

alter table public.shopping_checks enable row level security;

drop policy if exists "shopping_checks_select_own" on public.shopping_checks;
drop policy if exists "shopping_checks_insert_own" on public.shopping_checks;
drop policy if exists "shopping_checks_update_own" on public.shopping_checks;
drop policy if exists "shopping_checks_delete_own" on public.shopping_checks;

create policy "shopping_checks_select_own"
  on public.shopping_checks for select
  using (auth.uid() = user_id);

create policy "shopping_checks_insert_own"
  on public.shopping_checks for insert
  with check (auth.uid() = user_id);

create policy "shopping_checks_update_own"
  on public.shopping_checks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "shopping_checks_delete_own"
  on public.shopping_checks for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 7b. product_recommendations（商品库 / 商业推荐 MVP）
-- product_url: 原始商品链接；affiliate_url: 佣金/联盟链接（前端优先）
-- ============================================================
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
  affiliate_url text,
  merchant text,
  commission_type text default 'demo',
  source text default 'manual',
  recommendation_reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_recommendations
  add column if not exists affiliate_url text;

alter table public.product_recommendations
  add column if not exists source text default 'manual';

alter table public.product_recommendations
  add column if not exists recommendation_reason text;

alter table public.product_recommendations
  add column if not exists updated_at timestamptz not null default now();

create index if not exists product_recommendations_active_idx
  on public.product_recommendations (is_active)
  where is_active = true;

create index if not exists product_recommendations_category_idx
  on public.product_recommendations (category);

create index if not exists product_recommendations_style_tags_idx
  on public.product_recommendations using gin (style_tags);

alter table public.product_recommendations enable row level security;

drop policy if exists "product_recommendations_select_active" on public.product_recommendations;
drop policy if exists "product_recommendations_select_authenticated" on public.product_recommendations;
drop policy if exists "product_recommendations_insert_authenticated" on public.product_recommendations;
drop policy if exists "product_recommendations_update_authenticated" on public.product_recommendations;

-- Demo 管理页：登录用户可读全部商品（含停用）；购物召回仍按 is_active 过滤
create policy "product_recommendations_select_authenticated"
  on public.product_recommendations for select
  to authenticated
  using (true);

create policy "product_recommendations_insert_authenticated"
  on public.product_recommendations for insert
  to authenticated
  with check (true);

create policy "product_recommendations_update_authenticated"
  on public.product_recommendations for update
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 7c. commerce_clicks（购买点击转化追踪）
-- ============================================================
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

-- ============================================================
-- 8. event_logs（产品指标体系 / 事件埋点）
-- ============================================================
create table if not exists public.event_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  event_name text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_logs'
      and column_name = 'properties'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_logs'
      and column_name = 'metadata'
  ) then
    alter table public.event_logs rename column properties to metadata;
  end if;
end $$;

create index if not exists event_logs_user_id_idx
  on public.event_logs (user_id);

create index if not exists event_logs_event_name_idx
  on public.event_logs (event_name);

create index if not exists event_logs_created_at_desc_idx
  on public.event_logs (created_at desc);

create index if not exists event_logs_entity_idx
  on public.event_logs (entity_type, entity_id);

alter table public.event_logs enable row level security;

drop policy if exists "event_logs_insert_own" on public.event_logs;
drop policy if exists "event_logs_select_own" on public.event_logs;

create policy "event_logs_insert_own"
  on public.event_logs for insert
  with check (auth.uid() = user_id);

create policy "event_logs_select_own"
  on public.event_logs for select
  using (auth.uid() = user_id);

-- ============================================================
-- 9. style_knowledge_entries（穿搭知识库 / 关键词 RAG）
-- ============================================================
create table if not exists public.style_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  tags text[] not null default '{}',
  content text not null,
  priority int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists style_knowledge_entries_category_idx
  on public.style_knowledge_entries (category);

create index if not exists style_knowledge_entries_tags_idx
  on public.style_knowledge_entries using gin (tags);

create index if not exists style_knowledge_entries_active_priority_idx
  on public.style_knowledge_entries (is_active, priority desc);

alter table if exists public.style_knowledge_entries
  add column if not exists embedding vector(1024);

alter table if exists public.style_knowledge_entries
  add column if not exists embedding_text text;

alter table if exists public.style_knowledge_entries
  add column if not exists embedding_updated_at timestamptz;

alter table public.style_knowledge_entries enable row level security;

drop policy if exists "style_knowledge_entries_select_active" on public.style_knowledge_entries;

create policy "style_knowledge_entries_select_active"
  on public.style_knowledge_entries for select
  to authenticated
  using (is_active = true);

insert into public.style_knowledge_entries (
  id, title, category, tags, content, priority, is_active
) values
  (
    'c1000001-0001-4000-8000-000000000001',
    '通勤穿搭规则',
    'occasion',
    array['通勤', '上班', '职场', '会议'],
    '通勤穿搭优先利落、干净、耐看。常见组合为衬衫或针织上衣搭配西裤、休闲裤与乐福鞋。颜色以黑白灰、藏青、米白为主，避免过于花哨。整体线条简洁，便于日常办公与通勤步行。',
    10,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000002',
    '约会穿搭规则',
    'occasion',
    array['约会', '温柔', '优雅', '精致', '浪漫'],
    '约会穿搭可适当增加精致感与柔和度。优先选择质感较好的上衣、垂感下装和简洁配饰。颜色可用米白、浅粉、浅杏、浅蓝等柔和色，避免过于硬朗的运动风或过于严肃的全套正装。',
    9,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000003',
    '旅行穿搭规则',
    'occasion',
    array['旅行', '出游', '周末', '休闲', '舒适'],
    '旅行穿搭强调舒适、耐穿、便于活动。建议分层穿搭，便于早晚温差调节。鞋子优先舒适运动鞋或休闲鞋，外套可准备轻便夹克或防风外套，尽量减少易皱、难打理面料。',
    8,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000004',
    '商务正式规则',
    'occasion',
    array['商务', '正式', '会议', '面试', '职场'],
    '商务正式场合优先挺括衬衫、西装外套、西裤或垂感长裤，以及简洁皮鞋。颜色以深色系为主，如黑、藏青、深灰。避免夸张图案、运动单品和过于休闲的鞋款，整体保持专业可信。',
    10,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000005',
    '高温天气穿搭规则',
    'weather',
    array['高温', '炎热', '夏季', '夏天', '透气'],
    '高温天气应优先轻薄、透气、吸汗面料，如棉、麻、真丝。避免厚外套、羽绒、羊毛针织和闷脚靴子。颜色可选浅色系，搭配凉鞋、运动鞋或透气乐福鞋，减少叠穿层数。',
    10,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000006',
    '低温天气穿搭规则',
    'weather',
    array['低温', '寒冷', '冬季', '保暖', '叠穿'],
    '低温天气优先外套、叠穿和保暖材质，如羊毛针织、大衣、羽绒外套。下装可选厚实面料，鞋子优先保暖靴或封闭式皮鞋。可通过内搭、围巾提升保暖性，同时保持外层利落。',
    10,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000007',
    '雨天穿搭规则',
    'weather',
    array['雨天', '下雨', '防水', '耐脏', '通勤'],
    '雨天优先防水或耐脏鞋、深色下装和可遮挡雨势的外套。避免麂皮、浅色易脏鞋和拖地裤脚。包袋可选耐脏材质，配饰尽量精简，保证出行利落。',
    10,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000008',
    '显高穿搭规则',
    'body_goal',
    array['显高', '比例', '利落'],
    '显高可优先高腰下装、九分裤、纵向线条和简洁同色延伸。避免上下都宽松臃肿。鞋款可选简洁乐福鞋、短靴或干净运动鞋，通过提高腰线与纵向延伸优化比例。',
    9,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000009',
    '显瘦穿搭规则',
    'body_goal',
    array['显瘦', '修身', '垂感'],
    '显瘦更推荐通过版型和层次优化比例，而不是单纯追求紧身。可选择垂感好的面料、深色内搭、适度收腰或直筒版型。避免过多横向层叠和膨胀感材质。',
    9,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000010',
    '遮肉穿搭规则',
    'body_goal',
    array['遮肉', '舒适', '宽松'],
    '遮肉可优先适度宽松但仍有廓形的上衣，以及直筒或微阔腿下装。避免紧绷面料和过多横向褶皱。通过深色内搭、简洁外套和利落鞋款保持整体精神感，而不是单纯加大松度。',
    9,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000011',
    '低饱和简约风格规则',
    'style',
    array['简约', '低饱和', '通勤', '黑白灰', '中性色'],
    '低饱和简约风格以黑白灰、米白、藏青、卡其为主，减少高饱和撞色。单品线条干净，图案尽量克制，适合通过材质和版型体现质感，而不是依赖复杂装饰。',
    8,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000012',
    '色彩协调规则',
    'color',
    array['色彩', '配色', '协调', '同色系', '对比色'],
    '全身颜色建议控制在 2-3 个主色。同色系搭配更稳妥，深浅层次可增加高级感。若使用对比色，建议一处为主、一处点缀，避免全身高饱和撞色。',
    8,
    true
  ),
  (
    'c1000001-0001-4000-8000-000000000013',
    '鞋包配饰规则',
    'item',
    array['鞋子', '包包', '配饰', '通勤', '精致'],
    '鞋包配饰决定整体完成度。通勤优先简洁皮鞋、乐福鞋或干净运动鞋；约会可增加丝巾、耳环、质感包袋。配饰数量不宜过多，重点突出 1-2 个亮点即可。',
    7,
    true
  )
on conflict (id) do update set
  title = excluded.title,
  category = excluded.category,
  tags = excluded.tags,
  content = excluded.content,
  priority = excluded.priority,
  is_active = excluded.is_active;

-- ============================================================
-- Triggers
-- ============================================================

-- 新用户注册时自动创建 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- closet_items updated_at 自动更新
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists closet_items_updated_at on public.closet_items;

create trigger closet_items_updated_at
  before update on public.closet_items
  for each row
  execute function public.handle_updated_at();

drop trigger if exists user_style_profiles_updated_at on public.user_style_profiles;

create trigger user_style_profiles_updated_at
  before update on public.user_style_profiles
  for each row
  execute function public.handle_updated_at();

drop trigger if exists user_personal_profiles_updated_at on public.user_personal_profiles;

create trigger user_personal_profiles_updated_at
  before update on public.user_personal_profiles
  for each row
  execute function public.handle_updated_at();

drop trigger if exists product_recommendations_updated_at on public.product_recommendations;

create trigger product_recommendations_updated_at
  before update on public.product_recommendations
  for each row
  execute function public.handle_updated_at();

drop trigger if exists recommendation_ratings_updated_at on public.recommendation_ratings;

create trigger recommendation_ratings_updated_at
  before update on public.recommendation_ratings
  for each row
  execute function public.handle_updated_at();

-- ============================================================
-- Storage: closet bucket（衣服图片）
-- 文件路径格式: {user_id}/{filename}
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'closet',
  'closet',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "closet_select_own" on storage.objects;
drop policy if exists "closet_insert_own" on storage.objects;
drop policy if exists "closet_update_own" on storage.objects;
drop policy if exists "closet_delete_own" on storage.objects;

create policy "closet_select_own"
  on storage.objects for select
  using (
    bucket_id = 'closet'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "closet_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'closet'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "closet_update_own"
  on storage.objects for update
  using (
    bucket_id = 'closet'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'closet'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "closet_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'closet'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- pgvector: 向量索引（HNSW，仅索引已有 embedding 的行）
-- ============================================================
create index if not exists closet_items_embedding_hnsw_idx
  on public.closet_items using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists style_knowledge_entries_embedding_hnsw_idx
  on public.style_knowledge_entries using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- ============================================================
-- pgvector: 相似度检索 RPC
-- ============================================================
create or replace function public.match_closet_items(
  query_embedding vector(1024),
  match_user_id uuid,
  match_count int default 12
)
returns table (
  id uuid,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ci.id,
    (1 - (ci.embedding <=> query_embedding))::float as similarity
  from public.closet_items ci
  where ci.user_id = match_user_id
    and ci.user_id = auth.uid()
    and ci.status = 'ready'
    and ci.embedding is not null
  order by ci.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

create or replace function public.match_style_knowledge_entries(
  query_embedding vector(1024),
  match_count int default 6
)
returns table (
  id uuid,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ske.id,
    (1 - (ske.embedding <=> query_embedding))::float as similarity
  from public.style_knowledge_entries ske
  where ske.is_active = true
    and ske.embedding is not null
  order by ske.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_closet_items(vector, uuid, int) to authenticated;
grant execute on function public.match_style_knowledge_entries(vector, int) to authenticated;


notify pgrst, 'reload schema';