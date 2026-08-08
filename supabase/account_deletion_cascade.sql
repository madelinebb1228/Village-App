-- App Store compliance (Guideline 5.1.1): account deletion must actually be
-- able to complete. These ~16 FKs referencing auth.users/profiles had no
-- ON DELETE rule (defaults to RESTRICT), so calling
-- auth.admin.deleteUser() for a user with any row in these tables would
-- fail with a foreign-key violation. Bringing them in line with the
-- ON DELETE CASCADE already used on the other 95+ user-owned tables lets
-- deleting the auth user cascade-delete everything without the edge
-- function having to enumerate every table by hand.
-- Run once in the Supabase SQL Editor (or via `supabase db query --linked`).

ALTER TABLE public.group_suggestions DROP CONSTRAINT IF EXISTS group_suggestions_suggested_by_fkey;
ALTER TABLE public.group_suggestions ADD CONSTRAINT group_suggestions_suggested_by_fkey
  FOREIGN KEY (suggested_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.growth_logs DROP CONSTRAINT IF EXISTS growth_logs_user_id_fkey;
ALTER TABLE public.growth_logs ADD CONSTRAINT growth_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.marketplace_conversations DROP CONSTRAINT IF EXISTS marketplace_conversations_buyer_id_fkey;
ALTER TABLE public.marketplace_conversations ADD CONSTRAINT marketplace_conversations_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.marketplace_conversations DROP CONSTRAINT IF EXISTS marketplace_conversations_seller_id_fkey;
ALTER TABLE public.marketplace_conversations ADD CONSTRAINT marketplace_conversations_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_user_id_fkey;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.marketplace_messages DROP CONSTRAINT IF EXISTS marketplace_messages_sender_id_fkey;
ALTER TABLE public.marketplace_messages ADD CONSTRAINT marketplace_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.milestone_photos DROP CONSTRAINT IF EXISTS milestone_photos_user_id_fkey;
ALTER TABLE public.milestone_photos ADD CONSTRAINT milestone_photos_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.milestones DROP CONSTRAINT IF EXISTS milestones_user_id_fkey;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.post_reports DROP CONSTRAINT IF EXISTS post_reports_reporter_id_fkey;
ALTER TABLE public.post_reports ADD CONSTRAINT post_reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.qa_answers DROP CONSTRAINT IF EXISTS qa_answers_user_id_fkey;
ALTER TABLE public.qa_answers ADD CONSTRAINT qa_answers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.qa_follows DROP CONSTRAINT IF EXISTS qa_follows_user_id_fkey;
ALTER TABLE public.qa_follows ADD CONSTRAINT qa_follows_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.qa_questions DROP CONSTRAINT IF EXISTS qa_questions_user_id_fkey;
ALTER TABLE public.qa_questions ADD CONSTRAINT qa_questions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.qa_replies DROP CONSTRAINT IF EXISTS qa_replies_user_id_fkey;
ALTER TABLE public.qa_replies ADD CONSTRAINT qa_replies_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.qa_votes DROP CONSTRAINT IF EXISTS qa_votes_user_id_fkey;
ALTER TABLE public.qa_votes ADD CONSTRAINT qa_votes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.resource_suggestions DROP CONSTRAINT IF EXISTS resource_suggestions_submitted_by_fkey;
ALTER TABLE public.resource_suggestions ADD CONSTRAINT resource_suggestions_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.term_suggestions DROP CONSTRAINT IF EXISTS term_suggestions_user_id_fkey;
ALTER TABLE public.term_suggestions ADD CONSTRAINT term_suggestions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
