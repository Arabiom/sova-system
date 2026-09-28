-- 017: the team — working time and tasks
--
-- • staff_activity: one row per employee per day (Oman time): when they first opened the system,
--   their last activity, and the minutes they were actually active. The app reports activity
--   once a minute while the employee is using it; an idle or closed window adds nothing, and
--   several open tabs count once.
-- • staff_tasks: tasks the manager (or finance) gives each employee, with a due date and priority.
--   The employee sees their own tasks, moves them along (جديدة → قيد التنفيذ → منجزة) and may
--   add tasks for themselves. The manager, finance and the viewer see everything.
--
-- Needs 003 and 011 first. Additive only. Safe to run more than once.

-- 1. Working time -------------------------------------------------------------------------------
create table if not exists public.staff_activity (
  user_id         uuid not null references auth.users (id) on delete cascade,
  day             date not null,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  active_minutes  integer not null default 0,
  primary key (user_id, day)
);

alter table public.staff_activity enable row level security;

drop policy if exists staff_activity_read on public.staff_activity;
create policy staff_activity_read on public.staff_activity for select
  using (user_id = auth.uid() or public.staff_role() in ('admin', 'finance', 'viewer'));
-- no insert/update policy: rows are only written through track_activity()

create or replace function public.track_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Muscat')::date;
begin
  if auth.uid() is null or public.staff_role() is null then
    return;
  end if;
  insert into public.staff_activity (user_id, day) values (auth.uid(), today)
  on conflict (user_id, day) do update set
    -- one minute per report, at most one report counted per ~minute (several tabs count once);
    -- after a long pause (idle / closed) the time in between is not counted
    active_minutes = staff_activity.active_minutes
      + case when now() - staff_activity.last_seen between interval '50 seconds' and interval '5 minutes' then 1 else 0 end,
    last_seen = case when now() - staff_activity.last_seen >= interval '50 seconds' then now() else staff_activity.last_seen end;
end;
$$;

grant execute on function public.track_activity() to authenticated;

-- 2. Tasks --------------------------------------------------------------------------------------
create table if not exists public.staff_tasks (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  assigned_to    uuid not null references auth.users (id) on delete cascade,
  title          text not null,
  details        text not null default '',
  exhibition_id  uuid references public.exhibitions (id) on delete set null,
  due_date       date,
  priority       text not null default 'عادية' check (priority in ('عادية', 'مهمة', 'عاجلة')),
  status         text not null default 'جديدة' check (status in ('جديدة', 'قيد التنفيذ', 'منجزة')),
  note           text not null default '',
  completed_at   timestamptz
);

create index if not exists staff_tasks_assigned_idx on public.staff_tasks (assigned_to, status);

alter table public.staff_tasks enable row level security;

drop policy if exists staff_tasks_read on public.staff_tasks;
drop policy if exists staff_tasks_insert on public.staff_tasks;
drop policy if exists staff_tasks_update on public.staff_tasks;
drop policy if exists staff_tasks_delete on public.staff_tasks;

create policy staff_tasks_read on public.staff_tasks for select
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.staff_role() in ('admin', 'finance', 'viewer'));
-- managers assign to anyone; everyone else only to themselves
create policy staff_tasks_insert on public.staff_tasks for insert
  with check (public.can_write() and created_by = auth.uid()
              and (public.staff_role() in ('admin', 'finance') or assigned_to = auth.uid()));
create policy staff_tasks_update on public.staff_tasks for update
  using (public.staff_role() in ('admin', 'finance') or (public.can_write() and (assigned_to = auth.uid() or created_by = auth.uid())))
  with check (public.staff_role() in ('admin', 'finance') or (public.can_write() and (assigned_to = auth.uid() or created_by = auth.uid())));
create policy staff_tasks_delete on public.staff_tasks for delete
  using (public.staff_role() in ('admin', 'finance') or (created_by = auth.uid() and assigned_to = auth.uid()));

-- An employee moves their task along and adds a note; only the manager changes what the task
-- is, who has it and when it is due (unless the employee wrote the task for themselves).
-- Finishing a task stamps the time.
create or replace function public.staff_tasks_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.staff_role() not in ('admin', 'finance') and old.created_by is distinct from auth.uid() then
    if new.title is distinct from old.title or new.details is distinct from old.details
       or new.assigned_to is distinct from old.assigned_to or new.due_date is distinct from old.due_date
       or new.priority is distinct from old.priority or new.exhibition_id is distinct from old.exhibition_id then
      raise exception 'تعديل المهمة للمدير — يمكنك تغيير حالتها وإضافة ملاحظة فقط' using errcode = '42501';
    end if;
  end if;
  if public.staff_role() not in ('admin', 'finance') and new.assigned_to is distinct from old.assigned_to and new.assigned_to <> auth.uid() then
    raise exception 'إسناد المهام لموظف آخر للمدير فقط' using errcode = '42501';
  end if;
  new.updated_at := now();
  if new.status = 'منجزة' and old.status is distinct from 'منجزة' then
    new.completed_at := now();
  elsif new.status <> 'منجزة' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_tasks_guard on public.staff_tasks;
create trigger staff_tasks_guard
  before update on public.staff_tasks
  for each row execute function public.staff_tasks_guard();
