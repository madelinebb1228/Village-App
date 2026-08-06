-- Age-Appropriate Activities & Developmental Play
-- Reference content table (like local_resources) — read-only for all users,
-- managed by admins via the Supabase SQL editor, not user-writable.
-- Run once in the Supabase SQL editor. Safe to re-run for the schema/RLS
-- portion; re-running the seed INSERTs below will duplicate rows, so only
-- run the seed block once (or clear the table first).

-- ── activities ───────────────────────────────────────────────────────────

create table if not exists public.activities (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text not null,
  age_min_months       int not null,
  age_max_months       int not null,
  duration_minutes     int not null,
  materials_needed     jsonb not null default '[]'::jsonb,   -- e.g. ["rug","rattle"]
  developmental_areas  jsonb not null default '[]'::jsonb,   -- e.g. ["motor","cognitive"]
  instructions         text not null,
  benefits             text,
  difficulty           text not null default 'easy' check (difficulty in ('easy','medium','hard')),
  mess_level           int not null default 1 check (mess_level between 1 and 5),
  image_url            text,
  video_url            text,
  tags                 jsonb not null default '[]'::jsonb,   -- e.g. ["indoor","screen-free"]
  created_at           timestamptz not null default now()
);

create index if not exists idx_activities_age on public.activities (age_min_months, age_max_months);

alter table public.activities enable row level security;

drop policy if exists activities_read_all on public.activities;
create policy activities_read_all on public.activities
  for select using (true);

-- ── Seed: 20 activities across age ranges ───────────────────────────────
-- Only run this block once — re-running will insert duplicate rows.

insert into public.activities
  (title, description, age_min_months, age_max_months, duration_minutes,
   materials_needed, developmental_areas, instructions, benefits, difficulty, mess_level, tags)
values

-- ══════════ 0–3 months ══════════
('Tummy Time Mirror Play',
 'Prop an unbreakable mirror in front of baby during tummy time so they can practice lifting their head to see their own reflection.',
 0, 3, 5,
 '["unbreakable baby mirror", "blanket or mat"]'::jsonb,
 '["motor", "social"]'::jsonb,
 'Lay a blanket on the floor. Place baby on their tummy and set an unbreakable mirror about 8–10 inches in front of their face. Get down at their eye level and narrate what they see. Stop if baby gets fussy — a minute or two is plenty at first.',
 'Builds neck and shoulder strength and gives baby an early, engaging reason to practice lifting their head.',
 'easy', 1,
 '["tummy time", "indoor", "screen-free"]'::jsonb),

('High-Contrast Card Gazing',
 'Hold up simple black-and-white pattern cards for baby to focus on and track with their eyes.',
 0, 3, 5,
 '["high-contrast cards or printed black/white patterns"]'::jsonb,
 '["cognitive", "motor"]'::jsonb,
 'Hold a card 8–12 inches from baby''s face. Hold still until they focus, then slowly move it side to side to encourage eye tracking. Try 3–4 different cards per session.',
 'Newborn vision favors high contrast — this helps develop visual focus and tracking skills.',
 'easy', 1,
 '["visual development", "quiet", "screen-free"]'::jsonb),

('Gentle Stretch & Song',
 'A calm bicycle-leg-stretch routine paired with singing, done during a diaper change or after a bath.',
 0, 3, 5,
 '["none"]'::jsonb,
 '["motor", "social"]'::jsonb,
 'With baby on their back, gently move their legs in a bicycling motion while singing a simple song. Keep movements slow and watch baby''s cues — stop if they seem uncomfortable.',
 'Encourages body awareness and hip mobility, and the sound of your voice supports bonding and language exposure.',
 'easy', 1,
 '["bonding", "indoor", "screen-free"]'::jsonb),

('Black-and-White Mobile Watching',
 'Hang a simple high-contrast mobile above baby during supervised awake time on their back.',
 0, 2, 10,
 '["black-and-white mobile"]'::jsonb,
 '["cognitive", "motor"]'::jsonb,
 'Place baby on their back under the mobile, close enough to focus on (12–18 inches). Let them watch the shapes move; talk about what they''re looking at. Always supervise.',
 'Supports early visual tracking and gives baby calm, independent sensory input.',
 'easy', 1,
 '["visual development", "independent play"]'::jsonb),

('Baby Massage Time',
 'A short, gentle massage routine using baby-safe oil or lotion, done when baby is calm and alert.',
 0, 3, 10,
 '["baby-safe oil or lotion", "soft towel"]'::jsonb,
 '["social", "motor"]'::jsonb,
 'Lay baby on a towel in a warm room. Warm a small amount of oil in your hands and use light, slow strokes on their legs, arms, and back, watching their face for comfort. Stop any area baby seems to dislike.',
 'Promotes bonding and body awareness, and can help some babies with gas or fussiness relax.',
 'easy', 2,
 '["bonding", "soothing", "indoor"]'::jsonb),

