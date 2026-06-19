import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubpageId =
  | 'tips'
  | 'challenges'
  | 'pumping'
  | 'storage'
  | 'recipes'
  | 'supplements'
  | 'weaning'
  | 'returning_to_work'
  | 'mental_health';

// ─── Subpage data ─────────────────────────────────────────────────────────────

const SUBPAGES = [
  {
    id: 'tips' as SubpageId,
    emoji: '💡',
    title: 'Tips & Tricks',
    description: 'Latch, positions, supply boosters, and everyday breastfeeding wins',
    bg: (c: Colors) => c.cardBlush,
    border: (c: Colors) => c.blush,
  },
  {
    id: 'challenges' as SubpageId,
    emoji: '🩹',
    title: 'Common Challenges',
    description: 'Mastitis, engorgement, low supply, sore nipples — and how to handle them',
    bg: (c: Colors) => c.cardLavender,
    border: (c: Colors) => c.lavender,
  },
  {
    id: 'pumping' as SubpageId,
    emoji: '🍼',
    title: 'Pumping Guide',
    description: 'Flange sizing, schedules, power pumping, and building your stash',
    bg: (c: Colors) => c.cardSage,
    border: (c: Colors) => c.sage,
  },
  {
    id: 'storage' as SubpageId,
    emoji: '🧊',
    title: 'Milk Storage Guide',
    description: 'Safe storage timelines, thawing rules, labeling, and lipase issues',
    bg: (c: Colors) => c.cardBlue,
    border: (c: Colors) => c.blue,
  },
  {
    id: 'recipes' as SubpageId,
    emoji: '🍪',
    title: 'Lactation Recipes',
    description: 'Cookies, smoothies, oats, and snacks to support your supply',
    bg: (c: Colors) => c.cardHoney,
    border: (c: Colors) => c.honey,
  },
  {
    id: 'supplements' as SubpageId,
    emoji: '🌿',
    title: 'Supplement Reviews',
    description: 'Real talk on fenugreek, Legendairy Milk, moringa, brewer\'s yeast, and more',
    bg: (c: Colors) => c.cardBlush,
    border: (c: Colors) => c.blush,
  },
  {
    id: 'weaning' as SubpageId,
    emoji: '🌅',
    title: 'Weaning',
    description: 'Child-led, gradual, or abrupt — how to wean on your timeline without guilt',
    bg: (c: Colors) => c.cardSage,
    border: (c: Colors) => c.sage,
  },
  {
    id: 'returning_to_work' as SubpageId,
    emoji: '💼',
    title: 'Returning to Work',
    description: 'Pump schedules, legal rights, stash prep, and keeping your supply up on the job',
    bg: (c: Colors) => c.cardBlue,
    border: (c: Colors) => c.blue,
  },
  {
    id: 'mental_health' as SubpageId,
    emoji: '💛',
    title: 'Mental Health & Breastfeeding',
    description: 'D-MER, nursing aversion, burnout, guilt, and knowing when it\'s okay to stop',
    bg: (c: Colors) => c.cardLavender,
    border: (c: Colors) => c.lavender,
  },
];

// ─── Content data ─────────────────────────────────────────────────────────────

const TIPS_SECTIONS = [
  {
    title: 'Getting a Good Latch',
    emoji: '👄',
    items: [
      'Aim for a deep latch — baby\'s mouth should cover most of the areola, not just the nipple.',
      'Bring baby TO your breast, not breast to baby. Support your breast with a "C-hold" or "U-hold."',
      'Baby\'s lips should be flanged outward like a fish mouth — check the bottom lip especially.',
      'You should feel a strong tug, not a pinch. Pain after the first 30 seconds usually means a shallow latch.',
      'Break the latch by gently inserting your pinky finger into the corner of baby\'s mouth.',
    ],
  },
  {
    title: 'Nursing Positions',
    emoji: '🤱',
    items: [
      'Cradle hold: baby\'s head in the crook of your arm, tummy to tummy. Great for older babies.',
      'Cross-cradle hold: support baby\'s head with the opposite hand — gives you more latch control for newborns.',
      'Football hold: baby tucked under your arm like a football. Ideal after a C-section and for large breasts.',
      'Side-lying: both lying down facing each other. Perfect for nighttime feeds and recovering from birth.',
      'Laid-back/biological nurturing: recline and let baby lie on your chest. Gravity helps baby latch deeply.',
    ],
  },
  {
    title: 'Boosting Your Supply',
    emoji: '📈',
    items: [
      'Nurse on demand — the more milk you remove, the more your body makes. Aim for 8–12 feeds per day in early weeks.',
      'Offer both breasts each feeding. Start on the fuller side first.',
      'Skin-to-skin contact releases oxytocin and prolactin — do it as much as possible in the first weeks.',
      'Stay hydrated. Aim for at least 16 cups of water a day while breastfeeding.',
      'Eat enough calories — breastfeeding burns 300–500 extra calories daily.',
      'Avoid pacifiers and bottles until breastfeeding is well established (usually 3–4 weeks).',
      'Power pumping (see Pumping Guide) mimics a cluster feed and can kickstart supply.',
    ],
  },
  {
    title: 'Signs of a Good Feed',
    emoji: '✅',
    items: [
      'You can hear baby swallowing — a soft "kuh" or gulping sound.',
      'Baby\'s jaw moves in a wide, rhythmic motion and temples wiggle.',
      'Your breast feels softer after the feeding.',
      'Baby comes off the breast on their own when done.',
      'Plenty of wet and dirty diapers — at least 6 wet diapers a day by day 5.',
      'Baby is gaining weight appropriately (checked at pediatrician visits).',
    ],
  },
  {
    title: 'Night Nursing Tips',
    emoji: '🌙',
    items: [
      'Keep a water bottle and snack at your nursing station every night.',
      'Use a dim red-light nightlight — it\'s least disruptive to both your and baby\'s sleep cycles.',
      'Master side-lying nursing so you can doze while baby feeds.',
      'If safe sleep guidelines are met, a bedside bassinet makes nighttime feeds much easier.',
      'Night feeds are critical in the early weeks for establishing supply — prolactin is highest between 1–5am.',
    ],
  },
];

