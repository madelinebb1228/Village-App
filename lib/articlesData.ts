export interface Article {
  id: string;
  emoji: string;
  title: string;
  category: string;
  readMinutes: number;
  summary: string;
  body: string[];
}

// Starter set of drafted articles. Structured as plain data so more can be
// appended here easily — no schema/screen changes needed to add one.
export const ARTICLES: Article[] = [
  {
    id: 'cluster-feeding',
    emoji: '🍼',
    title: 'Cluster Feeding: Why It Happens and How to Survive It',
    category: 'Feeding',
    readMinutes: 4,
    summary: 'Sudden back-to-back feeds aren\'t a sign something\'s wrong — here\'s what\'s actually going on and how to get through it.',
    body: [
      'Cluster feeding is when a baby wants to nurse or bottle-feed much more frequently than usual — sometimes every 30–60 minutes — often in the evening. It commonly shows up around 2–3 weeks, 6 weeks, and 3 months, lining up with growth spurts and (for breastfeeding parents) your milk supply catching up to demand.',
      'It feels relentless, but it\'s not a sign of low supply or that something is wrong with your baby. It\'s your baby\'s way of telling your body to make more milk, and for formula-fed babies, it\'s often just a growth spurt showing up as extra hunger.',
      'A few things that help: set up a "cluster feeding station" with water, snacks, your phone charger, and the remote within reach before you sit down for the evening. Trade off with a partner or support person for a couple of the feeds if you can, especially if you\'re touched out. And remember it\'s temporary — most stretches last 1–3 days, not weeks.',
      'When to check in with a doctor: if your baby seems unable to settle at all even after feeding, isn\'t having enough wet diapers, or you\'re worried about your own supply or mental health, it\'s always worth a call — cluster feeding shouldn\'t be something you white-knuckle through alone.',
    ],
  },
  {
    id: 'safe-sleep-basics',
    emoji: '😴',
    title: 'Safe Sleep Basics, Without the Overwhelm',
    category: 'Safety',
    readMinutes: 3,
    summary: 'The core AAP safe-sleep guidelines, boiled down to what actually matters most.',
    body: [
      'The American Academy of Pediatrics\' safe sleep guidelines can feel like a long list, but a few things matter far more than the rest: back to sleep, every sleep, until age 1. A firm, flat sleep surface — a crib, bassinet, or pack-and-play with a fitted sheet and nothing else.',
      '"Nothing else" means no loose blankets, pillows, bumpers, or stuffed animals in the sleep space for the first year. A sleep sack or wearable blanket is the safer alternative to a loose blanket for keeping baby warm.',
      'Room-sharing (baby\'s own sleep surface in your room) for at least the first 6 months, ideally 12, is associated with a lower SIDS risk — but bed-sharing (baby in your bed) increases risk and isn\'t recommended by the AAP, even though many families do it and find ways to reduce risk if they choose to.',
      'Other risk-reducers: avoid overheating (dress baby in one layer more than you\'d wear, not more), offer a pacifier at sleep times once breastfeeding is established, and keep baby smoke-free before and after birth.',
      'None of this means you have to be perfect every single nap — it means stacking the odds in your favor as consistently as you reasonably can.',
    ],
  },
  {
    id: 'postpartum-body-recovery',
    emoji: '💜',
    title: 'What Actually Happens to Your Body After Birth',
    category: 'Postpartum',
    readMinutes: 5,
    summary: 'A realistic, no-Instagram-filter rundown of the first six weeks of physical recovery.',
    body: [
      'Postpartum bleeding (lochia) is normal and can last 4–6 weeks, changing from bright red to pink/brown to a light discharge over time. A sudden increase in bleeding, large clots (bigger than a golf ball), or soaking a pad in under an hour warrants an urgent call to your provider.',
      'Afterpains — cramping as your uterus shrinks back down — are often stronger with each subsequent baby and especially during breastfeeding (oxytocin triggers both letdown and uterine contractions). They usually fade within a week or so.',
      'Whether you had a vaginal birth or a C-section, give yourself real time: 6 weeks is the standard "cleared for normal activity" mark, but full recovery — especially core and pelvic floor strength — often takes months, not weeks. Pelvic floor physical therapy is worth asking about even if nothing feels "wrong."',
      'Hormones drop sharply in the days after birth, which is part of why days 3–5 ("baby blues") can feel like an emotional cliff. That\'s expected and usually passes within two weeks. If low mood, anxiety, or intrusive thoughts persist past two weeks or feel severe at any point, that\'s postpartum depression or anxiety territory — common, treatable, and worth reaching out about immediately, not something to push through alone.',
    ],
  },
  {
    id: 'starting-solids',
    emoji: '🥄',
    title: 'Starting Solids: Signs of Readiness and First Foods',
    category: 'Feeding',
    readMinutes: 4,
    summary: 'How to know your baby is ready, and what to actually put on the spoon (or tray) first.',
    body: [
      'Readiness for solids is more about developmental signs than a specific age, though most babies are ready somewhere between 4 and 6 months. Look for: sitting with minimal support, good head/neck control, loss of the tongue-thrust reflex (they stop automatically pushing food back out), and genuine interest in what you\'re eating.',
      'Both traditional spoon-feeding purees and baby-led weaning (offering soft, appropriately-sized whole foods from the start) are supported approaches — plenty of families do a mix of both. Iron-rich foods are the priority for first foods since baby\'s iron stores from birth start depleting around 6 months: iron-fortified infant cereal, pureed or shredded meat, lentils, and beans are all good starting points.',
      'Common allergens (peanut, egg, dairy, tree nuts, soy, wheat, fish, shellfish) are now recommended to be introduced early and often, not delayed — current guidance actually favors introducing peanut products around 6 months (earlier, around 4 months, if there\'s eczema or an egg allergy, after checking with your pediatrician) to reduce allergy risk. Introduce one new allergen at a time and watch for reactions over the following couple of hours.',
      'Skip honey (botulism risk under 1 year), whole grapes/nuts/popcorn/hard chunks (choking risk), and added salt or sugar. Everything else is mostly about texture-appropriate prep, not a strict "banned foods" list.',
    ],
  },
  {
    id: 'wake-windows-explained',
    emoji: '⏰',
    title: 'Wake Windows: What They Are and Why They Matter',
    category: 'Sleep',
    readMinutes: 3,
    summary: 'The concept behind every nap-timing app and chart, explained simply.',
    body: [
      'A "wake window" is the amount of time a baby can comfortably stay awake between sleep periods before becoming overtired. It\'s not a fixed number — it changes quickly in the first year as your baby\'s nervous system matures, generally getting longer month by month.',
      'Newborns often can only handle 45–60 minutes awake before needing to sleep again; by a year, many babies are stretching to 3–4 hours between naps. Watching your specific baby\'s cues (rubbing eyes, staring off, fussiness, yawning) alongside a general age-based range is more reliable than chasing an exact number from a chart.',
      'Why it matters: an overtired baby often fights sleep harder and wakes more, not less — cortisol and adrenaline released from being overtired can actually make it harder to fall and stay asleep, which is the opposite of what exhausted parents expect.',
      'If bedtime or naps are consistently a fight, the wake window is one of the first things worth checking — sometimes shortening it by even 15–20 minutes makes a noticeable difference.',
    ],
  },
  {
    id: 'baby-proofing-checklist',
    emoji: '🏠',
    title: 'Baby-Proofing: What to Actually Prioritize',
    category: 'Safety',
    readMinutes: 4,
    summary: 'You don\'t need to do everything at once — here\'s what matters most, and when.',
    body: [
      'Before crawling starts: outlet covers, securing furniture and TVs to the wall (tip-over injuries are more common than people expect once babies start pulling up), and moving cleaning supplies/medications up and out of reach — these matter before mobility, not after.',
      'Once crawling/cruising starts: stair gates at the top and bottom of stairs, cabinet locks on anything with chemicals or sharp items, corner guards on sharp furniture edges, and blind cord safety (cordless blinds are safest, or tie cords well out of reach) — window blind cords are a real strangulation risk that\'s easy to overlook.',
      'Ongoing, all ages: keep small objects and button batteries away from little hands (choking and, for batteries, serious internal injury), check that crib/furniture recalls haven\'t affected anything you own, and lower the crib mattress before baby can pull to stand.',
      'You genuinely don\'t need to do all of this in one weekend. Prioritize by your baby\'s current mobility stage and reassess every month or two as they gain new skills.',
    ],
  },
];
