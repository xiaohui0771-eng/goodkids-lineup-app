create table if not exists public.queue_tasks (
  id bigint generated always as identity primary key,
  ticket_no integer not null unique,
  visitor_id text not null,
  task_name text not null,
  priority text not null check (priority in ('normal', 'urgent')),
  status text not null check (status in ('queued', 'serving', 'completed')),
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz
);

alter table if exists public.queue_tasks
  add column if not exists task_name text;

update public.queue_tasks
  set task_name = coalesce(nullif(task_name, ''), 'Untitled task')
  where task_name is null or task_name = '';

alter table if exists public.queue_tasks
  alter column task_name set not null;

create table if not exists public.queue_settings (
  singleton boolean primary key default true,
  daily_capacity integer not null default 4,
  business_hours_start text not null default '09:00',
  business_hours_end text not null default '24:00',
  constraint queue_settings_singleton check (singleton = true)
);

create table if not exists public.business_calendar (
  date date primary key,
  kind text not null check (kind in ('holiday', 'workday'))
);

insert into public.queue_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function public.issue_queue_ticket(
  p_visitor_id text,
  p_priority text default 'normal',
  p_task_name text default ''
)
returns jsonb
language plpgsql
security definer
as $$
declare
  next_ticket_no integer;
  normalized_priority text := case when p_priority = 'urgent' then 'urgent' else 'normal' end;
begin
  if trim(coalesce(p_visitor_id, '')) = '' then
    raise exception 'visitor id required';
  end if;

  if trim(coalesce(p_task_name, '')) = '' then
    raise exception 'task name required';
  end if;

  if exists (
    select 1
    from public.queue_tasks
    where visitor_id = p_visitor_id
      and status in ('queued', 'serving')
  ) then
    raise exception 'active ticket already exists';
  end if;

  /*
  -- legacy duplicate-check block removed during local refactor
  if false and exists (
    select 1
    from public.queue_tasks
    where visitor_id = p_visitor_id
      and status in ('queued', 'serving')
  ) then
    raise exception '当前设备已经有有效取号，不能重复取号。';
  end if;

  */
  perform pg_advisory_xact_lock(920001);

  select coalesce(max(ticket_no), 0) + 1
    into next_ticket_no
    from public.queue_tasks;

  insert into public.queue_tasks (ticket_no, visitor_id, task_name, priority, status)
  values (next_ticket_no, p_visitor_id, trim(p_task_name), normalized_priority, 'queued');

  return jsonb_build_object(
    'ticket_no', next_ticket_no,
    'priority', normalized_priority,
    'task_name', trim(p_task_name)
  );
end;
$$;

create or replace function public.advance_queue_task()
returns jsonb
language plpgsql
security definer
as $$
declare
  current_row public.queue_tasks%rowtype;
  next_row public.queue_tasks%rowtype;
begin
  perform pg_advisory_xact_lock(920002);

  select *
    into current_row
    from public.queue_tasks
    where status = 'serving'
    order by started_at asc nulls first, created_at asc
    limit 1
    for update;

  if found then
    update public.queue_tasks
      set status = 'completed',
          completed_at = timezone('utc', now())
      where id = current_row.id;
  end if;

  select *
    into next_row
    from public.queue_tasks
    where status = 'queued'
    order by case when priority = 'urgent' then 0 else 1 end, created_at asc
    limit 1
    for update skip locked;

  if next_row.id is not null then
    update public.queue_tasks
      set status = 'serving',
          started_at = coalesce(started_at, timezone('utc', now()))
      where id = next_row.id;
  end if;

  return jsonb_build_object(
    'completed_ticket_no', current_row.ticket_no,
    'current_ticket_no', next_row.ticket_no
  );
end;
$$;
