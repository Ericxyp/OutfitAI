-- ============================================================
-- OutfitAI MVP — Supabase Schema
-- 在 Supabase Dashboard → SQL Editor 中整段复制执行
-- ============================================================

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
