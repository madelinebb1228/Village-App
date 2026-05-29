-- Direct messaging tables

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  participant_1 uuid not null references auth.users(id) on delete cascade,
  participant_2 uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint unique_convo unique (participant_1, participant_2),
  constraint different_participants check (participant_1 <> participant_2)
);

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists idx_conversations_p1 on conversations(participant_1, last_message_at desc);
create index if not exists idx_conversations_p2 on conversations(participant_2, last_message_at desc);
create index if not exists idx_direct_messages_convo on direct_messages(conversation_id, created_at asc);

-- RLS
alter table conversations enable row level security;
alter table direct_messages enable row level security;

create policy "participants can view their conversations"
  on conversations for select
  using (participant_1 = auth.uid() or participant_2 = auth.uid());

create policy "participants can create conversations"
  on conversations for insert
  with check (participant_1 = auth.uid() or participant_2 = auth.uid());

create policy "participants can update last_message_at"
  on conversations for update
  using (participant_1 = auth.uid() or participant_2 = auth.uid());

create policy "participants can view messages"
  on direct_messages for select
  using (
    exists (
      select 1 from conversations
      where id = conversation_id
        and (participant_1 = auth.uid() or participant_2 = auth.uid())
    )
  );

create policy "participants can send messages"
  on direct_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations
      where id = conversation_id
        and (participant_1 = auth.uid() or participant_2 = auth.uid())
    )
  );

create policy "recipients can mark messages read"
  on direct_messages for update
  using (
    exists (
      select 1 from conversations
      where id = conversation_id
        and (participant_1 = auth.uid() or participant_2 = auth.uid())
    )
  );
