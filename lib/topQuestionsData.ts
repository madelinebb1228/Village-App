export interface TopQuestion {
  id: string;
  category: string;
  question: string;
  answer: string;
}

// A starter set of the most common parenting questions, answered briefly.
// This is a static reference list (distinct from the live community Q&A
// forum in QAScreen.tsx) — structured as plain data so more can be appended
// here easily without touching the screen.
export const TOP_QUESTIONS: TopQuestion[] = [
  // ── Sleep ──
  { id: 'q1', category: 'Sleep', question: 'How much sleep does my baby actually need?', answer: 'Newborns sleep 14–17 hours a day in short stretches; by 6 months most babies are down to 12–15 hours including naps, and by 1 year around 11–14 hours. Every baby varies — trends over a week matter more than any single day.' },
  { id: 'q2', category: 'Sleep', question: 'When can I start sleep training?', answer: 'Most pediatricians say it\'s reasonable to consider around 4–6 months, once a baby is developmentally able to self-soothe and isn\'t reliant on frequent night feeds for growth. There\'s no single "right" method — talk to your pediatrician about what fits your family.' },
  { id: 'q3', category: 'Sleep', question: 'Why does my baby fight naps so hard?', answer: 'Most often it\'s an overtired or undertired wake window, overstimulation right before nap time, or a developmental leap. Check the wake-window guide in Articles for age-based ranges.' },
  { id: 'q4', category: 'Sleep', question: 'Is it safe to let my baby nap in a swing or car seat?', answer: 'For occasional short naps while supervised and awake nearby, it\'s low-risk, but it\'s not recommended for regular or unsupervised sleep — a flat, firm surface is safest for actual sleep sessions.' },
  { id: 'q5', category: 'Sleep', question: 'When do most babies sleep through the night?', answer: 'It varies enormously — anywhere from 3 months to well past a year is within normal range. "Through the night" for a baby is often defined as a 5–6 hour stretch, not necessarily 8+ hours.' },

  // ── Feeding ──
  { id: 'q6', category: 'Feeding', question: 'How do I know if my baby is getting enough milk?', answer: 'Steady weight gain at checkups, 6+ wet diapers a day (after the first week), and regular bowel movements are the main signs. Your pediatrician tracks this at every visit.' },
  { id: 'q7', category: 'Feeding', question: 'When should I introduce solid foods?', answer: 'Most babies are ready developmentally between 4–6 months — see the "Starting Solids" article for the specific readiness signs to watch for rather than going by age alone.' },
  { id: 'q8', category: 'Feeding', question: 'Can I mix breastmilk and formula?', answer: 'Yes — combination feeding is common and safe. There\'s no medical downside to feeding both, and many families do it for supply, convenience, or return-to-work reasons.' },
  { id: 'q9', category: 'Feeding', question: 'How long can pumped breastmilk sit out / in the fridge / in the freezer?', answer: 'General guidance: about 4 hours at room temperature, 4 days in the fridge, and 6–12 months in a deep freezer. Check your specific storage container/pump brand guidance too.' },
  { id: 'q10', category: 'Feeding', question: 'My baby refuses the bottle — what do I do?', answer: 'Try a different caregiver offering it (babies often refuse a bottle from the breastfeeding parent specifically), a different nipple flow/shape, warming the milk, or offering it during a calm, non-hungry moment rather than at peak hunger.' },
  { id: 'q11', category: 'Feeding', question: 'How much formula should my baby drink per day?', answer: 'A common rule of thumb is about 2.5 oz per pound of body weight per day, though this varies by age and baby. Your pediatrician will flag it at checkups if intake looks off.' },

  // ── Health ──
  { id: 'q12', category: 'Health', question: 'When should I call the doctor about a fever?', answer: 'Under 3 months: any fever of 100.4°F (38°C) or higher warrants an immediate call — this age group needs prompt evaluation. Older babies: call if fever is high, persistent beyond a couple days, or paired with other concerning symptoms (lethargy, rash, trouble breathing, refusing fluids).' },
  { id: 'q13', category: 'Health', question: 'How do I safely bring down my baby\'s fever?', answer: 'Weight-based acetaminophen or ibuprofen (ibuprofen only after 6 months) per your pediatrician\'s dosing — see the Med Tracker\'s built-in dose calculator. Never give aspirin to a child. Light clothing and fluids help too.' },
  { id: 'q14', category: 'Health', question: 'What\'s a normal amount of spit-up vs. something to worry about?', answer: 'Frequent spit-up (even many times a day) is normal and usually outgrown by 12–18 months. Forceful/projectile vomiting, blood or bile in spit-up, poor weight gain, or signs of pain warrant a doctor\'s visit.' },
  { id: 'q15', category: 'Health', question: 'When do teeth usually start coming in?', answer: 'Most babies get their first tooth between 4–7 months, though anywhere from 3 months to 12+ months is within normal range. Order and timing vary a lot between babies.' },
  { id: 'q16', category: 'Health', question: 'Is it normal for my baby\'s poop to change color and consistency so often?', answer: 'Yes — color and texture shift a lot with diet changes (breastmilk vs. formula, starting solids) and are rarely concerning. Red, black (after the first few days), or white/gray stool are the colors that warrant a call.' },
  { id: 'q17', category: 'Health', question: 'What vaccines does my baby need and when?', answer: 'The CDC/AAP schedule covers most vaccines in a series of visits from birth through age 6 — see the Vaccine Tracker in this app for a full age-by-age breakdown and to log what\'s been given.' },

  // ── Development ──
  { id: 'q18', category: 'Development', question: 'When should my baby start rolling, sitting, crawling, and walking?', answer: 'Rough ranges: rolling 4–6 months, sitting unassisted 6–8 months, crawling 7–10 months, walking 9–15 months. These ranges are wide and normal — talk to your pediatrician if there\'s no progress well past the upper end.' },
  { id: 'q19', category: 'Development', question: 'When should my baby start talking?', answer: 'Cooing starts around 2 months, babbling around 6 months, first words often 10–14 months, and short phrases around 18–24 months. Hearing checks are worth raising if there\'s little to no vocalization by 12 months.' },
  { id: 'q20', category: 'Development', question: 'Is screen time really that bad for babies?', answer: 'The AAP recommends avoiding screens (other than video-chatting) before 18–24 months, since real-time interaction is how young brains build language and social skills fastest. Occasional exposure isn\'t catastrophic — consistency of habits matters more than a single instance.' },
  { id: 'q21', category: 'Development', question: 'What are developmental "red flags" I should watch for?', answer: 'Examples: no eye contact by 3 months, no response to sounds/name, no babbling by 9 months, no pointing/gestures by 12 months, loss of previously acquired skills at any age. Any of these are worth raising at (or before) your next well-visit.' },

  // ── Postpartum / Mental Health ──
  { id: 'q22', category: 'Postpartum', question: 'What\'s the difference between "baby blues" and postpartum depression?', answer: 'Baby blues affect up to 80% of new parents, peak around day 3–5, and resolve within about 2 weeks on their own. Postpartum depression persists past 2 weeks, is more intense, and needs treatment — it\'s common (roughly 1 in 7) and very treatable.' },
  { id: 'q23', category: 'Postpartum', question: 'Is it normal to not feel bonded to my baby right away?', answer: 'Yes, very. Bonding is often gradual, not instant, especially after a hard birth, with sleep deprivation, or with hormonal shifts. If it\'s paired with persistent numbness, dread, or intrusive thoughts, that\'s worth a conversation with your provider — not a personal failing.' },
  { id: 'q24', category: 'Postpartum', question: 'When can I exercise again after birth?', answer: 'Light walking is usually fine within days. Most providers clear more vigorous exercise around the 6-week check, but core/pelvic floor work should be reintroduced gradually — a pelvic floor PT evaluation is worth asking about regardless of how you feel.' },
  { id: 'q25', category: 'Postpartum', question: 'What are real warning signs I should call my doctor about postpartum?', answer: 'Heavy bleeding (soaking a pad in under an hour), fever over 100.4°F, severe headache with vision changes, calf pain/swelling, chest pain or trouble breathing, or thoughts of harming yourself or the baby — these need urgent medical attention, not a wait-and-see approach.' },

  // ── Gear ──
  { id: 'q26', category: 'Gear', question: 'Do I really need a wipe warmer, bottle sterilizer, and other "extras"?', answer: 'No — none of these are medically necessary. Some families love the convenience, but a basic setup (crib/bassinet, car seat, some feeding gear, diapers) covers the essentials.' },
  { id: 'q27', category: 'Gear', question: 'When should I switch my car seat from rear-facing to forward-facing?', answer: 'The AAP recommends staying rear-facing as long as possible, up to the seat\'s height/weight limit — often well past age 2 — rather than switching at a specific age. Check your specific seat\'s manual for its limits.' },
  { id: 'q28', category: 'Gear', question: 'How do I know if a crib or car seat is safe / not recalled?', answer: 'Check the model against the CPSC (cpsc.gov) recall database and register your gear with the manufacturer so you\'re notified directly of future recalls.' },

  // ── General ──
  { id: 'q29', category: 'General', question: 'How do I find a good pediatrician?', answer: 'Ask for recommendations from your OB/midwife, check insurance network coverage, and consider scheduling a "meet and greet" visit (often free) before birth to see if their communication style and office culture fit your family.' },
  { id: 'q30', category: 'General', question: 'Is it normal to feel completely overwhelmed as a new parent?', answer: 'Yes — it\'s close to universal, even for confident, prepared parents. Sleep deprivation, hormonal shifts, and an entirely new full-time responsibility overnight would overwhelm almost anyone. Reaching out (to your village, a support group, or a professional) is a strength, not a failure.' },
  { id: 'q31', category: 'General', question: 'How do I involve my partner/co-parent more?', answer: 'Explicit task ownership (not just "helping") tends to work better than open-ended offers — e.g., one parent fully owns bath time or bedtime, rather than asking "what do you need." The Track tab now supports inviting a co-parent as a caregiver so you can both log directly.' },
  { id: 'q32', category: 'General', question: 'When should my baby start daycare or be left with another caregiver?', answer: 'There\'s no medically "right" age — it depends on your family\'s needs, the caregiver\'s experience, and your comfort level. Many families start anywhere from a few weeks to a year old without measurable long-term difference in outcomes tied to timing alone.' },
];
