-- Study platform schema. Run in Supabase SQL Editor (or `supabase db push`).
-- Security model: ALL data access goes through the Express API (service-role key).
-- RLS is enabled on every table with NO policies, and anon/authenticated roles
-- have no table privileges, so the browser can never read answer keys directly.

create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  description text,
  join_code text not null unique,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index on group_members(user_id);

create table exams (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  description text,
  time_limit_minutes int not null default 60 check (time_limit_minutes between 1 and 300),
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on exams(group_id);

create table questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  position int not null,
  type text not null check (type in ('mcq','written')),
  question_text text not null,
  options jsonb,                 -- [{id,text}]
  correct_option_id text,
  explanation text,
  reference_answer text,
  rubric text,
  topic text,
  max_points numeric not null default 1 check (max_points > 0),
  check (type <> 'mcq' or max_points = 1)
);
create index on questions(exam_id, position);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  time_limit_minutes int not null,
  submitted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','expired')),
  grading_status text not null default 'none' check (grading_status in ('none','graded','failed')),
  total_score numeric,
  maximum_score numeric
);
create index on attempts(user_id, exam_id);

-- Snapshot of what the student actually got (questions + shuffled options + points),
-- the private answer key, and the student's answer/grade in one row.
create table attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts(id) on delete cascade,
  question_id uuid references questions(id) on delete set null,
  position int not null,
  snapshot jsonb not null,       -- {type, question_text, options, topic}
  answer_key jsonb not null,     -- {correct_option_id, explanation, reference_answer, rubric}
  max_points numeric not null,
  selected_option_id text,
  text_answer text,
  image_paths jsonb not null default '[]',
  flagged boolean not null default false,
  is_correct boolean,
  awarded_points numeric,
  ai_feedback text,
  ai_result jsonb
);
create index on attempt_questions(attempt_id);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  exam_id uuid references exams(id) on delete cascade,
  kind text not null check (kind in ('grading','extraction')),
  created_at timestamptz not null default now()
);
create index on ai_usage(user_id, kind, exam_id);

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table exams enable row level security;
alter table questions enable row level security;
alter table attempts enable row level security;
alter table attempt_questions enable row level security;
alter table ai_usage enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- Private bucket for handwritten-answer photos (accessed only via the API).
insert into storage.buckets (id, name, public) values ('answers','answers', false)
on conflict (id) do nothing;
