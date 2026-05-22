import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  SectionList,
  Alert,
} from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryId =
  | 'sleep'
  | 'feeding'
  | 'breastfeeding'
  | 'parenting'
  | 'development'
  | 'health'
  | 'mentalhealth'
  | 'milestones';

type Term = {
  id: string;
  term: string;
  category: CategoryId;
  short: string;
  long: string;
};

type ViewMode = 'az' | 'topic';

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES: { id: CategoryId | 'all'; label: string; emoji: string }[] = [
  { id: 'all',          label: 'All',              emoji: '📚' },
  { id: 'sleep',        label: 'Sleep',             emoji: '😴' },
  { id: 'feeding',      label: 'Feeding',           emoji: '🍼' },
  { id: 'breastfeeding',label: 'Breastfeeding',     emoji: '🤱' },
  { id: 'parenting',    label: 'Parenting Styles',  emoji: '👨‍👩‍👧' },
  { id: 'development',  label: 'Development',       emoji: '🧠' },
  { id: 'health',       label: 'Health',            emoji: '🏥' },
  { id: 'mentalhealth', label: 'Mental Health',     emoji: '💛' },
  { id: 'milestones',   label: 'Milestones',        emoji: '🎯' },
];

// ─── Terms ────────────────────────────────────────────────────────────────────