const CHALLENGES_SECTIONS = [
  {
    title: 'Sore or Cracked Nipples',
    emoji: '😣',
    items: [
      'Usually caused by a shallow latch — fixing the latch is the most important step.',
      'Apply lanolin or coconut oil after each feeding to help heal cracked skin.',
      'Try hydrogel pads between feedings — they soothe and promote healing.',
      'Let nipples air-dry after feeding when possible.',
      'If pain is severe, nipple shields can provide temporary relief while latch improves.',
      'See a lactation consultant if soreness persists beyond the first 2 weeks.',
    ],
  },
  {
    title: 'Engorgement',
    emoji: '🎈',
    items: [
      'Common in days 3–5 when milk "comes in" and often improves on its own.',
      'Nurse or pump frequently — don\'t skip feeds trying to relieve it, that can make it worse.',
      'Apply a warm compress or take a warm shower before feeds to help milk flow.',
      'Use cold cabbage leaves or an ice pack AFTER feeding to reduce swelling.',
      'Reverse pressure softening: press gently around the areola for 60 seconds before latching to push fluid back.',
      'If engorgement lasts more than a few days or you develop a fever, contact your doctor.',
    ],
  },
  {
    title: 'Clogged Ducts',
    emoji: '🔴',
    items: [
      'Feels like a firm, tender lump in the breast — can appear suddenly.',
      'Keep nursing or pumping frequently — removing milk is the best treatment.',
      'Massage the lump toward the nipple during feeds.',
      'Apply warm compresses before feeding and after massage.',
      'Vibration (an electric toothbrush on the back helps) can break up the clog.',
      'Sunflower lecithin supplements can help prevent recurrent clogs — ask your doctor.',
      'If the lump is red, hot, and you have a fever, it may have become mastitis — see your doctor.',
    ],
  },
  {
    title: 'Mastitis',
    emoji: '🌡️',
    items: [
      'Breast infection with symptoms: flu-like aches, fever over 101°F, red/hot area on breast.',
      'Keep breastfeeding or pumping — stopping can worsen the infection.',
      'Contact your doctor promptly — mastitis usually requires antibiotics.',
      'Rest as much as possible and stay hydrated.',
      'Take ibuprofen for pain and fever (safe while breastfeeding).',
      'If a hard, red lump doesn\'t improve with antibiotics after 48–72 hours, it may have become an abscess — return to your doctor.',
    ],
  },
  {
    title: 'Low Milk Supply',
    emoji: '📉',
    items: [
      'True low supply is less common than perceived — check weight gain before assuming.',
      'Nurse more often and make sure latch is effective so breast is fully drained.',
      'Avoid supplementing with formula unless medically necessary — it reduces nursing frequency.',
      'Try power pumping once a day: pump 20 min, rest 10, pump 10, rest 10, pump 10.',
      'Oatmeal, flaxseed, and brewer\'s yeast are popular galactagogues (foods that may support supply).',
      'Certain medications like pseudoephedrine (Sudafed) can reduce supply — check with your doctor.',
      'Consider seeing a lactation consultant (IBCLC) for a personalized plan.',
    ],
  },
  {
    title: 'Tongue Tie & Lip Tie',
    emoji: '👅',
    items: [
      'A tight frenulum can restrict tongue movement and make latching difficult.',
      'Signs: pain with every latch, clicking sound while nursing, poor weight gain, gassy baby.',
      'Ask your pediatrician or a lactation consultant to assess.',
      'A frenotomy (quick snip) can often dramatically improve feeding — usually done in-office.',
      'Post-procedure, gentle stretching exercises help prevent reattachment.',
    ],
  },
  {
    title: 'Nursing Strike',
    emoji: '🚫',
    items: [
      'Baby suddenly refuses the breast — this is NOT weaning. Babies rarely self-wean before 12 months.',
      'Common causes: teething, ear infection, congestion, change in smell (new soap/perfume), stress.',
      'Keep offering the breast calmly — don\'t force it.',
      'Try nursing when baby is sleepy, in a dark quiet room, or in a warm bath.',
      'Pump to maintain supply during the strike.',
      'Strikes usually resolve within a few days to a week.',
    ],
  },
];

