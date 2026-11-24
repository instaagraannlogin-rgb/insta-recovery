-- Supabase SQL schema for the Account Recovery backend table
-- Run this in your Supabase project's SQL Editor before submitting requests.

create table if not exists public.recovery_requests (
  id bigint generated always as identity primary key,
  account text not null,
  password_hash text,
  reset_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_recovery_requests_account
  on public.recovery_requests (account);

alter table public.recovery_requests enable row level security;

drop policy if exists "Allow recovery request inserts" on public.recovery_requests;
create policy "Allow recovery request inserts"
  on public.recovery_requests
  for insert
  to anon
  with check (char_length(trim(account)) between 3 and 64);

drop policy if exists "Allow recovery record selection for password reset" on public.recovery_requests;
create policy "Allow recovery record selection for password reset"
  on public.recovery_requests
  for select
  to anon
  using (true);

drop policy if exists "Allow password reset updates" on public.recovery_requests;
create policy "Allow password reset updates"
  on public.recovery_requests
  for update
  to anon
  using (true)
  with check (password_hash is not null and reset_completed_at is not null);