const TERMS: Term[] = [
  // SLEEP
  { id: 'ferber', term: 'Ferber Method', category: 'sleep',
    short: 'A graduated check-in sleep training method that teaches babies to self-soothe.',
    long: 'Developed by Dr. Richard Ferber, this method involves putting your baby down awake and leaving for progressively longer intervals before briefly checking in — without picking them up. The goal is to help babies learn to fall asleep independently. Check-in intervals typically start at 3 minutes and increase each night. Generally recommended for babies 6 months and older. Most families see results in 3–7 days.' },

  { id: 'cio', term: 'Cry It Out (CIO)', category: 'sleep',
    short: 'A sleep training method where a baby is allowed to cry until they fall asleep without parental intervention.',
    long: 'Also called the "extinction method," CIO involves putting your baby down awake and not returning until morning (or the next feed). Unlike the Ferber method, there are no check-ins. Research suggests it\'s safe and effective for babies 6 months+, with no evidence of lasting emotional harm. It\'s one of the fastest methods but can be emotionally difficult for parents. Crying typically reduces significantly by nights 3–5.' },

  { id: 'no_cry', term: 'No-Cry Sleep Solution', category: 'sleep',
    short: 'A gentle sleep approach focused on gradual changes without leaving a baby to cry.',
    long: 'Coined by Elizabeth Pantley, this approach slowly shifts sleep associations using a "pull-off" technique during nursing, consistent routines, and gentle replacement of sleep crutches. Progress is slower than cry-based methods (weeks vs. days) but many parents prefer the gentleness. Works best for consistent, patient caregivers.' },

  { id: 'dream_feed', term: 'Dream Feed', category: 'sleep',
    short: 'A late-night feed (usually 10–11 PM) given while the baby is still asleep to extend overnight sleep.',
    long: 'You gently rouse your sleeping baby to feed before you go to bed, without fully waking them. The idea is that topping off their tank delays the next hunger wake-up, giving you a longer stretch of sleep. It tends to work best between 6–12 weeks. Many parents phase it out around 4–6 months once the baby can naturally sleep longer stretches.' },

  { id: 'wake_windows', term: 'Wake Windows', category: 'sleep',
    short: 'The amount of time a baby can comfortably stay awake between sleep periods.',
    long: 'Wake windows are one of the most important factors in nap and bedtime success. Putting a baby down too early (undertired) or too late (overtired) both make falling and staying asleep harder. General ranges: newborns 45–60 min, 2 months 1–1.5 hrs, 4 months 1.5–2 hrs, 6 months 2–3 hrs, 9 months 3–4 hrs, 12 months 3.5–4.5 hrs. Watch sleepy cues — every baby is different.' },

  { id: 'contact_nap', term: 'Contact Napping', category: 'sleep',
    short: 'When a baby sleeps on or against a caregiver rather than in a crib.',
    long: 'Contact napping is common and developmentally normal, especially in the newborn phase. It leverages the calming effect of a caregiver\'s heartbeat, warmth, and scent. If it works for your family, there\'s no harm in it. To transition away, try waiting until baby is in deep sleep before transferring, or use a warm surface. Formal sleep training is generally more effective after 4 months.' },

  { id: 'safe_sleep', term: 'Safe Sleep (ABCs)', category: 'sleep',
    short: 'Guidelines to reduce the risk of SIDS and sleep-related infant deaths.',
    long: 'The ABCs of Safe Sleep: Alone (no bedsharing), Back (always on their back), Crib (firm, flat surface — no pillows, bumpers, or loose bedding). Additional guidelines: comfortable room temperature, a pacifier, a sleep sack instead of blankets, and a smoke-free sleep space. The AAP recommends room-sharing (not bed-sharing) for at least the first 6 months.' },

  { id: 'bedsharing', term: 'Bedsharing / Co-sleeping', category: 'sleep',
    short: 'Sleeping in the same bed or room as your baby.',
    long: '"Bedsharing" means the same bed; "co-sleeping" can mean either the same bed or the same room. The AAP advises against bedsharing due to suffocation risks, but many families practice it with harm-reduction guidelines (La Leche League\'s Safe Sleep Seven). Room-sharing (baby in a bassinet nearby) is AAP-recommended and associated with reduced SIDS risk.' },

  { id: 'sleep_regression', term: 'Sleep Regression', category: 'sleep',
    short: 'A period when a baby who was sleeping well suddenly sleeps poorly.',
    long: 'Sleep regressions typically coincide with developmental leaps, growth spurts, or changes in sleep cycle maturation. Common regressions occur around 4 months, 8–10 months, 12 months, 18 months, and 2 years. The 4-month regression is the most significant because it\'s a permanent change in sleep architecture. Regressions usually last 2–6 weeks. Staying consistent with routines and offering extra comfort is the best approach.' },

  { id: 'overtiredness', term: 'Overtiredness', category: 'sleep',
    short: 'When a baby has been awake too long and becomes harder to settle due to stress hormones.',
    long: 'When babies miss their sleep window, cortisol and adrenaline kick in — making them wired, fussy, and paradoxically harder to put down. Signs include rubbing eyes, pulling ears, staring blankly, or a "second wind" of energy. Overtired babies often wake more at night and take shorter naps. Preventing overtiredness by respecting wake windows is one of the highest-impact sleep skills.' },

  { id: 'drowsy_awake', term: 'Drowsy But Awake', category: 'sleep',
    short: 'Putting a baby down for sleep while still partially awake so they learn to fall asleep on their own.',
    long: 'If a baby always falls asleep while nursing, rocking, or being held, they\'ll expect that same condition when they wake between sleep cycles. Putting them down "drowsy but awake" teaches independent sleep onset. It\'s harder with newborns and more achievable after 3–4 months. It doesn\'t require formal sleep training — just gradually shifting the timing of when you transfer them.' },

  { id: 'white_noise', term: 'White Noise', category: 'sleep',
    short: 'Consistent background sound used to help babies sleep by masking household noises.',
    long: 'White noise mimics the sounds of the womb and can calm babies and extend sleep by masking sudden sounds (doors, siblings, traffic). Safe use: keep the machine at least 7 feet from the baby at no louder than 50 dB (about the level of a quiet shower). Pink noise and brown noise are softer alternatives some families prefer.' },

  // FEEDING
  { id: 'blw', term: 'Baby Led Weaning (BLW)', category: 'feeding',
    short: 'Skipping purees and starting solids with soft finger foods, letting baby self-feed from the start.',
    long: 'Popularized by Gill Rapley, BLW means offering appropriately sized soft foods and letting babies bring them to their own mouth rather than spoon-feeding purees. Babies as young as 6 months can start when they show readiness signs (sitting with support, loss of tongue thrust, interest in food). Gagging is normal and different from choking. BLW may support fine motor development, food acceptance, and self-regulation of intake.' },

  { id: 'purees', term: 'Purees / Spoon Feeding', category: 'feeding',
    short: 'The traditional method of introducing solids through smooth, blended foods.',
    long: 'Single-ingredient purees (sweet potato, peas, pears) are introduced one at a time with a spoon, starting around 4–6 months depending on readiness. Purees are gradually made thicker and chunkier as baby develops. Some parents do a combination of purees and finger foods ("baby led weaning with a spoon"). Neither method is superior — the right choice depends on your baby and family.' },

  { id: 'responsive_feeding', term: 'Responsive Feeding', category: 'feeding',
    short: 'Feeding in response to a baby\'s hunger and fullness cues rather than on a rigid schedule.',
    long: 'Responsive feeding means offering the breast or bottle when your baby shows hunger cues (rooting, sucking hands, fussing) rather than watching the clock. For breastfed newborns, this is especially important for establishing supply. It supports healthy self-regulation and prevents over- or underfeeding. As babies get older, patterns naturally emerge and schedules can be gently introduced.' },

  { id: 'cluster_feeding', term: 'Cluster Feeding', category: 'feeding',
    short: 'When a baby feeds very frequently over a short period, often in the evening.',
    long: 'Cluster feeding is when a baby wants to nurse or take a bottle every 30–60 minutes for several hours, usually in the late afternoon or evening. It\'s most common in newborns and during growth spurts. Breastfed babies do this to increase milk supply to meet growing needs. It\'s exhausting but temporary — the evening cluster often precedes a longer overnight sleep stretch.' },

  { id: 'paced_bottle', term: 'Paced Bottle Feeding', category: 'feeding',
    short: 'A bottle feeding technique that mimics breastfeeding by letting the baby control the pace.',
    long: 'Paced feeding involves holding the bottle horizontally (not tilted up), using a slow-flow nipple, and allowing the baby to take breaks. This prevents overfeeding, reduces gas, and makes bottle and breast more interchangeable — important for nursing families. Aim for feeds to last 15–20 minutes. Signs the baby is done: relaxed hands, slowing sucks, turning away.' },

  { id: 'nipple_confusion', term: 'Nipple Confusion', category: 'feeding',
    short: 'When switching between breast and bottle disrupts a baby\'s latch or feeding preference.',
    long: 'Nipple confusion refers to difficulty breastfeeding after introducing a bottle or pacifier because the sucking mechanics differ. Bottles flow with minimal effort; breastfeeding requires more active jaw and tongue work. Most evidence suggests the risk is overstated — many babies move between breast and bottle easily. Most lactation consultants recommend waiting 3–4 weeks before introducing bottles if you\'re establishing breastfeeding.' },

  { id: 'nursing_strike', term: 'Nursing Strike', category: 'feeding',
    short: 'When a breastfed baby suddenly refuses the breast.',
    long: 'A nursing strike is when a baby who has been breastfeeding well suddenly refuses to nurse. It\'s different from self-weaning (which is gradual and happens after 12 months). Strikes can be caused by teething, ear infections, a cold, a new scent, or a change in milk taste. Most strikes last a few days to a week. Pump to maintain supply, offer in a calm/dark environment, and keep skin-to-skin contact.' },

  { id: 'combo_feeding', term: 'Combination Feeding', category: 'feeding',
    short: 'Using both breast milk and formula to feed your baby.',
    long: 'Combo feeding means supplementing breastfeeding with formula, or replacing some nursing sessions with formula. Families choose this for many reasons: low supply, returning to work, mental health, or personal preference. It\'s a valid and healthy choice. Supplementing with formula can reduce milk supply if you\'re not pumping to replace skipped feeds — a lactation consultant can help you find a sustainable balance.' },

  { id: 'demand_feeding', term: 'On-Demand Feeding', category: 'feeding',
    short: 'Feeding whenever the baby signals hunger rather than on a set schedule.',
    long: 'On-demand feeding means letting the baby lead — offering the breast or bottle whenever they show hunger cues. This is the recommended approach for newborns, especially breastfed babies, as it helps establish and maintain milk supply. It means reading hunger cues (rooting, sucking motions, hands to mouth) before they escalate to crying. Many families naturally transition to a loose schedule by 3–4 months.' },

  // BREASTFEEDING
  { id: 'latch', term: 'Latch', category: 'breastfeeding',
    short: 'How a baby attaches to the breast during nursing.',
    long: 'A good latch means the baby has a large mouthful of breast tissue (not just the nipple), with the chin touching the breast and the nose free to breathe. Signs of a good latch: you hear swallowing, milk transfers well, and nursing isn\'t painful after the first few seconds. A poor latch causes nipple pain, cracking, and poor milk transfer. An IBCLC (lactation consultant) can assess your latch and is worth the visit if you\'re struggling.' },

  { id: 'letdown', term: 'Letdown Reflex', category: 'breastfeeding',
    short: 'The release of milk from the breast in response to nursing or pumping.',
    long: 'The letdown (milk ejection reflex) is triggered by oxytocin released when your baby latches, you pump, or even when you think about your baby. It feels like a tingling, pressure, or warmth in the breast. Multiple letdowns can occur in one feed. Stress, pain, or anxiety can inhibit letdown. When struggling to letdown while pumping, try looking at photos of your baby, applying a warm compress, or gentle breast massage.' },

  { id: 'foremilk_hindmilk', term: 'Foremilk & Hindmilk', category: 'breastfeeding',
    short: 'The different fat content of milk at the beginning vs. end of a nursing session.',
    long: 'Foremilk is the thinner, more watery milk at the start of a feed; hindmilk is the creamier, higher-fat milk that comes later. The idea that babies must "get to the hindmilk" is largely outdated — current evidence shows it\'s a spectrum, not two distinct milks. The most important thing is to let baby finish one breast fully before offering the other.' },

  { id: 'mastitis', term: 'Mastitis', category: 'breastfeeding',
    short: 'A breast infection causing pain, swelling, redness, and flu-like symptoms.',
    long: 'Mastitis is inflammation of breast tissue that can develop into infection. Symptoms include a hard, red, painful area of the breast, fever over 101°F, and body aches. Causes include blocked ducts, infrequent feeding, or bacteria entering through a cracked nipple. Treatment: continue nursing or pumping (helps clear the blockage), rest, warm/cool compresses, and contact your provider — antibiotics are often needed. Untreated, it can progress to a breast abscess.' },

  { id: 'engorgement', term: 'Engorgement', category: 'breastfeeding',
    short: 'When breasts become overly full, hard, and painful — usually in the early days postpartum.',
    long: 'Engorgement commonly happens on days 2–5 postpartum when milk "comes in." The breast feels very full, tight, and hard, which can make it hard for baby to latch. Relief: nurse or pump frequently, use hand expression or a warm compress before feeding to soften the areola, and cold compresses after to reduce swelling. Engorgement typically resolves within days as supply regulates.' },

  { id: 'oversupply', term: 'Oversupply', category: 'breastfeeding',
    short: 'Producing significantly more milk than your baby needs.',
    long: 'Oversupply sounds like a good problem but can cause forceful letdown (baby chokes or pulls off), a gassy/fussy baby, and frequent plugged ducts or mastitis. Signs: baby gulps and sputters, clicks at breast, has green frothy poops. Management: block feeding (one breast per feeding window), laid-back nursing position, and avoiding extra pumping that stimulates more supply. An IBCLC can help develop a plan.' },

  { id: 'low_supply', term: 'Low Milk Supply', category: 'breastfeeding',
    short: 'Producing less milk than your baby needs.',
    long: 'True low supply is less common than perceived — most cases are unfounded concerns. Actual low supply can be caused by infrequent nursing, poor latch, supplementing too early, or hormonal issues. Signs baby IS getting enough: 6+ wet diapers/day, steady weight gain, content after feeds. To boost supply: nurse or pump more frequently, ensure a good latch, try power pumping, and consult an IBCLC.' },

  { id: 'power_pumping', term: 'Power Pumping', category: 'breastfeeding',
    short: 'A pumping technique that mimics cluster feeding to increase milk supply.',
    long: 'Power pumping involves pumping 20 minutes, resting 10, pumping 10, resting 10, pumping 10 — one hour total. Done once or twice a day for several days, it sends a "high demand" signal to your body to increase supply. Results usually appear within 3–7 days. It\'s most effective combined with maintaining regular feeds or pumping sessions throughout the day.' },

  // PARENTING STYLES
  { id: 'attachment_parenting', term: 'Attachment Parenting', category: 'parenting',
    short: 'A parenting philosophy emphasizing close physical and emotional connection.',
    long: 'Coined by Dr. William Sears, attachment parenting centers around the "7 Bs": Birth bonding, Breastfeeding, Babywearing, Bedsharing, Belief in your baby\'s cry, Beware of baby trainers, Balance. The principle is that consistently meeting a baby\'s needs builds secure attachment and supports emotional health long-term. AP doesn\'t require all 7 Bs — it\'s a philosophy you adapt to your family.' },

  { id: 'gentle_parenting', term: 'Gentle Parenting', category: 'parenting',
    short: 'A parenting approach emphasizing empathy, respect, and understanding over punishment.',
    long: 'Gentle parenting focuses on connection, validating children\'s emotions, and guiding behavior with empathy rather than control or punishment. It\'s not permissive parenting — boundaries and expectations exist, but they\'re enforced collaboratively. Common tools: emotion coaching, natural consequences, and time-ins instead of time-outs. It draws from the work of Dr. Dan Siegel and Sarah Ockwell-Smith.' },

  { id: 'authoritative', term: 'Authoritative Parenting', category: 'parenting',
    short: 'A balanced parenting style with clear rules, warmth, and responsiveness.',
    long: 'Research consistently identifies authoritative parenting as one of the most effective styles. It combines warmth and responsiveness with clear, consistent expectations. Unlike authoritarian (strict rules, low warmth) or permissive (high warmth, few rules) parenting, authoritative parents explain rules, listen to children, and enforce boundaries with empathy. Associated with better academic outcomes, higher self-esteem, and fewer behavioral problems.' },

  { id: 'rie', term: 'RIE (Resources for Infant Educarers)', category: 'parenting',
    short: 'A philosophy that treats infants as competent individuals deserving respect and unstructured play.',
    long: 'Developed by Magda Gerber, RIE (pronounced "rye") holds that babies are competent, curious beings who learn through self-directed play. Key principles: narrate care routines, ask before picking up, allow uninterrupted floor play, avoid toy overstimulation, and trust babies to communicate. RIE is popular among child development professionals and emphasizes slowing down to observe before intervening.' },

  { id: 'free_range', term: 'Free-Range Parenting', category: 'parenting',
    short: 'Giving children age-appropriate independence and the freedom to take risks.',
    long: 'Popularized by Lenore Skenazy, free-range parenting pushes back against over-scheduling by allowing children to do things on their own — playing outside unsupervised, walking to school. The philosophy holds that children need risk, boredom, and independence to develop resilience. It doesn\'t mean neglect; it means calibrating supervision to actual risk rather than worst-case-scenario fear.' },

  { id: 'helicopter', term: 'Helicopter Parenting', category: 'parenting',
    short: 'Over-involved, protective parenting that hovers over children and manages their experiences.',
    long: 'Helicopter parenting describes excessive involvement — solving problems for your child, preventing all failure, and managing every interaction. Coined by Haim Ginott, the term captures well-intentioned but counterproductive over-protection. Research suggests it can undermine children\'s ability to develop independence, resilience, and confidence. The challenge is distinguishing appropriate guidance from over-involvement.' },

  { id: 'peaceful_parenting', term: 'Peaceful Parenting', category: 'parenting',
    short: 'A parenting approach focused on regulating your own emotions before responding to your child.',
    long: 'Peaceful parenting (Dr. Laura Markham) holds that you can only guide your child as well as you can regulate yourself. The three pillars: regulate yourself first, connect with your child, then coach (rather than control). It acknowledges that parenting triggers often come from our own childhood experiences, and that the relationship built over time matters more than any individual moment.' },

  // DEVELOPMENT
  { id: 'tummy_time', term: 'Tummy Time', category: 'development',
    short: 'Supervised time spent on a baby\'s stomach to build neck, shoulder, and core strength.',
    long: 'Tummy time is essential for developing the muscles needed to hold up the head, roll, sit, crawl, and walk. Since the "Safe to Sleep" campaign (babies sleep on their backs), supervised tummy time while awake is needed to counteract this. Start from birth, building to 30+ minutes/day by 3–4 months. Babies who resist it often do better on a Boppy, across your lap, or on your chest.' },

  { id: 'object_permanence', term: 'Object Permanence', category: 'development',
    short: 'The understanding that objects and people continue to exist even when out of sight.',
    long: 'Babies are born without object permanence — when something is hidden, it simply ceases to exist. This develops gradually through the first year. At 4–8 months, babies begin searching for partially hidden objects. By 8–12 months, most understand a hidden object still exists. This is why peekaboo is so delightful — and why separation anxiety peaks around this same time.' },

  { id: 'wonder_weeks', term: 'Wonder Weeks / Mental Leaps', category: 'development',
    short: 'Predictable periods of fussiness tied to major cognitive development leaps.',
    long: 'Based on research by Dutch scientists Frans Plooij and Hetty van de Rijt, the Wonder Weeks theory identifies 10 predictable "mental leaps" in the first 20 months. During each leap, babies are learning to perceive the world in a new way, associated with increased fussiness, clinginess, and sleep disruption — followed by a burst of new skills. Timing is calculated from due date, not birth date.' },

  { id: 'gross_motor', term: 'Gross Motor Skills', category: 'development',
    short: 'Large muscle movements: rolling, sitting, crawling, walking.',
    long: 'Gross motor development follows a head-to-toe progression: head control, rolling, sitting, pulling to stand, cruising, walking. Milestones are ranges, not deadlines — most babies walk between 9–15 months. Tummy time, floor play, and minimizing time in bouncers and bouncers supports development. If your baby has missed multiple milestones, mention it to your pediatrician for a referral to early intervention.' },

  { id: 'fine_motor', term: 'Fine Motor Skills', category: 'development',
    short: 'Small muscle movements: grasping, pincer grip, self-feeding.',
    long: 'Fine motor skills involve the hands and fingers: palmar grasp (~3–4 months), transferring between hands (~6 months), developing a pincer grip (index finger + thumb, ~9–12 months), and eventually self-feeding, stacking, and scribbling. BLW and open-ended play with age-appropriate objects support fine motor development. Fine motor delays should be flagged to your pediatrician.' },

  { id: 'sensory_play', term: 'Sensory Play', category: 'development',
    short: 'Activities that stimulate a baby\'s senses and support brain development.',
    long: 'Sensory play engages sight, sound, touch, taste, smell, movement, and body awareness. For babies: black-and-white patterns (vision), rattles and music (hearing), different textures (touch), water play. Sensory experiences build neural connections and support cognitive, language, and motor development. The most powerful sensory play is often free — different fabrics, containers with lids, safe household objects to explore.' },

  { id: 'parallel_play', term: 'Parallel Play', category: 'development',
    short: 'When toddlers play alongside each other without directly interacting.',
    long: 'Parallel play is a normal developmental stage typically seen between 18 months and 3 years. Children play next to each other, may observe and copy, but don\'t coordinate or cooperate. This is a precursor to cooperative play (playing together), which develops around ages 3–4. If your toddler isn\'t "playing with" other children, parallel play is developmentally appropriate and an important social step.' },

  { id: 'separation_anxiety', term: 'Separation Anxiety', category: 'development',
    short: 'Distress when separated from a primary caregiver, normal from 6–24 months.',
    long: 'Separation anxiety peaks around 10–18 months and is a sign of healthy attachment — your baby has learned you exist even when absent, and doesn\'t yet fully trust that you\'ll return. Strategies: consistent routines, short goodbye rituals (don\'t sneak away), acknowledge their feelings, and leave confidently. It typically eases by age 2 but can resurface during stress or transition.' },

  { id: 'self_regulation', term: 'Self-Regulation', category: 'development',
    short: 'The ability to manage emotions, behavior, and attention in response to the environment.',
    long: 'Babies are born with zero ability to self-regulate — they depend entirely on caregivers for co-regulation. This is why responding to cries matters: you\'re helping wire the brain\'s stress-response system. Self-regulation develops gradually as the prefrontal cortex matures (a process that isn\'t complete until the mid-20s). Toddler tantrums aren\'t manipulation — they\'re the result of big emotions and an immature regulatory system.' },

  // HEALTH
  { id: 'colic', term: 'Colic', category: 'health',
    short: 'Frequent, prolonged, intense crying in an otherwise healthy baby.',
    long: 'Colic is defined as crying more than 3 hours a day, more than 3 days a week, for more than 3 weeks in a baby under 3 months. It peaks around 6 weeks and resolves by 3–4 months. The cause is unknown — gas, gut immaturity, and overstimulation have all been suggested. Strategies: babywearing, white noise, gentle motion, gas drops. It is not caused by parenting failures. It will end.' },

  { id: 'reflux', term: 'Reflux / GERD', category: 'health',
    short: 'When stomach contents flow back up into the esophagus, causing discomfort.',
    long: 'Infant reflux (GER) is very common — the valve between the esophagus and stomach is immature in babies. Spitting up is GER. When it causes pain, poor weight gain, or feeding aversion, it becomes GERD. Signs of GERD: arching after feeds, crying during or after feeding, poor weight gain. Treatment varies: upright positioning, smaller more frequent feeds, thickening formula, and prescription medication in serious cases.' },

  { id: 'jaundice', term: 'Jaundice', category: 'health',
    short: 'Yellowing of a baby\'s skin and eyes caused by elevated bilirubin levels.',
    long: 'Jaundice affects up to 60% of term newborns. It\'s caused by bilirubin buildup as the liver matures, typically appearing days 2–4 and resolving by 2 weeks. Mild jaundice often resolves with frequent feeding (bilirubin is excreted through stool). More significant cases are treated with phototherapy (bililights). Warning signs: yellow spreading to chest/belly/limbs, extreme sleepiness, not feeding well.' },

  { id: 'tongue_tie', term: 'Tongue Tie (Ankyloglossia)', category: 'health',
    short: 'When the tissue connecting the tongue to the floor of the mouth is too short or tight.',
    long: 'Tongue tie restricts tongue movement and can affect breastfeeding (poor latch, nipple pain, milk transfer), bottle feeding, speech, and oral development. Not all tongue ties need treatment — severity and functional impact vary. When treatment is needed, a frenotomy (small snip) or frenuloplasty can be done. Posterior tongue ties are harder to diagnose and more controversial in the medical community.' },

  { id: 'lip_tie', term: 'Lip Tie', category: 'health',
    short: 'When the tissue connecting the upper lip to the gum is too tight, affecting the lip flange during feeding.',
    long: 'A lip tie occurs when the frenulum under the upper lip limits how far the lip can flange out during feeding. It often co-occurs with tongue tie. Symptoms: difficulty flanging the lip for a deep latch, clicking sounds, slow weight gain, gassy baby. Diagnosis and treatment decisions are often controversial — some providers recommend revision, others don\'t. Multiple opinions and working with an IBCLC are helpful.' },

  { id: 'growth_spurt', term: 'Growth Spurt', category: 'health',
    short: 'Periods of rapid physical growth accompanied by increased hunger and fussiness.',
    long: 'Growth spurts are common around 2–3 weeks, 6 weeks, 3 months, and 6 months. During a growth spurt, breastfed babies may cluster feed intensely to increase supply; formula-fed babies may want more at each feed. Babies may also sleep more and be extra fussy. They typically last 2–3 days. Responding to hunger cues (not limiting feeds) is the right approach.' },

  { id: 'fourth_trimester', term: 'Fourth Trimester', category: 'health',
    short: 'The first 12 weeks after birth, during which a newborn is adjusting to life outside the womb.',
    long: 'Coined by Dr. Harvey Karp, the fourth trimester describes the period where a newborn — whose brain is still very immature compared to other mammals at birth — is adjusting to being outside the womb. Newborns are most soothed by conditions that mimic the womb: warmth, tight swaddling, shushing sounds, gentle swinging, and sucking. Understanding this helps set realistic expectations and encourages following baby\'s cues.' },

  // MENTAL HEALTH
  { id: 'baby_blues', term: 'Baby Blues', category: 'mentalhealth',
    short: 'Temporary mood swings, tearfulness, and anxiety in the first 1–2 weeks postpartum.',
    long: 'Baby blues affect up to 80% of new parents and are caused by the dramatic hormonal shift after birth. Symptoms: crying for no clear reason, mood swings, anxiety, irritability, and feeling overwhelmed. They typically begin within 2–3 days of delivery and resolve within 2 weeks. If symptoms persist beyond 2 weeks or worsen, it may be postpartum depression — reach out to your provider.' },

  { id: 'ppd', term: 'Postpartum Depression (PPD)', category: 'mentalhealth',
    short: 'Clinical depression that occurs after childbirth, affecting 1 in 7 new mothers.',
    long: 'PPD goes beyond baby blues in intensity and duration. Symptoms: persistent sadness, loss of interest, difficulty bonding with your baby, feelings of worthlessness, changes in appetite/sleep, thoughts of harming yourself or your baby. PPD can start any time in the first year. It\'s caused by hormonal changes, sleep deprivation, and psychological adjustment. It\'s treatable — therapy, medication, and support all help. Contact your OB or midwife.' },

  { id: 'pmads', term: 'PMADs', category: 'mentalhealth',
    short: 'Perinatal Mood & Anxiety Disorders — the umbrella term for mood and anxiety disorders during pregnancy and postpartum.',
    long: 'PMADs include postpartum depression, postpartum anxiety, postpartum OCD, postpartum PTSD, and postpartum psychosis. They affect up to 20% of birthing parents and can also affect non-birthing partners. Postpartum anxiety (constant worry, racing thoughts) is actually more common than PPD but less discussed. Postpartum psychosis is rare (1–2 in 1,000) but is a medical emergency. Postpartum Support International helpline: 1-800-944-4773.' },

  { id: 'matrescence', term: 'Matrescence', category: 'mentalhealth',
    short: 'The developmental transition of becoming a mother — as significant as adolescence.',
    long: 'Coined by anthropologist Dana Raphael in 1973 and popularized by Dr. Alexandra Sacks, matrescence describes the psychological, physical, and social transformation that occurs when a person becomes a mother. Like adolescence, it involves a complete identity restructuring — ambivalence about parenting, loss of former self, and feeling in-between identities. Naming this as a normal developmental process (not a disorder) can be deeply validating for new parents.' },

  { id: 'postpartum_anxiety', term: 'Postpartum Anxiety (PPA)', category: 'mentalhealth',
    short: 'Anxiety disorder following childbirth, often more common than PPD.',
    long: 'PPA involves persistent, excessive worry that is difficult to control — often centered on the baby\'s safety. Symptoms: racing thoughts, constant "what ifs," difficulty relaxing, irritability, and physical symptoms like a racing heart. Some anxiety is normal; PPA is when it interferes with daily functioning. It responds well to therapy (especially CBT) and sometimes medication. It\'s often missed because anxious parents seem "engaged" rather than visibly struggling.' },

  // MILESTONES
  { id: 'milestones', term: 'Developmental Milestones', category: 'milestones',
    short: 'Skill and behavior markers that most children reach by certain ages.',
    long: 'Developmental milestones span four domains: motor (gross and fine), language/communication, social/emotional, and cognitive. The CDC milestone checklists (updated 2022) provide guidance from 2 months to 5 years. Milestones are ranges, not deadlines — but they\'re not unlimited. If your child has missed multiple milestones or you\'re concerned, ask for an evaluation. Early intervention (free through age 3 in the US) is most effective when started early.' },

  { id: 'percentiles', term: 'Percentiles / Growth Charts', category: 'milestones',
    short: 'A measure of how a baby\'s size compares to other babies the same age.',
    long: 'Growth charts compare your baby\'s height, weight, and head circumference to a reference population. Being in the 20th percentile means your baby is larger than 20% of babies their age. Percentiles are not report cards — a healthy baby can be anywhere on the chart. What your pediatrician watches is the trajectory: is your baby consistently following their curve? Crossing multiple percentile lines downward is more concerning than simply being small.' },

  { id: 'adjusted_age', term: 'Adjusted Age (Corrected Age)', category: 'milestones',
    short: 'A preterm baby\'s age calculated from their due date rather than their birth date.',
    long: 'For babies born prematurely, adjusted age is calculated by subtracting the number of weeks early from their chronological age. A baby born 8 weeks early who is 6 months old has an adjusted age of 4 months. Developmental milestones, growth charts, and feeding expectations should be calibrated to adjusted age, not chronological age. Most providers use adjusted age until 2–2.5 years.' },

  { id: 'early_intervention', term: 'Early Intervention', category: 'milestones',
    short: 'Government-funded services for children under 3 who have developmental delays or disabilities.',
    long: 'Early intervention (EI) is a federally mandated program in the US (Part C of IDEA) that provides free evaluations and services for children birth to age 3 who have developmental delays or conditions likely to cause delays. Services can include speech therapy, occupational therapy, physical therapy, and more. You do not need a doctor\'s referral to request an evaluation — you can call your state\'s EI program directly. The earlier services start, the better the outcomes.' },
];