const PUMPING_SECTIONS = [
  {
    title: 'Flange Sizing',
    emoji: '📐',
    items: [
      'Correct flange fit is the most important factor for comfortable, efficient pumping.',
      'Your nipple should move freely in the tunnel with 1–3mm of space around it — no rubbing.',
      'Most pumps come with 24mm flanges, but many people need 19, 21, or 28mm.',
      'Measure your nipple diameter (not areola) at its widest point and add 2–3mm.',
      'Signs of wrong size: nipple rubbing tunnel walls (too small), areola being pulled in (too large), pain, or low output.',
      'Pumpin\' Pals angled inserts and Maymom flanges are popular affordable alternatives.',
      'Silicone inserts (like Legendairy\'s Pumpin\' Pals) can reduce the size of standard flanges without buying new parts.',
    ],
  },
  {
    title: 'When to Start Pumping',
    emoji: '📅',
    items: [
      'If breastfeeding is going well, wait 3–4 weeks before introducing the pump to avoid oversupply.',
      'If you\'re returning to work in 6–8 weeks, start pumping once daily after morning feed around week 3–4.',
      'If baby is in the NICU or can\'t nurse, start pumping within 1–2 hours of birth and pump every 2–3 hours.',
      'For preemies, hand expression first followed by pumping is often recommended.',
    ],
  },
  {
    title: 'Building a Freezer Stash',
    emoji: '🧊',
    items: [
      'Pump once a day after your first morning feed (when supply is highest) to build a stash.',
      'Even 1–2oz per session adds up over weeks.',
      'Freeze in 2–4oz portions to minimize waste when thawing.',
      'Use the oldest milk first (FIFO — first in, first out).',
      'A modest stash of 50–100oz is plenty for most return-to-work scenarios.',
    ],
  },
  {
    title: 'Pumping at Work',
    emoji: '💼',
    items: [
      'In the US, federal law (PUMP Act) requires employers to provide reasonable break time and a private space (not a bathroom) for pumping.',
      'Pump at the same intervals baby would normally feed — typically every 2–3 hours.',
      'A hands-free pumping bra is a must for multitasking at work.',
      'Wearable pumps (Elvie, Willow, Momcozy) allow you to pump discreetly during meetings.',
      'Store pump parts in the fridge between sessions instead of washing every time — this is CDC-approved and saves huge amounts of time.',
      'Pack an insulated bag with ice packs to transport milk home safely.',
    ],
  },
  {
    title: 'Power Pumping',
    emoji: '⚡',
    items: [
      'Power pumping mimics cluster feeding to signal your body to make more milk.',
      'Schedule: pump 20 min → rest 10 min → pump 10 min → rest 10 min → pump 10 min (1 hour total).',
      'Do this once a day in place of a regular session for 3–7 days to see results.',
      'Best done in the morning when prolactin is highest.',
      'Don\'t expect to see big output during the power pump itself — the boost comes 2–3 days later.',
    ],
  },
  {
    title: 'Output Expectations',
    emoji: '📊',
    items: [
      'Average pumping output is 0.5–2oz per session per breast — this does NOT reflect your actual supply.',
      'Babies are more efficient than pumps. Low pump output ≠ low milk supply.',
      'Output tends to peak around 3–4 months then plateau.',
      'If pumping for a full-time bottle-fed baby, aim for 25–35oz per day.',
      'Stress, dehydration, and being away from baby can all temporarily reduce output.',
    ],
  },
];

const STORAGE_SECTIONS = [
  {
    title: 'Storage Timelines',
    emoji: '⏱️',
    items: [
      'Room temperature (up to 77°F): 4 hours is ideal, up to 6–8 hours is acceptable.',
      'Refrigerator (39°F or colder): up to 4 days is best, up to 8 days is acceptable if very clean.',
      'Freezer (0°F): 6 months is ideal, up to 12 months is acceptable.',
      'Deep freezer: up to 12 months.',
      'Previously frozen, thawed in fridge: use within 24 hours. Never refreeze.',
      'Thawed at room temp or warmed: use within 2 hours.',
    ],
  },
  {
    title: 'Labeling Your Milk',
    emoji: '🏷️',
    items: [
      'Always label bags with the date AND time pumped.',
      'Write directly on the storage bag with a permanent marker — tape can fall off in the freezer.',
      'Include ounces so you know exactly what you have.',
      'Use the oldest milk first — organize your fridge/freezer with oldest in front.',
      'If sending to daycare, add baby\'s name to each bag.',
    ],
  },
  {
    title: 'Storage Tips',
    emoji: '💡',
    items: [
      'Store milk in the back of the fridge/freezer where temperature is most stable, not the door.',
      'Freeze milk flat in storage bags, then store upright like files to save space.',
      'Leave room at the top of storage bags — milk expands when frozen.',
      'Small portions (2–3oz) reduce waste when thawing.',
      'Medela, Lansinoh, and Kiinde are popular storage bag brands. Make sure bags are BPA-free.',
    ],
  },
  {
    title: 'Thawing & Warming',
    emoji: '🌡️',
    items: [
      'Safest method: move to fridge the night before and let thaw overnight.',
      'Faster method: hold bag under warm running water or place in a bowl of warm water.',
      'Never microwave breast milk — it destroys nutrients and creates hot spots.',
      'Gently swirl (don\'t shake) warmed milk to mix the fat that separates on top.',
      'Taste and smell the milk before feeding — it should smell sweet and milky.',
    ],
  },
  {
    title: 'Lipase Issues',
    emoji: '🧬',
    items: [
      'Lipase is an enzyme that breaks down fat — some people have high lipase, which makes stored milk smell or taste soapy/metallic.',
      'Babies often refuse high-lipase milk even when it\'s perfectly safe.',
      'To test: pump and refrigerate for 24 hours, then smell it. Soapy smell = high lipase.',
      'Solution: scald milk before freezing. Heat milk in a pan to 180°F (just until bubbles form around the edges), cool, then freeze.',
      'Freshly expressed milk is always fine — high lipase only affects stored milk.',
    ],
  },
];

