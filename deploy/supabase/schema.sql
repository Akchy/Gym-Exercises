-- GymFree cloud save: one row per signed-in user holding their whole app data as JSON.
-- Run once in Supabase -> SQL editor. Safe to re-run.
--
-- Row Level Security: each user can only read and write their own row. The project owner
-- (you, in the Supabase dashboard) can read all rows.
create table if not exists public.user_data (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) < 5 * 1024 * 1024),
  -- When the user made this version (set by the app, used for "newest wins" between devices).
  updated_at timestamptz not null
);

alter table public.user_data enable row level security;

drop policy if exists "own row: select" on public.user_data;
drop policy if exists "own row: insert" on public.user_data;
drop policy if exists "own row: update" on public.user_data;
drop policy if exists "own row: delete" on public.user_data;

create policy "own row: select" on public.user_data for select to authenticated using (auth.uid() = user_id);
create policy "own row: insert" on public.user_data for insert to authenticated with check (auth.uid() = user_id);
create policy "own row: update" on public.user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row: delete" on public.user_data for delete to authenticated using (auth.uid() = user_id);