// ─── A-Z sections (precomputed) ───────────────────────────────────────────────

const AZ_SECTIONS = (() => {
  const byLetter: Record<string, Term[]> = {};
  [...TERMS].sort((a, b) => a.term.localeCompare(b.term)).forEach(t => {
    const letter = t.term[0].toUpperCase();
    if (!byLetter[letter]) byLetter[letter] = [];
    byLetter[letter].push(t);
  });
  return Object.entries(byLetter)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({ title, data }));
})();

// ─── Category badge colors ────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<CategoryId, string> = {
  sleep:          'Sleep',
  feeding:        'Feeding',
  breastfeeding:  'Breastfeeding',
  parenting:      'Parenting',
  development:    'Development',
  health:         'Health',
  mentalhealth:   'Mental Health',
  milestones:     'Milestones',
};

// ─── TermRow ──────────────────────────────────────────────────────────────────

function TermRow({
  term,
  onPress,
  c,
}: {
  term: Term;
  onPress: () => void;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[termRowStyles.row, { borderBottomColor: c.border ?? '#E5E7EB' }]}
    >
      <View style={termRowStyles.text}>
        <Text style={[termRowStyles.name, { color: c.textPrimary }]}>{term.term}</Text>
        <Text style={[termRowStyles.short, { color: c.textMuted }]} numberOfLines={2}>
          {term.short}
        </Text>
      </View>
      <Text style={[termRowStyles.chevron, { color: c.textMuted }]}>›</Text>
    </TouchableOpacity>
  );
}

const termRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    gap: 12,
  },
  text: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  short: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  chevron: { fontSize: 22, fontWeight: '700' },
});

// ─── TermModal ────────────────────────────────────────────────────────────────

function TermModal({
  term,
  onClose,
  c,
}: {
  term: Term | null;
  onClose: () => void;
  c: ReturnType<typeof useColors>;
}) {
  if (!term) return null;
  const s = termModalStyles(c);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.closeBtn}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <View style={s.badge}>
            <Text style={s.badgeText}>{CATEGORY_LABEL[term.category]}</Text>
          </View>
          <Text style={s.title}>{term.term}</Text>
          <Text style={s.short}>{term.short}</Text>
          <View style={s.divider} />
          <Text style={s.long}>{term.long}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const termModalStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, alignItems: 'flex-end' },
    closeBtn: { fontSize: 16, fontWeight: '700', color: c.textSecondary },
    body: { padding: 24, paddingBottom: 48, gap: 12 },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: c.cardLavender,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    badgeText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    title: { fontSize: 26, fontWeight: '800', color: c.textPrimary, lineHeight: 32 },
    short: { fontSize: 15, fontWeight: '600', color: c.textSecondary, lineHeight: 22 },
    divider: { height: 1, backgroundColor: c.cardLavender, marginVertical: 4 },
    long: { fontSize: 15, color: c.textPrimary, lineHeight: 24, fontWeight: '400' },
  });