const RECIPE_SECTIONS = [
  {
    title: 'Lactation Cookies',
    emoji: '🍪',
    items: [
      '2 cups rolled oats (not instant)',
      '1 cup whole wheat or all-purpose flour',
      '3 tbsp brewer\'s yeast',
      '3 tbsp ground flaxseed',
      '1/2 cup butter, softened',
      '3/4 cup brown sugar',
      '2 eggs',
      '1 tsp vanilla',
      '1/2 tsp baking soda',
      '1/2 tsp salt',
      '1 cup chocolate chips',
      'Mix wet and dry separately, combine, roll into balls, bake at 350°F for 10–12 min. Makes ~24 cookies.',
    ],
  },
  {
    title: 'Lactation Smoothie',
    emoji: '🥤',
    items: [
      '1 cup oat milk or regular milk',
      '1/2 banana, frozen',
      '1/2 cup rolled oats (or oat flour)',
      '1 tbsp ground flaxseed',
      '1 tbsp brewer\'s yeast',
      '1 tbsp almond butter',
      '1 tbsp honey or maple syrup',
      'Handful of spinach (optional — you won\'t taste it)',
      'Blend until smooth. Add ice for a thicker texture. Great for busy mornings.',
    ],
  },
  {
    title: 'Overnight Lactation Oats',
    emoji: '🌾',
    items: [
      '1/2 cup rolled oats',
      '1 cup milk or oat milk',
      '1 tbsp chia seeds',
      '1 tbsp ground flaxseed',
      '1 tbsp brewer\'s yeast',
      '1 tsp honey',
      '1/4 tsp cinnamon',
      'Stir together in a jar, refrigerate overnight. Top with berries, banana, or almond butter in the morning.',
    ],
  },
  {
    title: 'No-Bake Lactation Balls',
    emoji: '⚽',
    items: [
      '1 cup rolled oats',
      '1/2 cup peanut or almond butter',
      '1/3 cup honey',
      '3 tbsp brewer\'s yeast',
      '2 tbsp ground flaxseed',
      '1/2 cup chocolate chips',
      '1 tsp vanilla',
      'Mix all ingredients together, refrigerate 30 minutes, then roll into 1-inch balls. Store in fridge for up to a week.',
    ],
  },
  {
    title: 'Flaxseed Banana Muffins',
    emoji: '🫐',
    items: [
      '3 ripe bananas, mashed',
      '1/3 cup melted butter or coconut oil',
      '1/2 cup sugar or honey',
      '1 egg',
      '1 tsp vanilla',
      '1 tsp baking soda',
      '1/4 tsp salt',
      '1 1/2 cups flour',
      '3 tbsp ground flaxseed',
      '2 tbsp brewer\'s yeast (optional)',
      'Combine wet and dry, pour into muffin tin, bake at 350°F for 20–25 minutes. Makes 12 muffins.',
    ],
  },
  {
    title: 'Key Galactagogue Ingredients',
    emoji: '🌟',
    items: [
      'Oats: one of the most popular milk-boosting foods. Rich in iron and beta-glucan.',
      'Flaxseed: high in phytoestrogens and omega-3s. Use ground for absorption.',
      'Brewer\'s yeast: rich in B vitamins, iron, and protein. Has a bitter, yeasty taste — blend into smoothies or bake into goods.',
      'Fennel: can be eaten raw, roasted, or as fennel tea.',
      'Fenugreek: most commonly taken as a supplement, but seeds can be added to cooking.',
      'Dark leafy greens: spinach, kale, and arugula are high in calcium and phytoestrogens.',
      'Almonds: high in healthy fat and calcium, great as a snack or in smoothies.',
    ],
  },
];