-- ══════════ 3–6 months ══════════
('Reach & Grasp Rattle Play',
 'Dangle a lightweight rattle just within reach so baby practices swiping and grasping.',
 3, 6, 10,
 '["lightweight rattle"]'::jsonb,
 '["motor"]'::jsonb,
 'Sit baby propped up or lay them on their back. Hold a rattle about 6 inches above their chest and shake it gently to draw attention, then let it drift into reach. Celebrate every swipe or grab, even near-misses.',
 'Builds the hand-eye coordination and reach-and-grasp skills that lead toward intentional grabbing.',
 'easy', 1,
 '["fine motor", "indoor", "screen-free"]'::jsonb),

('Textured Sensory Basket',
 'A basket of safe household items with different textures for baby to touch and mouth under supervision.',
 4, 8, 10,
 '["soft washcloth", "silicone item", "crinkle fabric", "basket"]'::jsonb,
 '["cognitive", "motor"]'::jsonb,
 'Gather 3–4 baby-safe items of different textures (soft, bumpy, smooth, crinkly) too big to be a choking hazard. Sit with baby and let them explore each one, narrating the textures. Supervise closely — everything goes to the mouth.',
 'Sensory exploration builds early cognitive connections and fine motor skill through grasping different shapes.',
 'easy', 2,
 '["sensory", "indoor"]'::jsonb),

('Tummy Time Reach for Toy',
 'Place a toy just out of reach during tummy time to encourage baby to push up and stretch toward it.',
 3, 6, 8,
 '["favorite toy", "mat"]'::jsonb,
 '["motor"]'::jsonb,
 'During tummy time, place a toy about 6 inches in front of baby, just out of reach. Encourage them to push up on their arms and stretch toward it. Move it closer if they get frustrated.',
 'Strengthens the arm, shoulder, and core muscles baby needs for rolling and eventually crawling.',
 'medium', 1,
 '["tummy time", "gross motor", "indoor"]'::jsonb),

('Mirror Self-Discovery',
 'Sit baby in front of a mirror and narrate their reflection to build early self-awareness.',
 3, 6, 10,
 '["unbreakable mirror"]'::jsonb,
 '["social", "cognitive"]'::jsonb,
 'Sit with baby facing a mirror on your lap or propped safely. Point to their reflection and say their name, make faces together, and watch how they react to their own movements.',
 'Early step toward self-recognition and a fun way to build social engagement and language.',
 'easy', 1,
 '["social-emotional", "bonding", "indoor"]'::jsonb),

('Blowing Bubbles',
 'Blow soap bubbles for baby to watch, reach for, and track as they float and pop.',
 4, 6, 10,
 '["baby-safe bubble solution"]'::jsonb,
 '["motor", "cognitive"]'::jsonb,
 'Sit baby securely (on your lap or supported) and blow a few bubbles slowly in front of them. Encourage reaching and watching them pop. Keep bubble solution away from baby''s mouth.',
 'Tracking floating bubbles builds visual tracking, and reaching for them supports hand-eye coordination.',
 'easy', 2,
 '["outdoor-or-indoor", "sensory"]'::jsonb),

-- ══════════ 6–12 months ══════════
('Peekaboo Cause & Effect',
 'The classic peekaboo game, which teaches object permanence and turns into a giggly back-and-forth.',
 6, 12, 5,
 '["none", "or a light scarf"]'::jsonb,
 '["cognitive", "social"]'::jsonb,
 'Cover your face with your hands or a light scarf, then say "Where''s [name]?" before revealing your face with "Peekaboo!" Repeat with exaggerated expressions and pauses to build anticipation.',
 'Teaches that people and objects still exist even when out of sight — a key cognitive milestone — while building social connection.',
 'easy', 1,
 '["cause and effect", "bonding", "screen-free"]'::jsonb),

('Object Permanence Box',
 'A simple box with a hole lets baby drop in a ball and discover it''s still there when they look inside.',
 8, 14, 10,
 '["small box or container", "small ball too big to swallow"]'::jsonb,
 '["cognitive", "motor"]'::jsonb,
 'Cut a ball-sized hole in a sturdy box lid. Show baby how to drop the ball in, then help them look inside or tip the box to retrieve it. Let them repeat the sequence as many times as they want.',
 'Reinforces object permanence and cause-and-effect thinking while practicing the pincer grasp needed to hold the ball.',
 'medium', 1,
 '["object permanence", "pincer grasp", "indoor"]'::jsonb),