// ─── SuggestModal ─────────────────────────────────────────────────────────────

function SuggestModal({
  visible,
  onClose,
  c,
}: {
  visible: boolean;
  onClose: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const [termText, setTermText] = useState('');
  const [descText, setDescText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const s = suggestModalStyles(c);

  const submit = async () => {
    if (!termText.trim()) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('term_suggestions').insert({
        term: termText.trim(),
        description: descText.trim() || null,
        user_id: user?.id ?? null,
      });
      setTermText('');
      setDescText('');
      onClose();
      Alert.alert('Thanks!', 'Your suggestion has been submitted.');
    } catch {
      Alert.alert('Error', 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={s.container}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Suggest a Term</Text>
            <TouchableOpacity onPress={submit} disabled={!termText.trim() || submitting}>
              <Text style={[s.submit, (!termText.trim() || submitting) && s.submitDisabled]}>Submit</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>Term or method *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Montessori, sleep training..."
              placeholderTextColor={c.textMuted}
              value={termText}
              onChangeText={setTermText}
            />
            <Text style={s.label}>Description (optional)</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="What does it mean? Any context helps."
              placeholderTextColor={c.textMuted}
              value={descText}
              onChangeText={setDescText}
              multiline
              textAlignVertical="top"
            />
            <Text style={s.hint}>
              We review all suggestions and will add them to the library if they're a good fit.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const suggestModalStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.cardLavender,
    },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    cancel: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
    submit: { fontSize: 15, fontWeight: '700', color: c.lavender },
    submitDisabled: { opacity: 0.4 },
    body: { padding: 20, gap: 8 },
    label: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginTop: 8 },
    input: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      fontSize: 15,
      color: c.textPrimary,
      fontWeight: '500',
    },
    textarea: { height: 120 },
    hint: {
      fontSize: 13,
      color: c.textMuted,
      fontWeight: '500',
      lineHeight: 18,
      marginTop: 8,
    },
  });

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ParentingAZ({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const s = mainStyles(c);

  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('az');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | 'all'>('all');
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);

  const isSearching = query.trim().length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = query.toLowerCase();
    return TERMS
      .filter(t =>
        t.term.toLowerCase().includes(q) ||
        t.short.toLowerCase().includes(q) ||
        t.long.toLowerCase().includes(q)
      )
      .sort((a, b) => a.term.localeCompare(b.term));
  }, [query, isSearching]);

  const topicTerms = useMemo(() => {
    const base = selectedCategory === 'all'
      ? TERMS
      : TERMS.filter(t => t.category === selectedCategory);
    return [...base].sort((a, b) => a.term.localeCompare(b.term));
  }, [selectedCategory]);

  const renderTermRow = (term: Term) => (
    <TermRow key={term.id} term={term} onPress={() => setSelectedTerm(term)} c={c} />
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={s.titleRow}>
        <Text style={s.pageTitle}>Parenting A–Z</Text>
        <TouchableOpacity style={s.suggestBtn} onPress={() => setShowSuggest(true)}>
          <Text style={s.suggestBtnText}>+ Suggest</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search terms and methods..."
          placeholderTextColor={c.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* View toggle (hidden while searching) */}
      {!isSearching && (
        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.toggleBtn, viewMode === 'az' && s.toggleBtnActive]}
            onPress={() => setViewMode('az')}
          >
            <Text style={[s.toggleBtnText, viewMode === 'az' && s.toggleBtnTextActive]}>A–Z</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, viewMode === 'topic' && s.toggleBtnActive]}
            onPress={() => setViewMode('topic')}
          >
            <Text style={[s.toggleBtnText, viewMode === 'topic' && s.toggleBtnTextActive]}>By Topic</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {isSearching ? (
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {searchResults.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🔍</Text>
              <Text style={s.emptyText}>No results for "{query}"</Text>
              <TouchableOpacity onPress={() => setShowSuggest(true)}>
                <Text style={s.emptyLink}>Suggest this term →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            searchResults.map(renderTermRow)
          )}
        </ScrollView>
      ) : viewMode === 'az' ? (
        <SectionList
          sections={AZ_SECTIONS}
          keyExtractor={item => item.id}
          renderItem={({ item }) => renderTermRow(item)}
          renderSectionHeader={({ section: { title } }) => (
            <View style={s.sectionHeader}>
              <Text style={s.sectionHeaderText}>{title}</Text>
            </View>
          )}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <>
          {/* Category chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
          >
            {CATEGORIES.map(cat => {
              const active = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => setSelectedCategory(cat.id as CategoryId | 'all')}
                >
                  <Text style={[s.chipText, active && s.chipTextActive]}>
                    {cat.emoji} {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false}>
            {topicTerms.map(renderTermRow)}
            <View style={{ height: 40 }} />
          </ScrollView>
        </>
      )}

      {/* Modals */}
      <TermModal term={selectedTerm} onClose={() => setSelectedTerm(null)} c={c} />
      <SuggestModal visible={showSuggest} onClose={() => setShowSuggest(false)} c={c} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mainStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },

    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
    },
    pageTitle: { fontSize: 26, fontWeight: '800', color: c.textPrimary },
    suggestBtn: {
      backgroundColor: c.cardLavender,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    suggestBtnText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      marginHorizontal: 20,
      marginBottom: 12,
      borderRadius: 12,
      paddingHorizontal: 12,
      gap: 8,
    },
    searchIcon: { fontSize: 16 },
    searchInput: {
      flex: 1,
      height: 42,
      fontSize: 15,
      color: c.textPrimary,
      fontWeight: '500',
    },

    toggleRow: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 12,
      backgroundColor: c.card,
      borderRadius: 10,
      padding: 3,
      gap: 2,
    },
    toggleBtn: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: 'center',
    },
    toggleBtnActive: { backgroundColor: c.bg },
    toggleBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    toggleBtnTextActive: { color: c.textPrimary, fontWeight: '800' },

    sectionHeader: {
      backgroundColor: c.bg,
      paddingHorizontal: 20,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: c.card,
    },
    sectionHeaderText: {
      fontSize: 13,
      fontWeight: '800',
      color: c.textMuted,
      letterSpacing: 1,
    },

    chips: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    chip: {
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    chipActive: { backgroundColor: c.lavender },
    chipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: '#fff', fontWeight: '700' },

    empty: { alignItems: 'center', padding: 40, gap: 10 },
    emptyEmoji: { fontSize: 36 },
    emptyText: { fontSize: 16, fontWeight: '600', color: c.textMuted },
    emptyLink: { fontSize: 14, fontWeight: '700', color: c.lavender },
  });