const SUPPLEMENT_SECTIONS = [
  {
    title: 'Fenugreek',
    emoji: '🌱',
    items: [
      'One of the most commonly used galactagogues — used for centuries across cultures.',
      'Many people report increased supply within 24–72 hours of starting.',
      'Typical dose: 3 capsules (610mg each) three times a day with meals.',
      'Side effects: can make your sweat and urine smell like maple syrup (harmless), GI upset in some, and may make baby gassy.',
      'Important: fenugreek can DECREASE supply in some people — if you don\'t see improvement in a week, stop.',
      'Avoid if you have diabetes, thyroid issues, or nut allergies (it\'s in the legume family).',
    ],
  },
  {
    title: 'Blessed Thistle',
    emoji: '🌸',
    items: [
      'Often taken alongside fenugreek for a combined effect.',
      'Typical dose: 3 capsules (350mg each) three times a day.',
      'Milder than fenugreek with fewer side effects.',
      'Some herbalists recommend taking blessed thistle and fenugreek together rather than either alone.',
      'Not well-studied — evidence is mostly anecdotal.',
    ],
  },
  {
    title: 'Legendairy Milk Products',
    emoji: '🐄',
    items: [
      'A popular supplement brand specifically for breastfeeding — many moms swear by them.',
      'Liquid Gold: fenugreek-free blend of goat\'s rue, moringa, shatavari, and more.',
      'Lechita: goat\'s rue-based formula, popular for induced lactation and low supply.',
      'Pump Princess: targeted for pumping moms.',
      'Cash Cow: their original formula including fenugreek.',
      'Cons: expensive ($30–45/bottle), not FDA-evaluated, results vary widely.',
      'Many moms on r/breastfeeding report good results — try one product at a time to identify what helps.',
    ],
  },
  {
    title: 'Moringa',
    emoji: '🌿',
    items: [
      'A nutrient-dense plant used as a galactagogue in Southeast Asia and India for generations.',
      'Growing popularity in the US — often found in Legendairy Milk products and standalone capsules.',
      'Generally considered safer than fenugreek with fewer side effects.',
      'Available as capsules, powder (blend into smoothies), or tea.',
      'Typical dose: 350–500mg capsules 1–2 times a day.',
      'Some early research supports its use for increasing milk volume.',
    ],
  },
  {
    title: 'Brewer\'s Yeast',
    emoji: '🍺',
    items: [
      'A nutritional supplement (not active baker\'s yeast) rich in B vitamins, iron, selenium, and chromium.',
      'Frequently used in lactation cookies and smoothies.',
      'Also reported to boost energy levels — helpful for sleep-deprived moms.',
      'Available as powder, flakes, or capsules. Powder is most versatile for baking.',
      'Has a strong, bitter, yeasty flavor — best masked in sweet recipes.',
      'Generally considered very safe. May cause gas in some people and babies.',
    ],
  },
  {
    title: 'Sunflower Lecithin',
    emoji: '🌻',
    items: [
      'Not a supply booster — primarily used to prevent and treat recurring clogged ducts.',
      'Makes milk less "sticky" so fat globules don\'t clump and clog.',
      'Typical dose: 1200mg 3–4 times per day until clogs resolve, then once daily for prevention.',
      'Preferred over soy lecithin for those avoiding soy.',
      'Very well-tolerated with minimal side effects.',
      'Many moms with chronic clogs report this as a game-changer.',
    ],
  },
  {
    title: 'Nursing Teas',
    emoji: '☕',
    items: [
      'Popular brands: Earth Mama Milkmaid Tea, Traditional Medicinals Mother\'s Milk, Pink Stork.',
      'Common ingredients: fenugreek, fennel, blessed thistle, red raspberry leaf, nettle.',
      'Evidence is largely anecdotal, but staying hydrated (from the tea itself) definitely helps supply.',
      'Drink 2–3 cups per day for best results.',
      'Avoid "detox" or "cleanse" teas — some contain laxative herbs unsafe for nursing.',
      'Check all tea ingredient labels against LactMed (free app/website) to confirm safety.',
    ],
  },
  {
    title: 'A Note on Supplements',
    emoji: '⚠️',
    items: [
      'Supplements are not regulated by the FDA for safety or efficacy.',
      'Always check LactMed (NIH database) or InfantRisk before starting any supplement.',
      'Introduce one supplement at a time so you know what\'s working.',
      'If supply issues are significant, an IBCLC (certified lactation consultant) is the most effective investment.',
      'Insurance is required to cover lactation support under the ACA — check your plan.',
    ],
  },
];

const WEANING_SECTIONS = [
  {
    title: 'Signs Baby May Be Ready',
    emoji: '🔍',
    items: [
      'Showing less interest in nursing — pulling off quickly, getting distracted, or skipping sessions.',
      'Eating a wide variety of solid foods and drinking from a cup well (typically 12+ months).',
      'Able to be comforted in other ways (cuddles, a snack, a distraction).',
      'Nursing sessions getting shorter and less frequent on their own.',
      'Note: true self-weaning before 12 months is rare — early refusals are usually nursing strikes.',
    ],
  },
  {
    title: 'Types of Weaning',
    emoji: '🗺️',
    items: [
      'Child-led weaning: you follow baby\'s cues and let them drop sessions naturally. Can take months to years.',
      'Gradual weaning: you slowly drop one feeding every few days or weeks until done. Gentlest on your body and baby.',
      'Abrupt weaning: stopping suddenly — can cause engorgement, clogged ducts, mastitis, and emotional crash. Only recommended when medically necessary.',
      'Partial weaning: dropping some sessions (like daytime feeds) but keeping others (like bedtime or morning). Works well for working moms.',
    ],
  },
  {
    title: 'How to Start Gradually',
    emoji: '📆',
    items: [
      'Drop the feed baby cares about least first — usually a midday session.',
      'Wait at least 3–7 days between dropping each session to let your body adjust and reduce mastitis risk.',
      'Replace dropped nursing sessions with a cup of milk (if 12+ months), a snack, or extra cuddles.',
      'The bedtime and morning feeds are usually the last to go — they\'re the most comfort-driven.',
      'Distraction and "don\'t offer, don\'t refuse" is a gentle method: offer alternatives but don\'t say no if asked.',
    ],
  },
  {
    title: 'Managing Your Body During Weaning',
    emoji: '🧊',
    items: [
      'Drop sessions slowly to avoid engorgement and clogged ducts.',
      'Hand express or pump just enough for comfort if you feel full — not enough to signal more production.',
      'Cold cabbage leaves inside your bra can help reduce supply and discomfort.',
      'Sage tea, peppermint tea, and pseudoephedrine (Sudafed) are commonly used to help dry up milk — talk to your doctor first.',
      'It can take days to weeks for milk to fully dry up after the last feed.',
    ],
  },
  {
    title: 'Weaning a Toddler',
    emoji: '🧸',
    items: [
      'Toddlers are more verbal and may have strong feelings about weaning — that\'s normal.',
      'Set gentle limits: "We only nurse at bedtime" or "only at home." Consistency matters.',
      'Give them language for their feelings: "I know you\'re sad, you really like nursing."',
      'Offer lots of connection in other ways — extra snuggles, special one-on-one time.',
      'Pick a calm time to wean — not during illness, a move, a new sibling, or big transitions.',
    ],
  },
  {
    title: 'Weaning While Pregnant',
    emoji: '🤰',
    items: [
      'Milk supply often drops in the first trimester due to hormonal changes — baby may self-wean naturally.',
      'Nursing while pregnant is generally safe for low-risk pregnancies.',
      'Nipple soreness often increases significantly in pregnancy.',
      'Some moms tandem nurse (nursing both newborn and toddler) — it\'s demanding but doable with support.',
      'Check with your OB if you have a history of preterm labor — nipple stimulation can trigger contractions.',
    ],
  },
  {
    title: 'The Emotional Side of Weaning',
    emoji: '💙',
    items: [
      'It\'s normal to feel sad, relieved, or both — weaning marks the end of a significant chapter.',
      'Hormonal shifts after weaning (especially estrogen returning) can cause mood dips, anxiety, or temporary depression.',
      'If you feel persistently low after weaning, talk to your doctor — it\'s a recognized phenomenon.',
      'There is no "right" time to wean. Nursing for any length of time is valuable.',
      'You don\'t owe anyone an explanation for when or how you wean.',
    ],
  },
];

