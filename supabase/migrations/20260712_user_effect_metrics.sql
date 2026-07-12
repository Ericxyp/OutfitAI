-- ============================================================
-- Migration 20260712: user effect metrics
-- recommendation_wear_confirmations + recommendation_ratings
-- 可在 Supabase Dashboard → SQL Editor 中单独执行
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

drop trigger if exists recommendation_ratings_updated_at on public.recommendation_ratings;

create trigger recommendation_ratings_updated_at
  before update on public.recommendation_ratings
  for each row
  execute function public.handle_updated_at();

notify pgrst, 'reload schema';
