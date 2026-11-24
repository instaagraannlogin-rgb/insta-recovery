-- Supabase SQL Schema for Legitimate Contact / Form Submissions
-- Run this complete script in your Supabase Dashboard -> SQL Editor.

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  email text not null check (char_length(trim(email)) between 5 and 120),
  phone_number text not null default '' check (char_length(trim(phone_number)) <= 30),
  message text not null check (char_length(trim(message)) between 5 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_submissions_user_created
  on public.contact_submissions (user_id, created_at desc);

-- Enable Row Level Security (RLS)
alter table public.contact_submissions enable row level security;

-- Revoke broad access and grant only required privileges to authenticated users
revoke all on table public.contact_submissions from anon;
revoke all on table public.contact_submissions from public;
grant select, insert, delete on table public.contact_submissions to authenticated;

-- Policy 1: Authenticated users can view only their own submissions
drop policy if exists "Users can view own form submissions" on public.contact_submissions;
create policy "Users can view own form submissions"
  on public.contact_submissions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Policy 2: Authenticated users can insert submissions only for their own user_id
drop policy if exists "Users can insert own form submissions" on public.contact_submissions;
create policy "Users can insert own form submissions"
  on public.contact_submissions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Policy 3: Authenticated users can delete only their own submissions
drop policy if exists "Users can delete own form submissions" on public.contact_submissions;
create policy "Users can delete own form submissions"
  on public.contact_submissions
  for delete
  to authenticated
  using (auth.uid() = user_id);