const RETURNING_TO_WORK_SECTIONS = [
  {
    title: 'Preparing Before You Go Back',
    emoji: '📋',
    items: [
      'Start building a small freezer stash about 3–4 weeks before your return date.',
      'Pump once a day after your morning feed — even 1–2oz per session adds up.',
      'A stash of 30–60oz is enough to start — you don\'t need hundreds of ounces.',
      'Practice bottle feeding 2–3 weeks before returning so baby adapts (have someone else offer it — they often refuse bottles from the nursing parent).',
      'Do a trial run at your workplace to test your pump setup, storage, and schedule.',
    ],
  },
  {
    title: 'Your Legal Rights',
    emoji: '⚖️',
    items: [
      'The PUMP Act (2022) extends federal pumping rights to almost all employees, including salaried and exempt workers.',
      'Employers must provide reasonable break time to pump for up to 1 year after birth.',
      'The space must be private and NOT a bathroom.',
      'Employers with fewer than 50 employees may be exempt if they can prove undue hardship — but most can\'t.',
      'Many states have additional protections that go beyond federal law — check your state\'s labor laws.',
      'If your employer refuses accommodations, contact the Department of Labor or an employment attorney.',
    ],
  },
  {
    title: 'Setting Up Your Pump Schedule',
    emoji: '⏰',
    items: [
      'Pump at the same intervals baby would normally feed — typically every 2.5–3 hours.',
      'For most people returning full-time, that means 2–3 pump sessions during an 8-hour workday.',
      'Block pump times on your calendar as recurring meetings — treat them as non-negotiable.',
      'Try to pump around the same time each day to keep your body on a schedule.',
      'Missing sessions regularly will reduce supply over time — consistency is key.',
    ],
  },
  {
    title: 'What to Pack',
    emoji: '🎒',
    items: [
      'Pump + all parts (flanges, valves, membranes, tubing, power cord)',
      'Hands-free pumping bra',
      'Storage bags or bottles labeled with baby\'s name and date',
      'Insulated bag with ice packs for transporting milk home',
      'Spare shirt or nursing pads in case of leaks',
      'Snacks and a large water bottle — you\'ll be hungry and thirsty',
      'A photo or video of baby on your phone — looking at baby while pumping boosts letdown',
    ],
  },
  {
    title: 'Wearable & Hands-Free Pumps',
    emoji: '🔋',
    items: [
      'Wearable pumps (Elvie, Willow, Momcozy S12/S21, Bellababy) fit inside your bra and require no cords.',
      'Great for pumping during meetings, commutes, or busy workdays.',
      'Generally less efficient than hospital-grade pumps — best as a supplement, not a sole pump.',
      'Flanges still need to be sized correctly — most wearables come with limited sizes.',
      'Check if your insurance covers a wearable — many do under the ACA breast pump benefit.',
    ],
  },
  {
    title: 'Saving Time at Work',
    emoji: '⚡',
    items: [
      'Store pump parts in the fridge between sessions instead of washing every time — CDC-approved and saves 10+ minutes a day.',
      'Use Quick Clean wipes or Medela steam bags if you prefer cleaning but don\'t have a sink.',
      'A pumping bra that doubles as a regular bra means less changing.',
      'Pre-label storage bags at home the night before.',
      'Some moms connect pump bags directly to the flange to skip transferring to a separate bag.',
    ],
  },
  {
    title: 'Keeping Your Supply Up',
    emoji: '📈',
    items: [
      'Nurse as much as possible when home — mornings, evenings, and all weekend.',
      'Skin-to-skin and baby cuddles on non-work days help maintain supply signals.',
      'Stay hydrated and eat enough throughout your workday.',
      'If output drops, add a pump session or try power pumping once a day for a week.',
      'Some supply dip when returning to work is normal — most moms stabilize within a few weeks.',
      'Stress and being away from baby can temporarily reduce letdown — a photo, video, or worn item from baby can help trigger it.',
    ],
  },
  {
    title: 'Talking to Your Employer',
    emoji: '🗣️',
    items: [
      'You don\'t have to disclose personal medical details — simply say you need a private space to express milk.',
      'Put your accommodation request in writing so there\'s a record.',
      'HR is generally the right starting point — many managers aren\'t aware of the legal requirements.',
      'If you face pushback, cite the PUMP Act specifically.',
      'Most workplaces are cooperative once they understand their obligations.',
    ],
  },
];

