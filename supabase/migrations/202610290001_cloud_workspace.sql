-- Run once in Supabase SQL Editor. Safe to rerun; does not import or delete equipment.
begin;
create table if not exists public.calibration_workspaces (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique,
 name text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.calibration_members (
 workspace_id uuid not null references public.calibration_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','editor','viewer')),
 primary key (workspace_id,user_id)
);
-- Preserve the current application's complete structure during the initial migration.
-- One shared document, with optimistic locking to prevent overwriting concurrent changes.
create table if not exists public.calibration_state (
 workspace_id uuid primary key references public.calibration_workspaces(id) on delete cascade,
 data jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 constraint calibration_state_object check (jsonb_typeof(data) = 'object')
);
alter table public.calibration_workspaces enable row level security;
alter table public.calibration_members enable row level security;
alter table public.calibration_state enable row level security;
-- Access only through checked RPCs; no anonymous/public table access.
revoke all on public.calibration_workspaces,public.calibration_members,public.calibration_state from anon,authenticated;

insert into public.calibration_workspaces(slug,name)
values ('calibration-management','量測設備校驗管理') on conflict(slug) do nothing;

create or replace function public.calibration_load(p_slug text)
returns table(workspace_id uuid,member_role text,data jsonb,revision bigint,updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid; v_role text;
begin
 if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode='42501'; end if;
 select w.id,m.role into v_workspace,v_role
 from public.calibration_workspaces w join public.calibration_members m on m.workspace_id=w.id
 where w.slug=p_slug and m.user_id=auth.uid();
 if v_workspace is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501'; end if;
 return query select v_workspace,v_role,s.data,coalesce(s.revision,0),s.updated_at
 from (values (1)) as singleton(n) left join public.calibration_state s on s.workspace_id=v_workspace;
end $$;

create or replace function public.calibration_save(p_slug text,p_expected_revision bigint,p_data jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid; v_role text; v_revision bigint;
begin
 if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode='42501'; end if;
 select w.id,m.role into v_workspace,v_role
 from public.calibration_workspaces w join public.calibration_members m on m.workspace_id=w.id
 where w.slug=p_slug and m.user_id=auth.uid();
 if v_workspace is null or v_role not in ('admin','editor') then
  raise exception 'WRITE_ACCESS_DENIED' using errcode='42501';
 end if;
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'INVALID_REVISION'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object'
  or jsonb_typeof(p_data->'rows') is distinct from 'array'
  or jsonb_typeof(p_data->'manual') is distinct from 'array'
  or jsonb_typeof(p_data->'events') is distinct from 'object'
  or jsonb_typeof(p_data->'settings') is distinct from 'object'
  or jsonb_typeof(p_data->'quotes') is distinct from 'object'
  or jsonb_typeof(p_data->'reports') is distinct from 'object'
  or jsonb_typeof(p_data->'imports') is distinct from 'array' then
  raise exception 'INVALID_CALIBRATION_DATA';
 end if;
 -- Serializes saves, including two users uploading the first data at the same time.
 perform 1 from public.calibration_workspaces w where w.id=v_workspace for update;
 select s.revision into v_revision from public.calibration_state s where s.workspace_id=v_workspace;
 if coalesce(v_revision,0)<>p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
 v_revision:=coalesce(v_revision,0)+1;
 insert into public.calibration_state(workspace_id,data,revision,updated_at,updated_by)
 values(v_workspace,p_data,v_revision,now(),auth.uid())
 on conflict(workspace_id) do update set data=excluded.data,revision=excluded.revision,
 updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 return v_revision;
end $$;
revoke all on function public.calibration_load(text) from public,anon;
revoke all on function public.calibration_save(text,bigint,jsonb) from public,anon;
grant usage on schema public to authenticated;
grant execute on function public.calibration_load(text) to authenticated;
grant execute on function public.calibration_save(text,bigint,jsonb) to authenticated;
commit;
