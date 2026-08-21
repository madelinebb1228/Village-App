-- Comments on the curated "Common Questions" content (lib/topQuestionsData.ts).
-- Those questions are static app-bundled content, not DB rows, so question_id
-- is a plain text key (e.g. 'q1') matching TopQuestion.id — not a foreign key
-- into a questions table, unlike qa_answers/qa_replies which back the live
-- community Q&A in QAScreen.tsx. Mirrors the activity_tips pattern in
-- activity_community.sql. Run once in the Supabase SQL editor. Safe to re-run
-- (idempotent).

create table if not exists public.common_question_comments (
  id          uuid primary key default gen_random_uuid(),
  question_id text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  author      text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_common_question_comments_question on public.common_question_comments (question_id, created_at desc);

alter table public.common_question_comments enable row level security;

drop policy if exists common_question_comments_read_all on public.common_question_comments;
create policy common_question_comments_read_all on public.common_question_comments
  for select using (true);

drop policy if exists common_question_comments_insert_own on public.common_question_comments;
create policy common_question_comments_insert_own on public.common_question_comments
  for insert with check (user_id = auth.uid());

drop policy if exists common_question_comments_delete_own on public.common_question_comments;
create policy common_question_comments_delete_own on public.common_question_comments
  for delete using (user_id = auth.uid());