const MENTAL_HEALTH_SECTIONS = [
  {
    title: 'D-MER (Dysphoric Milk Ejection Reflex)',
    emoji: '😔',
    items: [
      'D-MER is a sudden wave of negative emotion — sadness, dread, anxiety, or homesickness — that occurs just before or during letdown.',
      'It lasts only 30–90 seconds and disappears once milk starts flowing.',
      'It\'s neurological, not psychological — caused by a brief drop in dopamine during letdown.',
      'It is NOT postpartum depression and does NOT mean you don\'t love your baby.',
      'Mild D-MER often improves after the first few months as hormones stabilize.',
      'Severe D-MER can be treated — talk to your doctor. Some find relief with dietary changes; others need medication.',
      'Resources: d-mer.org has the most comprehensive information available.',
    ],
  },
  {
    title: 'Nursing Aversion',
    emoji: '😣',
    items: [
      'Nursing aversion is a feeling of irritability, anger, crawling skin, or intense discomfort during nursing — even when you want to breastfeed.',
      'More common during pregnancy, around ovulation, or when nursing a toddler.',
      'Often hormone-driven — particularly when menstruation returns or during pregnancy.',
      'It doesn\'t mean you\'re a bad mom or that something is wrong with your bond.',
      'Coping strategies: deep breathing, counting to 10, setting time limits on sessions, distracting yourself with your phone or TV.',
      'Increasing your own physical space and touch autonomy outside of nursing can help.',
      'If aversion is causing you to dread every feed, it may be time to consider weaning or reducing sessions.',
    ],
  },
  {
    title: 'Breastfeeding Grief & Guilt',
    emoji: '💔',
    items: [
      'Grief over breastfeeding is real — whether you had to stop earlier than planned, couldn\'t start, or are struggling to continue.',
      'Low supply, latch issues, tongue tie, returning to work, NICU stays, and postpartum illness can all derail breastfeeding plans.',
      'The pain of not meeting your own breastfeeding goals is valid and deserves acknowledgment.',
      'Fed is genuinely best — a baby thriving on formula is a healthy baby.',
      'Guilt is often tied to an idealized image of breastfeeding that doesn\'t match reality for most people.',
      'If you\'re struggling, talk to a lactation consultant BEFORE deciding to stop — many "unfixable" issues have solutions.',
      'And if you decide to stop: you made the right choice for your family. Full stop.',
    ],
  },
  {
    title: 'Postpartum Depression & Breastfeeding',
    emoji: '🌧️',
    items: [
      'PPD affects 1 in 5 new moms and can make breastfeeding feel impossible.',
      'Sleep deprivation from frequent nursing can worsen depressive symptoms — your mental health matters too.',
      'Most antidepressants (especially SSRIs like sertraline and paroxetine) are considered safe during breastfeeding — check LactMed or ask your doctor.',
      'Treating PPD often makes breastfeeding easier, not harder.',
      'You do not have to choose between your mental health and breastfeeding — but if you do, your mental health comes first.',
      'Postpartum Support International (PSI) helpline: 1-800-944-4773. They can help you find local support.',
    ],
  },
  {
    title: 'Breastfeeding Burnout',
    emoji: '🔥',
    items: [
      'Breastfeeding burnout is real — feeling touched out, exhausted, resentful, or trapped is common.',
      'Being the only person who can feed baby is physically and emotionally draining.',
      'Signs: dreading every feed, feeling angry when baby asks to nurse, counting down to when you can stop.',
      'It doesn\'t mean you\'re failing — it means you\'ve been doing an enormous amount for a long time.',
      'Strategies: introduce a bottle so others can occasionally feed, set nursing boundaries, add more formula if supply allows, or begin gradual weaning.',
      'Burnout that persists may be a sign it\'s time to wean, and that is a completely valid choice.',
    ],
  },
  {
    title: 'Knowing When It\'s Okay to Stop',
    emoji: '🕊️',
    items: [
      'Any amount of breastfeeding — one day, one week, one month — provides real benefits. You don\'t have to reach any particular milestone.',
      'The WHO recommends breastfeeding to 2 years, but that is a guideline for populations, not a mandate for individuals.',
      'If breastfeeding is damaging your mental health, your relationship, or your ability to function, stopping is the right choice.',
      'A calm, bonded, formula-fed baby thrives. A depleted, suffering mother cannot pour from an empty cup.',
      'No one has the right to judge when you stop. Not family, not strangers on the internet, not anyone.',
      'Give yourself the same compassion you\'d give a friend in your exact situation.',
    ],
  },
  {
    title: 'Building Your Support System',
    emoji: '🤝',
    items: [
      'La Leche League offers free peer support meetings (in-person and online) — llli.org to find a group.',
      'Postpartum Support International (PSI): postpartum.net — online support groups, a helpline, and provider directory.',
      'Your OB or midwife can refer you to a therapist who specializes in perinatal mental health.',
      'IBCLCs (certified lactation consultants) are covered by most insurance under the ACA.',
      'Online communities like r/breastfeeding and r/NewParents can be a source of non-judgmental peer support.',
      'Tell your partner or a trusted person how you\'re feeling — breastfeeding struggles are often invisible to those around you.',
    ],
  },
];