('Stacking Cups',
 'Nesting or stacking cups that baby can stack, knock down, and stack again.',
 8, 18, 10,
 '["stacking cups or similar nesting toy"]'::jsonb,
 '["motor", "cognitive"]'::jsonb,
 'Stack 2–3 cups in front of baby and let them knock the tower down. Gradually show them how to stack cups themselves, guiding their hands if needed. Follow their lead — knocking it down is half the fun.',
 'Builds fine motor control, hand-eye coordination, and an early sense of size and spatial relationships.',
 'medium', 1,
 '["fine motor", "problem solving", "indoor"]'::jsonb),

('Crawling Obstacle Course',
 'A simple obstacle course of couch cushions and pillows for baby to crawl over and around.',
 7, 14, 15,
 '["couch cushions", "pillows"]'::jsonb,
 '["motor"]'::jsonb,
 'Arrange soft cushions into a low, gentle obstacle course — a small hill to crawl over, a tunnel between two chairs. Stay right beside baby and cheer them on through each section.',
 'Builds gross motor strength, coordination, and confidence in a new physical skill, in a soft, safe environment.',
 'medium', 2,
 '["gross motor", "crawling", "indoor"]'::jsonb),

('Water Play in a Bowl',
 'Supervised splashing and pouring with a shallow bowl of water and a few cups.',
 9, 15, 10,
 '["shallow bowl", "small cups", "towel"]'::jsonb,
 '["cognitive", "motor"]'::jsonb,
 'Sit baby at a low table or highchair with a shallow bowl of a couple inches of water and 1–2 small cups. Let them pour, splash, and scoop. Never leave baby unattended near water, even a small amount.',
 'Introduces early cause-and-effect and pouring skills, and is a calming sensory activity for many babies.',
 'medium', 4,
 '["sensory", "water play", "indoor"]'::jsonb),

-- ══════════ 12+ months ══════════
('Simple Shape Sorter',
 'A shape-sorting toy that challenges toddlers to match shapes to matching holes.',
 12, 24, 12,
 '["shape sorter toy"]'::jsonb,
 '["cognitive", "motor"]'::jsonb,
 'Show your toddler one shape and its matching hole, guiding their hand the first few times. Let them try independently, offering hints ("try turning it") rather than doing it for them.',
 'Builds problem-solving, spatial reasoning, and fine motor precision, plus the patience to work through trial and error.',
 'medium', 1,
 '["problem solving", "fine motor", "indoor"]'::jsonb),

('Big Building Blocks',
 'Large, chunky blocks for stacking towers and knocking them down.',
 12, 36, 15,
 '["large building blocks"]'::jsonb,
 '["motor", "cognitive"]'::jsonb,
 'Build a small tower together and encourage your toddler to add blocks or knock it over. As they grow, encourage them to count blocks or sort by color while building.',
 'Develops hand-eye coordination, balance and spatial awareness, and early counting or sorting concepts.',
 'easy', 1,
 '["fine motor", "problem solving", "indoor"]'::jsonb),

('Pretend Kitchen Play',
 'Toy pots, pans, and play food (or real kitchen tools) for imaginative cooking play.',
 15, 36, 15,
 '["play kitchen set or real pots/spoons", "play food"]'::jsonb,
 '["language", "social", "cognitive"]'::jsonb,
 'Set up a few pots, spoons, and play food. "Cook" alongside your toddler, narrating what you''re making and asking them questions ("What should we make next?").',
 'Builds language through narration and questions, and pretend play supports early social and cognitive development.',
 'easy', 2,
 '["pretend play", "language", "indoor"]'::jsonb),

('Sticker Sorting',
 'Peeling and placing large stickers onto paper, sorted by color or shape.',
 15, 30, 10,
 '["large stickers", "paper"]'::jsonb,
 '["motor", "cognitive"]'::jsonb,
 'Give your toddler a sheet of large, easy-to-peel stickers and a piece of paper. Encourage them to peel and place stickers anywhere at first, then try grouping by color as their skills grow.',
 'Peeling stickers builds pincer grasp and finger strength, and sorting introduces early categorization skills.',
 'medium', 2,
 '["fine motor", "pincer grasp", "indoor"]'::jsonb),

('Nature Walk & Collect',
 'A slow walk outside collecting leaves, rocks, or sticks in a small bag or bucket.',
 12, 36, 20,
 '["small bag or bucket", "comfortable shoes"]'::jsonb,
 '["cognitive", "motor", "social"]'::jsonb,
 'Take a short walk and let your toddler set the pace, stopping to pick up leaves, pinecones, or rocks. Talk about colors, textures, and sizes of what they find, and let them carry their collection in a bag or bucket.',
 'Builds gross motor skills through walking on uneven ground, language through describing what they find, and an early connection to nature.',
 'easy', 3,
 '["outdoor", "gross motor", "screen-free"]'::jsonb);
