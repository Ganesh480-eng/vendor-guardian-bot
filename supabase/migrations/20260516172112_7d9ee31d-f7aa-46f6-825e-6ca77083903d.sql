
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Approval status enum
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'none');

-- Threads (one per vendor evaluation conversation)
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New evaluation',
  vendor_name text,
  current_evaluation jsonb,
  approval_status public.approval_status not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.threads enable row level security;
create policy "threads_owner_all" on public.threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index threads_user_idx on public.threads(user_id, updated_at desc);

-- Messages (full AI SDK UIMessage parts)
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  parts jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy "messages_owner_all" on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index messages_thread_idx on public.messages(thread_id, created_at);

-- Audit logs (ArmorIQ-style)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete cascade,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create policy "audit_owner_select" on public.audit_logs for select using (auth.uid() = user_id);
create policy "audit_owner_insert" on public.audit_logs for insert with check (auth.uid() = user_id);
create index audit_user_idx on public.audit_logs(user_id, created_at desc);