// ─── Subpage component ────────────────────────────────────────────────────────

function SubpageSections({
  sections,
}: {
  sections: { title: string; emoji: string; items: string[] }[];
}) {
  const c = useColors();
  const s = subpageStyles(c);
  return (
    <>
      {sections.map((section, i) => (
        <View key={i} style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionEmoji}>{section.emoji}</Text>
            <Text style={s.sectionTitle}>{section.title}</Text>
          </View>
          <View style={s.sectionBody}>
            {section.items.map((item, j) => (
              <View key={j} style={s.bulletRow}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

function Subpage({
  id,
  onBack,
}: {
  id: SubpageId;
  onBack: () => void;
}) {
  const c = useColors();
  const s = subpageStyles(c);
  const meta = SUBPAGES.find(p => p.id === id)!;

  const sectionMap: Record<SubpageId, { title: string; emoji: string; items: string[] }[]> = {
    tips: TIPS_SECTIONS,
    challenges: CHALLENGES_SECTIONS,
    pumping: PUMPING_SECTIONS,
    storage: STORAGE_SECTIONS,
    recipes: RECIPE_SECTIONS,
    supplements: SUPPLEMENT_SECTIONS,
    weaning: WEANING_SECTIONS,
    returning_to_work: RETURNING_TO_WORK_SECTIONS,
    mental_health: MENTAL_HEALTH_SECTIONS,
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={onBack}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Breastfeeding 101</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={[s.hero, { backgroundColor: meta.bg(c), borderColor: meta.border(c) }]}>
          <Text style={s.heroEmoji}>{meta.emoji}</Text>
          <Text style={s.heroTitle}>{meta.title}</Text>
          <Text style={s.heroDesc}>{meta.description}</Text>
        </View>

        <SubpageSections sections={sectionMap[id]} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Hub screen ───────────────────────────────────────────────────────────────

export default function Breastfeeding101({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const s = hubStyles(c);
  const [active, setActive] = useState<SubpageId | null>(null);

  if (active) {
    return <Subpage id={active} onBack={() => setActive(null)} />;
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={onBack}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.heroSection}>
          <Text style={s.heroEmoji}>🤱</Text>
          <Text style={s.heroTitle}>Breastfeeding 101</Text>
          <Text style={s.heroSubtitle}>
            Everything you need to feel confident — from first latch to pumping at work and everything in between.
          </Text>
        </View>

        <View style={s.cards}>
          {SUBPAGES.map(page => (
            <TouchableOpacity
              key={page.id}
              activeOpacity={0.8}
              style={[s.card, { backgroundColor: page.bg(c), borderColor: page.border(c) }]}
              onPress={() => setActive(page.id)}
            >
              <Text style={s.cardEmoji}>{page.emoji}</Text>
              <View style={s.cardText}>
                <Text style={s.cardTitle}>{page.title}</Text>
                <Text style={s.cardDesc}>{page.description}</Text>
              </View>
              <Text style={s.cardChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            This content is for informational purposes only and not a substitute for professional medical advice. Always consult your doctor or a certified lactation consultant (IBCLC) for personalized guidance.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const hubStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    scroll: { padding: 20, paddingBottom: 40 },
    heroSection: {
      alignItems: 'center',
      marginBottom: 28,
      gap: 8,
    },
    heroEmoji: { fontSize: 52 },
    heroTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
    },
    heroSubtitle: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
    cards: { gap: 12 },
    card: {
      borderRadius: 16,
      borderWidth: 2,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    cardEmoji: { fontSize: 32 },
    cardText: { flex: 1 },
    cardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 3,
    },
    cardDesc: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: '500',
      lineHeight: 18,
    },
    cardChevron: { fontSize: 24, color: c.textMuted, fontWeight: '700' },
    disclaimer: {
      marginTop: 28,
      padding: 16,
      backgroundColor: c.card,
      borderRadius: 12,
    },
    disclaimerText: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: '500',
      lineHeight: 18,
      textAlign: 'center',
    },
  });

const subpageStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    scroll: { padding: 20, paddingBottom: 40, gap: 16 },
    hero: {
      borderRadius: 20,
      borderWidth: 2,
      padding: 24,
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    heroEmoji: { fontSize: 44 },
    heroTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
    },
    heroDesc: {
      fontSize: 14,
      color: c.textSecondary,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
    section: {
      backgroundColor: c.card,
      borderRadius: 16,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    sectionEmoji: { fontSize: 22 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: c.textPrimary,
      flex: 1,
    },
    sectionBody: { padding: 16, gap: 10 },
    bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bullet: {
      fontSize: 14,
      color: c.primary,
      fontWeight: '800',
      marginTop: 1,
    },
    bulletText: {
      flex: 1,
      fontSize: 14,
      color: c.textSecondary,
      fontWeight: '500',
      lineHeight: 20,
    },
  });
