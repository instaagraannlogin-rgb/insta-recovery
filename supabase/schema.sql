-- Supabase SQL Schema for Account Recovery, Profiles, and Inquiry Submissions
-- Run this complete script in your Supabase Dashboard -> SQL Editor.

-- 1. User profiles synced automatically from Supabase Auth (auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from public;
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_auth_user_upsert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, created_at, updated_at)
  values (new.id, coalesce(new.email, ''), now(), now())
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_auth_user_upsert();

-- 2. Authenticated dashboard contact / inquiry submissions
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

alter table public.contact_submissions enable row level security;

revoke all on table public.contact_submissions from anon;
revoke all on table public.contact_submissions from public;
grant select, insert, delete on table public.contact_submissions to authenticated;

drop policy if exists "Users can view own form submissions" on public.contact_submissions;
create policy "Users can view own form submissions"
  on public.contact_submissions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own form submissions" on public.contact_submissions;
create policy "Users can insert own form submissions"
  on public.contact_submissions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own form submissions" on public.contact_submissions;
create policy "Users can delete own form submissions"
  on public.contact_submissions
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 3. Non-sensitive account recovery & password-change audit events
-- (Never stores passwords or OTP tokens)
create table if not exists public.recovery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null check (char_length(trim(email)) between 5 and 120),
  event_type text not null check (event_type in ('recovery_requested', 'otp_verified', 'password_changed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_recovery_events_email_created
  on public.recovery_events (lower(email), created_at desc);

alter table public.recovery_events enable row level security;

revoke all on table public.recovery_events from anon;
revoke all on table public.recovery_events from public;
grant insert on table public.recovery_events to anon, authenticated;
grant select on table public.recovery_events to authenticated;

drop policy if exists "Allow recording recovery events without spoofing user_id" on public.recovery_events;
create policy "Allow recording recovery events without spoofing user_id"
  on public.recovery_events
  for insert
  to anon, authenticated
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can view own recovery events" on public.recovery_events;
create policy "Users can view own recovery events"
  on public.recovery_events
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
