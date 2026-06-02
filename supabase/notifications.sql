-- In-app notifications

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('like', 'comment', 'mention')),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  post_preview text,
  comment_preview text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own notifications" ON notifications;
DROP POLICY IF EXISTS "triggers can insert notifications" ON notifications;
DROP POLICY IF EXISTS "users mark own read" ON notifications;
DROP POLICY IF EXISTS "users delete own notifications" ON notifications;

CREATE POLICY "users see own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "triggers can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "users mark own read" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "users delete own notifications" ON notifications FOR DELETE USING (user_id = auth.uid());

-- Trigger: notify post author when someone likes their post
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS trigger AS $$
DECLARE
  v_post_author uuid;
  v_post_preview text;
  v_actor_name text;
BEGIN
  SELECT user_id, LEFT(content, 100) INTO v_post_author, v_post_preview
  FROM posts WHERE id = NEW.post_id;

  IF v_post_author IS NULL OR v_post_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, username, 'Someone') INTO v_actor_name
  FROM profiles WHERE id = NEW.user_id;

  INSERT INTO notifications (user_id, actor_id, type, post_id, post_preview)
  VALUES (v_post_author, NEW.user_id, 'like', NEW.post_id, v_post_preview)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_like_inserted ON user_likes;
CREATE TRIGGER on_like_inserted
AFTER INSERT ON user_likes
FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- Trigger: notify post author when someone comments on their post
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS trigger AS $$
DECLARE
  v_post_author uuid;
  v_post_preview text;
BEGIN
  SELECT user_id, LEFT(content, 100) INTO v_post_author, v_post_preview
  FROM posts WHERE id = NEW.post_id;

  IF v_post_author IS NULL OR v_post_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id, post_preview, comment_preview)
  VALUES (v_post_author, NEW.user_id, 'comment', NEW.post_id, NEW.id, v_post_preview, LEFT(NEW.content, 100));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_inserted ON comments;
CREATE TRIGGER on_comment_inserted
AFTER INSERT ON comments
FOR EACH ROW EXECUTE FUNCTION notify_on_comment();
