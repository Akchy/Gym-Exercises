-- Optional cloud sync on Supabase. The app only ever sends AES-256-GCM ciphertext,
-- so even the database owner cannot read users' data.
create table if not exists public.vault_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z0-9_.-]{1,64}$'),
  value text not null check (length(value) < 10485760),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.vault_items enable row level security;

create policy "own rows: select" on public.vault_items for select using (auth.uid() = user_id);
create policy "own rows: insert" on public.vault_items for insert with check (auth.uid() = user_id);
create policy "own rows: update" on public.vault_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.vault_items for delete using (auth.uid() = user_id);

create or replace function public.touch_vault_items() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger vault_items_touch before update on public.vault_items for each row execute function public.touch_vault_items();
