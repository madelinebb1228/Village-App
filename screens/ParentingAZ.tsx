import React, { useState, useMemo, useEffect } from 'react';
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
  Linking,
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

export type TermSource = {
  label: string;
  url: string;
};

export type Term = {
  id: string;
  term: string;
  category: CategoryId;
  short: string;
  long: string;
  steps?: string[];
  sources?: TermSource[];
  // Alternate phrasings (plurals, shortened forms, alternate names) that
  // should also link to this term when they appear in article text, since
  // articles rarely use the exact glossary display string verbatim.
  aliases?: string[];
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

export const TERMS: Term[] = [
  // SLEEP
  { id: 'ferber', term: 'Ferber Method', category: 'sleep',
    short: 'A sleep training method where you check in on your baby at longer and longer time gaps.',
    long: 'Created in 1985 by Dr. Richard Ferber, a pediatrician who ran the sleep clinic at Boston Children\'s Hospital. It\'s also called "graduated extinction." It\'s the most-studied sleep training method out there. Studies show it works for most babies within about a week, and doesn\'t cause lasting harm or hurt your bond with your baby. Usually used for babies 6 months and older.',
    steps: [
      'Put your baby in the crib awake, not already asleep.',
      'Leave the room. Wait about 3 minutes before going back in.',
      'Go back in briefly — a quick pat or a few calm words. Don\'t pick baby up. Keep it under a minute, then leave again.',
      'Wait a little longer each time (like 5 minutes, then 10 minutes) before checking again.',
      'Repeat until baby falls asleep on their own.',
      'The next night, start with slightly longer wait times than the night before.',
    ],
    sources: [
      { label: 'Sleep Foundation — "The Ferber Method for Sleep Training"', url: 'https://www.sleepfoundation.org/baby-sleep/ferber-method' },
      { label: 'ParentingScience.com — Ferber method evidence review', url: 'https://parentingscience.com/ferber-method/' },
    ] },

  { id: 'cio', term: 'Cry It Out (CIO)', category: 'sleep',
    short: 'A sleep training method where you put your baby down and don\'t go back in until morning.',
    long: 'Also called the "extinction method." Unlike the Ferber method, there are no check-ins at all. A study followed kids for 5 years after their parents tried this method and found no difference in behavior or emotional problems compared to kids whose parents didn\'t. It can work fast, but it\'s emotionally hard for a lot of parents to do. Usually recommended for babies 6 months and older.',
    aliases: ['Cry It Out', 'CIO', 'cry-it-out'],
    steps: [
      'Follow your normal bedtime routine (bath, book, etc.).',
      'Put your baby in the crib awake.',
      'Leave the room.',
      'Don\'t go back in until morning, or the next scheduled feed — no check-ins.',
      'Crying usually gets shorter and less intense within 3 to 5 nights.',
    ],
    sources: [
      { label: 'Price et al., "Five-Year Follow-up of Harms and Benefits of Behavioral Infant Sleep Intervention" — Pediatrics (2012)', url: 'https://publications.aap.org/pediatrics/article/130/4/643/30241/Five-Year-Follow-up-of-Harms-and-Benefits-of' },
    ] },

  { id: 'no_cry', term: 'No-Cry Sleep Solution', category: 'sleep',
    short: 'A gentle way to change your baby\'s sleep habits slowly, without ever leaving them to cry.',
    long: 'Created by Elizabeth Pantley. Instead of one big change overnight, you make small, gentle changes over about 10 days. It takes longer than cry-based methods — weeks instead of days — but a lot of parents prefer that it never involves crying it out. Works best if you can stay consistent day after day.',
    steps: [
      'Keep a sleep log for a few days to see your baby\'s actual patterns.',
      'Pick one small thing to change first, not everything at once.',
      'If nursing or bottle-feeding to sleep, try the "pull-off": once your baby\'s sucking slows down (a sign they\'re drifting off), gently pull them off and put them down still slightly awake.',
      'If your baby fusses, comfort them without picking them all the way up if possible — patting, shushing, a hand on their chest.',
      'Repeat consistently for about 10 days, adjusting as you learn what works.',
    ] },

  { id: 'dream_feed', term: 'Dream Feed', category: 'sleep',
    short: 'A late-night feed you give while your baby is still mostly asleep, to try to buy yourself a longer stretch of sleep.',
    long: 'You gently rouse your sleeping baby just enough to feed them, without fully waking them, usually right before you go to bed yourself. The idea is that a full tummy delays their next hunger wake-up. The research on how well this actually works is mixed — one small study found it helped, but a larger 2021 study found it only added about 5 minutes of extra sleep on average. It only helps if your baby is waking from hunger, not from other reasons. Most families phase it out around 4 to 6 months.',
    aliases: ['dream feeding'],
    steps: [
      'Pick a time before you go to bed, usually between 10 and 11 PM.',
      'Gently pick baby up without fully waking them — keep the room dark and quiet.',
      'Offer the breast or bottle. Many babies will feed while still mostly asleep.',
      'Put baby back down the same way you found them.',
    ],
    sources: [
      { label: 'ParentingScience.com — dream feeding evidence review', url: 'https://parentingscience.com/dream-feeding/' },
    ] },

  { id: 'wake_windows', term: 'Wake Windows', category: 'sleep',
    short: 'The amount of time a baby can comfortably stay awake between sleep periods.',
    long: 'Every minute your baby is awake, a chemical in their brain called adenosine builds up and makes them sleepier — sleep is what clears it back out. Young babies build this up fast, so they need to sleep more often; as their brain matures over the first couple of years, they can stay awake longer between sleeps. Typical ranges: newborns 45–60 min, 2 months 1–1.5 hrs, 4 months 1.5–2 hrs, 6 months 2–3 hrs, 9 months 3–4 hrs, 12 months 3.5–4.5 hrs. These are just estimates — watch your baby\'s own sleepy cues (eye rubbing, staring off, fussiness, yawning) too. If bedtime or naps are a fight, try shortening the wake window by 15–20 minutes first.',
    sources: [
      { label: 'Borbély, "The Two-Process Model of Sleep Regulation: A Reappraisal"', url: 'https://pubmed.ncbi.nlm.nih.gov/26762182/' },
    ] },

  { id: 'contact_nap', term: 'Contact Napping', category: 'sleep',
    short: 'When your baby naps on you or against you instead of in a crib.',
    long: 'This is totally normal, especially with newborns. Babies are soothed by your heartbeat, warmth, and smell. There\'s nothing wrong with it if it\'s working for your family. Sleep training generally works better after about 4 months if you\'re trying to move away from it.',
    aliases: ['contact nap'],
    steps: [
      'Let baby fall fully into deep sleep on you first (breathing slows, body goes heavy and limp).',
      'Warm up the crib or bassinet sheet first with a warm water bottle, then remove it, so the surface isn\'t a cold shock.',
      'Lower baby down slowly, feet first, keeping a hand on their chest for a few seconds after.',
      'If they stir, pause and gently pat or shush before continuing, rather than picking them back up right away.',
    ] },

  { id: 'safe_sleep', term: 'Safe Sleep (ABCs)', category: 'sleep',
    short: 'The core guidelines to lower the risk of SIDS and other sleep-related infant deaths.',
    long: 'The "Back to Sleep" campaign that taught parents to put babies on their backs is one of the most successful public health campaigns ever — it cut the US SIDS rate by more than half between 1994 and 1999. The American Academy of Pediatrics updated its full guidelines in 2022. It\'s a lot of rules, but a few matter most.',
    aliases: ['safe sleep', 'ABCs of Safe Sleep'],
    steps: [
      'Back: always place baby on their back to sleep, every sleep, until age 1.',
      'Alone: baby sleeps on their own separate surface — no other people, pillows, or pets in the sleep space.',
      'Crib: a firm, flat surface (crib, bassinet, or pack-and-play) with just a fitted sheet. Nothing else — no blankets, bumpers, or stuffed animals.',
      'Room-share, don\'t bed-share: keep baby\'s sleep space in your room for at least 6 months, ideally 12.',
      'Don\'t overheat: dress baby in about one layer more than you\'d wear yourself, not several.',
      'Offer a pacifier at sleep times once breastfeeding is going well.',
      'Keep baby\'s environment smoke-free, before and after birth.',
    ],
    sources: [
      { label: 'AAP — "Sleep-Related Infant Deaths: Updated 2022 Recommendations"', url: 'https://publications.aap.org/pediatrics/article/150/1/e2022057990/188304/Sleep-Related-Infant-Deaths-Updated-2022' },
      { label: 'NICHD — "Reduction in SIDS Deaths Helps Bring Low Infant Mortality"', url: 'https://www.nichd.nih.gov/newsroom/releases/100996-low-mortality' },
    ] },

  { id: 'bedsharing', term: 'Bedsharing / Co-sleeping', category: 'sleep',
    short: '"Bedsharing" means sleeping in the same bed as your baby. "Co-sleeping" can mean the same bed or just the same room.',
    long: 'The AAP advises against bedsharing because of a real, measured increase in SIDS risk — research combining several studies found the risk was about 5 times higher for bedsharing than room-sharing, even for lower-risk families. Room-sharing (baby nearby in your room, on their own surface) is AAP-recommended instead, and is linked to a lower SIDS risk. Some families choose to bedshare anyway. If so, La Leche League\'s "Safe Sleep Seven" guidelines are widely used to reduce, not eliminate, the risk.',
    aliases: ['bedsharing', 'bed-sharing', 'bed sharing', 'co-sleeping'],
    steps: [
      'No smoking in the home, by anyone, ever.',
      'No alcohol or drowsy medication for either parent.',
      'Breastfeeding, day and night.',
      'Baby is healthy and full-term.',
      'Baby sleeps on their back.',
      'No sweat: light clothing, no swaddling.',
      'A safe surface: firm mattress, no soft bedding, no pillows, no gaps baby could slip into.',
    ],
    sources: [
      { label: 'Combined case-control analysis of bed-sharing and SIDS risk — PMC', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4169572/' },
      { label: 'La Leche League International — "Safe Sleep 7"', url: 'https://llli.org/breastfeeding-info/safe-sleep-7-infographic/' },
    ] },

  { id: 'sleep_regression', term: 'Sleep Regression', category: 'sleep',
    short: 'A stretch where a baby who was sleeping well suddenly starts sleeping poorly again.',
    long: 'Most regressions are temporary and line up with a developmental leap, a growth spurt, or being sick — they usually last 2 to 6 weeks. The 4-month regression is different from the others: it\'s caused by a real, permanent shift in how your baby\'s brain organizes sleep (moving from a simple 2-stage system to the same multi-stage system adults use), so it doesn\'t fully "pass" the way later ones do — your baby just gradually gets better at handling it. Other commonly mentioned regressions (8–10 months, 12 months, 18 months, 2 years) are less scientifically defined and vary a lot by baby.',
    aliases: ['sleep regressions'],
    steps: [
      'Keep your regular routine as consistent as you can — it helps more than changing everything.',
      'Offer a little extra comfort without creating a brand-new habit you don\'t want long-term.',
      'Give it time — most regressions ease within a few weeks even without doing anything differently.',
    ] },

  { id: 'overtiredness', term: 'Overtiredness', category: 'sleep',
    short: 'When a baby has been awake too long and gets harder, not easier, to settle.',
    long: 'Once a baby misses their sleep window, their body releases stress hormones — cortisol and adrenaline — to keep going. That\'s what makes them wired, fussy, and paradoxically harder to put down, according to pediatric sleep specialist Dr. Judith Owens. Overtired babies often wake more overnight and take shorter naps. Respecting wake windows to avoid overtiredness in the first place is one of the highest-payoff sleep habits there is.',
    steps: [
      'Watch for early signs: eye rubbing, staring off, going quiet, or a sudden burst of hyper energy.',
      'Start the wind-down before you think you need to — waiting for obvious tired signs is often already a little late.',
      'If you\'ve missed the window, keep things calm and dim rather than trying to tire baby out more.',
      'Next time, try starting sleep 10–15 minutes earlier.',
    ] },

  { id: 'drowsy_awake', term: 'Drowsy But Awake', category: 'sleep',
    short: 'Putting your baby down for sleep while they\'re still a little bit awake, so they learn to fall asleep on their own.',
    long: 'If your baby always falls asleep while nursing, rocking, or being held, they\'ll expect the same thing every time they wake up between sleep cycles overnight. Putting them down "drowsy but awake" teaches them to fall asleep independently from the start. It\'s harder with newborns and gets easier after about 3 to 4 months. It doesn\'t require any formal sleep training — just shifting the moment you put them down.',
    steps: [
      'Do your normal soothing routine (feed, rock, cuddle) as usual.',
      'Watch for early sleepy signs (heavy eyes, slower movements) rather than waiting until they\'re fully asleep.',
      'Put baby down while they\'re still calm but not yet unconscious.',
      'Give them a minute or two to settle on their own before intervening.',
    ] },

  { id: 'white_noise', term: 'White Noise', category: 'sleep',
    short: 'Steady background sound used to help babies sleep by covering up sudden household noises.',
    long: 'White noise copies the whooshing sounds babies heard in the womb. It can help some babies fall asleep and stay asleep by masking sudden noises like doors or siblings. But there\'s a real safety issue: some sound machines get loud enough to actually risk hearing damage if used the wrong way. The American Academy of Pediatrics has specific safety guidance for this.',
    steps: [
      'Keep the volume at 50 decibels or lower — roughly as loud as a quiet shower.',
      'Place the machine at least 7 feet away from your baby\'s crib, not right next to their head.',
      'Use it mainly to help baby fall asleep, not running at full volume all night nonstop.',
      'If your machine doesn\'t show decibel levels, keep it noticeably quieter than you\'d think you need — err on the side of too quiet.',
    ],
    sources: [
      { label: '"Hazardous Sound Outputs of White Noise Devices Intended for Infants" — PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/33992973/' },
    ] },

  { id: 'swaddling', term: 'Swaddling', category: 'sleep',
    short: 'Wrapping your baby snugly in a blanket to help them feel calm and sleep better.',
    long: 'Swaddling recreates the snug feeling of the womb and can calm the startle (Moro) reflex that often wakes babies up. Done correctly, the AAP says it\'s a safe and effective calming tool. Done incorrectly, it can raise the risk of hip problems, or, once your baby can roll, suffocation — so how you swaddle matters as much as whether you do it.',
    steps: [
      'Keep it snug around the chest and arms, but loose around the hips and legs — baby\'s legs should be able to bend up and out, like a frog.',
      'Never swaddle the legs straight and tight — this can raise the risk of hip dislocation or hip dysplasia over time.',
      'Stop swaddling arms-in as soon as your baby shows any sign of trying to roll over, usually around 2 to 3 months.',
      'Switch to a sleep sack or arms-out swaddle instead — never let a baby who can roll sleep in an arms-in swaddle.',
    ],
    sources: [
      { label: 'HealthyChildren.org — "Swaddling: Is it Safe for Your Baby?"', url: 'https://www.healthychildren.org/English/ages-stages/baby/diapers-clothing/Pages/Swaddling-Is-it-Safe.aspx' },
    ] },

  { id: 'witching_hour', term: 'Witching Hour', category: 'sleep',
    short: 'A predictable stretch of intense evening fussiness, common in the first few months.',
    long: 'The witching hour usually starts around 2 weeks old, peaks around 6 to 8 weeks, and settles down by 3 to 4 months. It\'s not one single cause — cluster feeding, a dip in your milk supply as prolactin naturally drops in the evening, overstimulation from a full day of new sights and sounds, and general overtiredness can all pile up at once. It\'s exhausting, but it\'s temporary and it\'s not a sign anything is wrong.',
    steps: [
      'Expect it and plan around it — have water, snacks, and anything you need within reach before the evening hits.',
      'Try babywearing or gentle motion — a change of environment, like a walk or a different room, sometimes helps.',
      'Dim the lights and cut down on stimulation in the evening rather than adding more.',
      'Trade off with a partner or support person for part of the stretch if you can.',
    ] },

  { id: 'sleep_associations', term: 'Sleep Associations', category: 'sleep',
    short: 'Whatever your baby is used to happening right before they fall asleep — and expects again every time they wake between sleep cycles.',
    long: 'Babies naturally wake briefly between sleep cycles all night — everyone does. Whether they can get themselves back to sleep or need you depends on what they\'ve learned sleep "requires." If a baby always falls asleep nursing, being rocked, or with a pacifier put back in by you, they\'ll often need that same thing to fall back asleep in the middle of the night too. Some associations are fine to keep if they\'re working for your family; others, like needing to be held for every sleep, get harder to sustain as babies get bigger and sleep less often.',
    aliases: ['sleep association', 'sleep props'],
    steps: [
      'Notice what\'s actually happening right as your baby falls asleep — that\'s likely their sleep association.',
      'Decide which associations you\'re fine keeping and which ones you\'d like to change.',
      'If changing one, shift it gradually — for example, moving from nursing-to-sleep to nursing-then-put-down-drowsy.',
      'Be consistent — a sleep association only changes with repetition, not a single night.',
    ] },

  { id: 'split_nights', term: 'Split Nights', category: 'sleep',
    short: 'When a baby wakes for a long stretch in the middle of the night — sometimes an hour or more — and seems wide awake, not just fussing.',
    long: 'A split night is different from a typical brief night waking. Your baby seems genuinely ready to play or be up, often right in the middle of the night. It\'s most common during sleep regressions, especially the 4-month one, or after a schedule change like dropping a nap too early. It\'s frustrating but usually short-lived.',
    aliases: ['split night'],
    steps: [
      'Keep the room dark and interactions boring — no lights, no play, low voices.',
      'Avoid an early bedtime shift or an extra nap the next day, which can make split nights worse, not better.',
      'Check total daytime sleep — often a split night means a nap has changed and daytime sleep needs adjusting.',
      'Give it several days before making a bigger schedule change — many split nights resolve on their own.',
    ] },

  { id: 'nap_transitions', term: 'Nap Transitions', category: 'sleep',
    short: 'The gradual process of dropping from more naps to fewer as a baby gets older.',
    long: 'Babies move from needing several short naps a day as newborns down to one nap by around 15 to 18 months, usually dropping the extra ones (4-to-3, 3-to-2, 2-to-1) over a period of weeks, not overnight. Signs a baby\'s ready: consistently fighting a nap, taking much longer to fall asleep at nap time, or one nap starting to push bedtime too late.',
    aliases: ['nap transition'],
    steps: [
      'Watch for the pattern being consistent for at least 1 to 2 weeks, not just one off day.',
      'Drop naps gradually — try every-other-day first before dropping a nap completely.',
      'Expect some rockiness for a couple of weeks as your baby\'s body adjusts to the new rhythm.',
      'Shift bedtime earlier temporarily if the new schedule leaves your baby overtired by evening.',
    ] },

  { id: 'circadian_rhythm', term: 'Circadian Rhythm (in babies)', category: 'sleep',
    short: 'Your baby\'s internal day-night clock — it takes a few months to actually develop.',
    long: 'Newborns are basically born without one; that\'s why they sleep in scattered chunks around the clock at first. Around 6 weeks, babies start producing their own melatonin (the hormone that signals it\'s nighttime), and by about 3 months, that production starts syncing to actual daylight. This is part of why sleep naturally starts consolidating into longer nighttime stretches around 3 to 4 months — it\'s biological development, not something you did or didn\'t do.',
    aliases: ['circadian rhythm'],
    steps: [
      'Get natural light exposure during the day, especially in the morning.',
      'Keep the room dark and quiet at night, and dim the lights in the evening.',
      'Don\'t expect real day-night sleep patterns before about 6 to 12 weeks — it develops on its own timeline.',
    ],
    sources: [
      { label: '"Development of Circadian Rhythms in a Human Infant" — Sleep (Oxford Academic)', url: 'https://academic.oup.com/sleep/article-pdf/22/3/303/13661327/sleep-22-3-303.pdf' },
    ] },

  { id: 'nightweaning', term: 'Nightweaning', category: 'sleep',
    short: 'Stopping night feeds so your baby, and you, sleep for longer stretches without eating.',
    long: 'Nightweaning is about ending overnight feeds specifically — it\'s different from full weaning, and you can keep breastfeeding or bottle-feeding during the day. It\'s usually only considered after about 4 to 6 months, once a baby is getting enough calories during the day and has no medical reason to need overnight feeds. Check with your pediatrician first, especially for younger or smaller babies.',
    aliases: ['night weaning'],
    steps: [
      'Check with your pediatrician that your baby is developmentally ready and gaining weight well.',
      'Gradually shorten night feeds over several nights instead of stopping all at once.',
      'Have a partner or support person handle wake-ups for a few nights, since a baby will often skip fighting for a feed with someone who doesn\'t have milk.',
      'Offer extra calories during the day to make up for what\'s being dropped at night.',
    ] },

  // FEEDING
  { id: 'blw', term: 'Baby Led Weaning (BLW)', category: 'feeding',
    short: 'Skipping purees and starting solids with soft finger foods, letting baby feed themselves from the start.',
    long: 'Popularized by Gill Rapley. Babies pick up appropriately sized soft foods and feed themselves instead of being spoon-fed. You can start around 6 months once your baby shows readiness signs. Gagging is normal and different from choking — gagging pushes food forward and is a safety reflex; choking is silent or blocks breathing. Research does link BLW to a real risk of low iron if you\'re not deliberate about including iron-rich foods, since babies often eat less volume at first than they would from a spoon.',
    aliases: ['baby-led weaning', 'BLW'],
    steps: [
      'Check readiness: sitting well with little support, good head control, and real interest in food.',
      'Offer soft, stick-shaped pieces about the size of an adult finger — easy for a baby to grip and gum.',
      'Always include an iron-rich food at meals (meat, lentils, iron-fortified cereal), since BLW babies can get less iron than expected otherwise.',
      'Stay within arm\'s reach the whole time, and learn the difference between gagging (normal, noisy, pushes food out) and choking (silent, needs help).',
      'Let your baby lead — don\'t put food in their mouth for them.',
    ],
    sources: [
      { label: '"Baby-Led Weaning vs Traditional Spoon-Feeding" — systematic review, Nutrition Reviews', url: 'https://academic.oup.com/nutritionreviews/advance-article/doi/10.1093/nutrit/nuaf288/8424368' },
    ] },

  { id: 'purees', term: 'Purees / Spoon Feeding', category: 'feeding',
    short: 'The traditional way of introducing solids: smooth, blended food fed with a spoon.',
    long: 'Single-ingredient purees (sweet potato, peas, pears) are usually introduced one at a time, starting around 4 to 6 months depending on readiness, then gradually made thicker and chunkier as your baby develops. Some families do a mix of purees and finger foods. Neither purees nor baby-led weaning is proven better overall — a systematic review found no major difference in choking risk or growth between the two when done safely — so the right choice really is just whatever works for your family.',
    aliases: ['purees', 'puree', 'spoon feeding', 'spoon-feeding'] },

  { id: 'responsive_feeding', term: 'Responsive Feeding', category: 'feeding',
    short: 'Feeding based on your baby\'s hunger and fullness cues, not a fixed schedule.',
    long: 'The AAP recommends this specifically for newborns: watch for cues like rooting, sucking on hands, or fussing, and feed then, rather than watching the clock. Frequent feeding this way (usually 8 to 10+ times a day for newborns) actually helps prevent excess weight loss and jaundice, and helps establish milk supply for breastfeeding parents. It also teaches babies to notice their own hunger and fullness, which research links to healthier eating habits later on. Most families naturally shift toward a loose schedule by 3 to 4 months as patterns emerge on their own.',
    sources: [
      { label: 'AAP — "Responsive Feeding" fact sheet', url: 'https://downloads.aap.org/AAP/PDF/AAP-Responsive-Feeding_Print-Fact-Sheet.pdf' },
    ] },

  { id: 'cluster_feeding', term: 'Cluster Feeding', category: 'feeding',
    short: 'When a baby feeds very frequently over a short stretch, often in the evening.',
    long: 'Cluster feeding is when a baby nurses or bottle-feeds every 30 to 60 minutes for a few hours, usually in the late afternoon or evening. There\'s a real hormonal reason for the evening timing: prolactin, the hormone behind milk production, naturally dips in the evening, so babies nurse more to keep supply matched to their needs — plus a separate pull toward comfort before a longer overnight sleep stretch. For breastfeeding parents, frequent removal of milk is actually the mechanism that increases supply, not a sign supply is failing. It commonly shows up around growth spurts, loosely around 2 to 3 weeks, 6 weeks, and 3 months, and most stretches last 1 to 3 days, not weeks.',
    sources: [
      { label: 'Daly & Hartmann, "Infant Demand and Milk Supply" — Journal of Human Lactation (1995)', url: 'https://journals.sagepub.com/doi/abs/10.1177/089033449501100119' },
    ] },

  { id: 'paced_bottle', term: 'Paced Bottle Feeding', category: 'feeding',
    short: 'A bottle-feeding technique that mimics breastfeeding by letting your baby control the pace.',
    long: 'Instead of tilting the bottle up and letting gravity do the work, you hold it more level and let your baby actively suck the milk out, taking breaks along the way. Research shows this genuinely slows down the feed — one study found it stretched an average feed from about 15.5 to 18.9 minutes — and it\'s thought to help babies better regulate how much they eat, though studies haven\'t clearly proven yet that it reduces total intake. It also makes switching between breast and bottle easier for breastfeeding families.',
    aliases: ['paced feeding', 'paced bottle-feeding'],
    steps: [
      'Hold the bottle horizontally, not tilted up, so your baby has to actively suck rather than having milk poured in.',
      'Use a slow-flow nipple appropriate for your baby\'s age.',
      'Pause every so often — tip the bottle down slightly so milk stops flowing — and let baby take a break.',
      'Watch for done signs: relaxed hands, slower sucking, turning away — and stop, even if the bottle isn\'t empty.',
    ] },

  { id: 'nipple_confusion', term: 'Nipple Confusion', category: 'feeding',
    short: 'The idea that switching between breast and bottle can disrupt a baby\'s latch or feeding preference.',
    long: 'This one is genuinely debated among researchers. Some experts believe it\'s a real risk because sucking mechanics are different — bottles flow with far less effort than breastfeeding requires. But the actual research is mixed and hasn\'t clearly proven bottles or pacifiers cause babies to prefer them over the breast — it\'s hard to tell whether a bottle causes feeding problems, or whether a baby already having trouble breastfeeding is just more drawn to the easier bottle. Because the evidence isn\'t settled, many lactation consultants still recommend waiting a few weeks before introducing a bottle if you\'re working to establish breastfeeding, just to be safe.',
    sources: [
      { label: '"Clarifying Nipple Confusion" — Journal of Perinatology', url: 'https://www.nature.com/articles/jp201583' },
    ] },

  { id: 'nursing_strike', term: 'Nursing Strike', category: 'feeding',
    short: 'When a baby who has been breastfeeding well suddenly refuses to nurse.',
    long: 'This is different from self-weaning, which happens gradually and usually after 12 months. A strike is sudden and can be caused by teething, an ear infection, a cold, a new scent (like a new lotion or deodorant), or a change in how your milk tastes. Most strikes last a few days to about a week.',
    steps: [
      'Keep offering the breast in a calm, quiet, low-pressure setting.',
      'Pump or hand-express to protect your milk supply while your baby isn\'t nursing.',
      'Try extra skin-to-skin contact to rebuild the connection.',
      'Check for anything physical going on — a new tooth, ear pain, or congestion — that could be making nursing uncomfortable.',
      'Contact an IBCLC (lactation consultant) if it goes on longer than a week.',
    ] },

  { id: 'combo_feeding', term: 'Combination Feeding', category: 'feeding',
    short: 'Feeding your baby both breast milk and formula.',
    long: 'Families combo feed for lots of reasons — low supply, returning to work, mental health, or personal preference — and it\'s a completely valid, healthy choice. One thing worth knowing: supplementing with formula can reduce your milk supply over time if you\'re not also pumping or nursing to replace the skipped breastfeeding sessions, since supply works on a use-it-or-lose-it basis. An IBCLC can help you figure out a combination that\'s sustainable for your specific situation.',
    aliases: ['combo feeding'] },

  { id: 'demand_feeding', term: 'On-Demand Feeding', category: 'feeding',
    short: 'Feeding whenever your baby signals hunger, instead of on a set schedule.',
    long: 'This is the AAP\'s actual recommendation for newborns: feed at least 8 to 10 times in 24 hours, led by your baby\'s cues (rooting, sucking on hands, hands to mouth) rather than the clock. It helps establish and maintain milk supply for breastfeeding, and research links it to lower rates of excess newborn weight loss and jaundice. Reading hunger cues before they escalate to crying makes feeds easier for both of you. Many families naturally shift to a looser routine by 3 to 4 months as patterns emerge.',
    aliases: ['on-demand feeding', 'demand feeding'],
    sources: [
      { label: 'AAP — "Responsive Feeding" fact sheet', url: 'https://downloads.aap.org/AAP/PDF/AAP-Responsive-Feeding_Print-Fact-Sheet.pdf' },
    ] },

  { id: 'formula_feeding', term: 'Formula Feeding', category: 'feeding',
    short: 'Feeding your baby infant formula instead of, or alongside, breast milk.',
    long: 'Formula is a complete, safe, nutritionally adequate way to feed a baby — the FDA regulates it closely, and it\'s a legitimate choice, not a fallback. Some studies find small differences favoring breastfeeding on certain outcomes, but a well-known 2014 study that compared siblings within the same family (one breastfed, one formula-fed) found most of those differences shrank to nearly nothing once you control for the family and social factors that also predict who breastfeeds — suggesting a lot of the commonly cited "benefits" are overstated. Preparation safety is the main thing that actually matters with formula, since it involves water and equipment that breast milk doesn\'t.',
    aliases: ['formula-fed', 'formula fed'],
    steps: [
      'Wash your hands and sanitize bottles and nipples before preparing formula.',
      'Use water from a safe source, and follow the mixing instructions on the label exactly — don\'t water it down or make it more concentrated.',
      'If mixing powdered formula for a baby under 3 months, premature, or with a weakened immune system, use water hotter than 158°F (70°C) to kill any bacteria the powder can contain, then cool it before feeding.',
      'Use prepared formula within 2 hours at room temperature, or within 24 hours if refrigerated right away.',
      'Never microwave a bottle — it heats unevenly and can burn your baby\'s mouth even if the outside feels fine.',
    ],
    sources: [
      { label: 'Colen & Ramey, "Is Breast Truly Best?" — Social Science & Medicine (2014)', url: 'https://pubmed.ncbi.nlm.nih.gov/24698713/' },
      { label: 'CDC — Infant Formula Preparation and Storage', url: 'https://www.cdc.gov/infant-toddler-nutrition/formula-feeding/preparation-and-storage.html' },
    ] },

  { id: 'allergen_introduction', term: 'Food Allergies / Allergen Introduction', category: 'feeding',
    short: 'Introducing common allergy-causing foods early, rather than delaying them, to actually lower your baby\'s risk of developing an allergy.',
    long: 'This is a genuine, fairly recent flip in official guidance, based on one landmark study. Researchers randomly assigned high-risk infants (with severe eczema or egg allergy) to either eat peanut regularly starting between 4 and 11 months, or avoid it until age 5. The babies who ate peanut early had substantially lower rates of peanut allergy, and the protection held up even a year after the study ended. That single trial is why the advice changed from delaying allergens to introducing them early and often.',
    aliases: ['food allergies', 'food allergy', 'allergen introduction', 'introducing allergens', 'peanut allergy'],
    steps: [
      'Introduce common allergens (peanut, egg, dairy, tree nuts, soy, wheat, fish, shellfish) starting around 6 months, alongside other first foods.',
      'If your baby has severe eczema or an egg allergy, ask your pediatrician about starting peanut as early as 4 months.',
      'Introduce one new allergen at a time, in a small amount first.',
      'Watch for a reaction (hives, vomiting, swelling, trouble breathing) for a couple of hours after.',
      'Keep offering the food regularly once it\'s tolerated — occasional exposure doesn\'t have the same protective effect as regular exposure.',
    ],
    sources: [
      { label: 'Du Toit et al., "Randomized Trial of Peanut Consumption in Infants at Risk for Peanut Allergy" — NEJM (2015)', url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa1414850' },
    ] },

  { id: 'extrusion_reflex', term: 'Extrusion Reflex (Tongue-Thrust Reflex)', category: 'feeding',
    short: 'A newborn reflex that automatically pushes anything placed on the tongue back out of the mouth.',
    long: 'This reflex protects young babies from choking on anything that isn\'t milk. It\'s also why trying to spoon-feed a baby too early usually just ends with food pushed back out — it\'s not the baby rejecting the food, it\'s a reflex they don\'t control yet. It typically fades around 4 to 6 months, which is part of why that\'s the general window pediatricians look for when checking if a baby is ready for solids.',
    aliases: ['tongue-thrust reflex', 'extrusion reflex', 'tongue thrust reflex'] },

  // BREASTFEEDING
  { id: 'latch', term: 'Latch', category: 'breastfeeding',
    short: 'How your baby attaches to your breast during nursing.',
    long: 'A good latch means your baby has a large mouthful of breast tissue, not just the nipple, with their chin touching the breast and their nose free. It should feel like a strong tug at first, not sharp ongoing pain — real pain past the first few seconds usually means something\'s off. An IBCLC (lactation consultant) can watch a feed and fix latch issues, and it\'s genuinely worth the visit if something feels wrong.',
    steps: [
      'Bring baby to the breast, not the breast to baby — line up nose to nipple.',
      'Wait for a wide open mouth, like a yawn, before latching, not a small open mouth.',
      'Aim your nipple toward the roof of their mouth so they take in a big mouthful of breast, not just the nipple.',
      'Check: chin touching the breast, nose free to breathe, more of the areola visible above their top lip than below their bottom lip.',
      'Listen for swallowing — a rhythmic suck-suck-swallow pattern means milk is actually transferring.',
    ] },

  { id: 'letdown', term: 'Letdown Reflex', category: 'breastfeeding',
    short: 'The release of milk from your breast when you nurse or pump.',
    long: 'Letdown happens because of oxytocin, released when your baby latches, when you pump, or sometimes just from thinking about your baby. It usually feels like a tingling, pressure, or warmth, and you can have more than one letdown in a single feed. Stress, pain, or anxiety can actually block letdown, which is part of why a calm environment helps when pumping feels stuck.',
    aliases: ['letdown', 'milk ejection reflex'],
    steps: [
      'Look at a photo or video of your baby, or hold something that smells like them.',
      'Apply a warm compress to your breast for a couple of minutes before pumping.',
      'Try gentle breast massage in a circular motion.',
      'Relax your shoulders and breathe slowly — stress genuinely can block letdown.',
    ] },

  { id: 'foremilk_hindmilk', term: 'Foremilk & Hindmilk', category: 'breastfeeding',
    short: 'The way your milk\'s fat content naturally changes over the course of one feed.',
    long: 'Foremilk, early in a feed, is thinner and more watery; the milk gets creamier and higher in fat as the feed goes on, often called "hindmilk." Research from lactation physiologist Peter Hartmann\'s group found this isn\'t actually two separate types of milk — it\'s a gradual spectrum, driven mainly by how empty the breast is, not by time. The old idea that a baby "must get to the hindmilk" is outdated. What actually matters is letting your baby finish one breast fully before offering the other, rather than switching sides too early.',
    aliases: ['foremilk', 'hindmilk'],
    sources: [
      { label: '"Is Increased Fat Content of Hindmilk Due to the Size or the Number of Milk Fat Globules?" — PMC', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2717917/' },
    ] },

  { id: 'mastitis', term: 'Mastitis', category: 'breastfeeding',
    short: 'Inflammation or infection of breast tissue that causes pain, swelling, redness, and flu-like symptoms.',
    long: 'Symptoms include a hard, red, painful area of the breast, a fever over 101°F, and body aches. The official treatment guidance actually changed in 2022: doctors now describe mastitis as a spectrum, from simple inflammation up through infection and abscess, and some of the old advice — aggressive massage and extra pumping to "clear it" — is no longer recommended, because overstimulating milk production can make the swelling worse, not better. Untreated bacterial mastitis can progress to a breast abscess, so contact your provider if symptoms don\'t improve within a day or two — antibiotics are often needed for the infected end of the spectrum.',
    steps: [
      'Keep breastfeeding or pumping at your normal frequency — don\'t pump extra "to clear it," which can make things worse.',
      'Use ice, not heat — heat can actually worsen swelling. A recent trial found warm showers didn\'t help.',
      'If massaging, use light, gentle strokes toward your armpit (lymphatic drainage), not deep or aggressive massage.',
      'Rest and stay hydrated.',
      'Call your provider if you have a fever, red streaking, or symptoms haven\'t improved in 24 to 48 hours — you may need antibiotics.',
    ],
    sources: [
      { label: 'Academy of Breastfeeding Medicine — Clinical Protocol #36: The Mastitis Spectrum (Revised 2022)', url: 'https://pubmed.ncbi.nlm.nih.gov/35576513/' },
    ] },

  { id: 'engorgement', term: 'Engorgement', category: 'breastfeeding',
    short: 'When your breasts become overly full, hard, and painful, usually in the first days after birth.',
    long: 'Engorgement commonly happens on days 2 to 5 postpartum when your milk "comes in" in fuller volume. The breast can feel tight and hard enough that it\'s difficult for your baby to latch. It typically resolves within a few days as your supply regulates to match your baby\'s actual needs.',
    steps: [
      'Nurse or pump frequently rather than skipping feeds to "let it build up."',
      'Use hand expression or a warm compress right before feeding to soften the area around the nipple, making it easier to latch.',
      'Use cold compresses after feeding to reduce swelling and pain.',
      'If your breast is too firm for baby to latch, hand-express just enough milk to soften it first.',
    ] },

  { id: 'oversupply', term: 'Oversupply', category: 'breastfeeding',
    short: 'Producing significantly more milk than your baby actually needs.',
    long: 'It sounds like a good problem, but oversupply can cause a forceful letdown that makes your baby choke, pull off, or gulp air, plus a gassy, fussy baby and frequent plugged ducts or mastitis. An IBCLC can help you develop a plan, since fixing it usually means gradually reducing stimulation, not stopping nursing.',
    steps: [
      'Try block feeding: nurse from just one breast for a set window of time, like 3 to 4 hours, before switching.',
      'Nurse in a laid-back position so gravity slows the flow.',
      'Avoid extra pumping "just in case" — it signals your body to make even more milk.',
      'Only pump for comfort, not to fully empty, if you\'re engorged between block-feeding sessions.',
    ] },

  { id: 'low_supply', term: 'Low Milk Supply', category: 'breastfeeding',
    short: 'Producing less milk than your baby actually needs.',
    long: 'True low supply is less common than most parents fear — a lot of perceived low supply turns out to be unfounded once you actually check the signs. Real low supply can be caused by infrequent nursing, a poor latch, supplementing too early, or a hormonal issue. Signs your baby IS getting enough: 6 or more wet diapers a day, steady weight gain, and seeming content after feeds.',
    aliases: ['low supply'],
    steps: [
      'Nurse or pump more frequently — supply responds to how often milk is removed, not how much time passes between feeds.',
      'Get your latch checked by an IBCLC — a poor latch means less milk actually transfers even if you\'re feeding often.',
      'Try power pumping for a few days if you want to boost supply specifically.',
      'Track wet diapers and weight gain with your pediatrician rather than just going on how full your breasts feel.',
    ] },

  { id: 'power_pumping', term: 'Power Pumping', category: 'breastfeeding',
    short: 'A pumping pattern that mimics cluster feeding, meant to signal your body to make more milk.',
    long: 'The idea is to copy the way a baby cluster feeds during a growth spurt, since frequent milk removal is the actual mechanism that increases supply — the more often milk is removed, the more your body ramps up production. Done once or twice a day for several days, results usually show up within 3 to 7 days. It works best alongside your regular feeding or pumping schedule, not instead of it.',
    steps: [
      'Pump for 20 minutes.',
      'Rest for 10 minutes.',
      'Pump for 10 minutes.',
      'Rest for 10 minutes.',
      'Pump for 10 more minutes. That\'s one hour total.',
      'Repeat once or twice a day for 3 to 7 days.',
    ],
    sources: [
      { label: 'Daly & Hartmann, "Infant Demand and Milk Supply" — Journal of Human Lactation (1995)', url: 'https://journals.sagepub.com/doi/abs/10.1177/089033449501100119' },
    ] },

  { id: 'milk_storage', term: 'Milk Storage Guidelines', category: 'breastfeeding',
    short: 'How long pumped breast milk stays safe at different temperatures.',
    long: 'These are the CDC\'s official numbers. They assume milk was expressed cleanly and stored right after pumping — things like room temperature and how full the container is can affect the actual safe window.',
    aliases: ['milk storage'],
    steps: [
      'Freshly pumped milk at room temperature (77°F or colder): good for up to 4 hours.',
      'Freshly pumped milk in the fridge: good for up to 4 days.',
      'Freshly pumped milk in a freezer: good for up to 6 months (up to 12 months in a deep freezer).',
      'Thawed milk that was previously frozen: 1 to 2 hours at room temperature, or up to 24 hours in the fridge — don\'t refreeze it.',
      'Milk left over from a bottle your baby didn\'t finish: use within 2 hours, then discard.',
      'Store milk toward the back of the fridge or freezer, not in the door, where temperature swings the most.',
    ],
    sources: [
      { label: 'CDC — "Proper Storage and Preparation of Breast Milk"', url: 'https://www.cdc.gov/breastfeeding/pdf/humanmilk-en-4x6-508.pdf' },
    ] },

  { id: 'pumping_at_work', term: 'Pumping at Work', category: 'breastfeeding',
    short: 'Your legal right to time and space to pump breast milk during your workday.',
    long: 'The PUMP Act, signed into law in 2022, expanded on the Fair Labor Standards Act: most employees have the right to reasonable break time and a private space, not a bathroom, to pump, for up to a year after your baby is born. There\'s a hardship exemption for businesses with 50 or fewer employees, but the baseline right covers the large majority of the US workforce.',
    aliases: ['PUMP Act', 'pump at work'],
    steps: [
      'You\'re entitled to a space that\'s private and shielded from view — not a bathroom.',
      'You\'re entitled to reasonable break time each time you need to pump, not just at set break times.',
      'Talk to HR before you return, ideally, so a space and schedule are already sorted out.',
      'If your employer denies a needed pumping break or space, you can file a complaint with the US Department of Labor\'s Wage and Hour Division.',
    ],
    sources: [
      { label: 'US Department of Labor — "FLSA Protections to Pump at Work" (PUMP Act)', url: 'https://www.dol.gov/agencies/whd/pump-at-work' },
    ] },

  { id: 'galactagogues', term: 'Galactagogues', category: 'breastfeeding',
    short: 'Foods, herbs, or medications believed to increase milk supply.',
    long: 'Fenugreek is the most-studied one, and the evidence is genuinely mixed — some reviews find a mild effect, others find no good evidence it works at all, and it can occasionally decrease supply or cause side effects for some people. Oatmeal and other traditional "lactation foods" have even less research behind them, mostly tradition rather than clinical trials. None of this means they\'re harmful to try, but if supply is a real concern, addressing the more proven levers — how often milk is removed, latch quality, power pumping — tends to matter more than any specific food or supplement.',
    aliases: ['galactagogue'],
    sources: [
      { label: 'Fenugreek — LactMed (Drugs and Lactation Database)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK501779/' },
      { label: 'La Leche League International — "Selection and Use of Galactagogues"', url: 'https://llli.org/news/selection-and-use-of-galactagogues-2/' },
    ] },

  // PARENTING STYLES
  { id: 'attachment_parenting', term: 'Attachment Parenting', category: 'parenting',
    short: 'A parenting philosophy built around close physical and emotional connection with your baby.',
    long: 'Developed by pediatrician Dr. William Sears and his wife Martha, starting with his 1982 book Creative Parenting and later linked explicitly to attachment theory in 1985. It\'s built around what they called the "7 Bs": birth bonding, breastfeeding, babywearing, bedding close to baby (or bed-sharing), belief in your baby\'s cries, balance, and beware of baby trainers. The idea is that consistently meeting a baby\'s needs builds a secure foundation. You don\'t need to do all 7 — it\'s meant to be adapted to your family.' },

  { id: 'gentle_parenting', term: 'Gentle Parenting', category: 'parenting',
    short: 'A parenting approach that leads with empathy and connection instead of punishment.',
    long: 'Popularized by writers including Sarah Ockwell-Smith, and draws on ideas from psychiatrist Dr. Dan Siegel\'s work on child brain development. It\'s not the same as permissive parenting — real boundaries still exist, just enforced with empathy rather than control. One honest thing worth knowing: "gentle parenting" as its own specific brand doesn\'t have much direct research behind it yet, since it\'s a relatively new term. It overlaps heavily with authoritative parenting, though, which does have decades of solid research behind it — so the underlying principles (warmth plus real limits) are well-supported even if the specific label is newer.' },

  { id: 'authoritative', term: 'Authoritative Parenting', category: 'parenting',
    short: 'A parenting style combining clear expectations with real warmth.',
    long: 'This comes from psychologist Diana Baumrind\'s research in the 1960s, who identified it as one of three original parenting styles alongside authoritarian (high control, low warmth) and permissive (high warmth, low control). Decades of follow-up research consistently link authoritative parenting to better academic outcomes, higher self-esteem, and fewer behavior problems compared to the other styles. One honest caveat: Baumrind\'s original research was based on white, middle-class California families, and later research — including a well-known 1994 study comparing Chinese and American parenting — found the framework doesn\'t map perfectly onto every culture. What counts as "warm" or "controlling" looks different in different families and communities.',
    aliases: ['authoritative'],
    steps: [
      'Explain the reasoning behind a rule instead of just enforcing it.',
      'Listen to your child\'s perspective, even when the answer doesn\'t change.',
      'Follow through consistently rather than negotiating a boundary down under pressure.',
      'Combine real warmth with real limits — neither one alone is what the research points to.',
    ],
    sources: [
      { label: 'Baumrind — original parenting styles research (1966, 1971), summarized', url: 'https://www.devpsy.org/teaching/parent/baumrind_parenting_styles.pdf' },
      { label: 'Chao, "Beyond Parental Control and Authoritarian Parenting Style" — Child Development (1994)', url: 'https://pubmed.ncbi.nlm.nih.gov/7956468/' },
    ] },

  { id: 'rie', term: 'RIE (Resources for Infant Educarers)', category: 'parenting',
    short: 'A philosophy that treats even young infants as capable people who deserve respect and unstructured play.',
    long: 'Developed by Magda Gerber, based partly on her work with pediatrician Emmi Pikler. RIE (pronounced "rye") holds that babies are competent and curious, and learn best through self-directed play rather than being constantly directed or entertained. Key ideas: narrate what you\'re doing during care routines like diaper changes, ask before picking your baby up, give uninterrupted floor time, and trust your baby to communicate rather than assuming you always know best. It\'s popular among child development professionals and emphasizes slowing down and observing before jumping in.',
    aliases: ['RIE'] },

  { id: 'free_range', term: 'Free-Range Parenting', category: 'parenting',
    short: 'Giving kids age-appropriate independence and room to take reasonable risks.',
    long: 'Popularized by journalist Lenore Skenazy after a 2008 newspaper column about letting her 9-year-old ride the New York City subway alone, which got her labeled "America\'s Worst Mom" and led her to start the Free-Range Kids movement. The philosophy pushes back on constant supervision, arguing kids need some risk, boredom, and independence to build real resilience. It\'s not about neglect — it\'s about calibrating supervision to the actual statistical risk of something happening, rather than a worst-case-scenario fear.',
    aliases: ['free-range', 'free range parenting'] },

  { id: 'helicopter', term: 'Helicopter Parenting', category: 'parenting',
    short: 'Over-involved parenting that hovers over kids and manages their experiences for them.',
    long: 'The image goes back to psychologist Haim Ginott\'s 1969 book Between Parent & Teenager, where a teenager complains his mother "hovers over me like a helicopter." The specific term "helicopter parent" was coined later, in 1990, by child development researchers Foster Cline and Jim Fay. It describes solving problems for your child, trying to prevent all failure, and managing every interaction — and research links it to kids having a harder time developing independence and resilience on their own. The real challenge is telling the difference between appropriate guidance and over-involvement, which isn\'t always obvious in the moment.',
    aliases: ['helicopter parent', 'helicopter parenting'] },

  { id: 'peaceful_parenting', term: 'Peaceful Parenting', category: 'parenting',
    short: 'A parenting approach focused on managing your own emotions before responding to your child\'s.',
    long: 'Associated with psychologist Dr. Laura Markham. The idea is built on three steps: regulate yourself first, connect with your child, then coach them, rather than jumping straight to control. It leans on the idea that a lot of what triggers parents in the moment traces back to their own childhood experiences, and that the overall relationship you build over time matters more than getting any single moment right.' },

  { id: 'authoritarian', term: 'Authoritarian Parenting', category: 'parenting',
    short: 'A parenting style with strict rules and low warmth — high control, low responsiveness.',
    long: 'One of psychologist Diana Baumrind\'s original three parenting styles, alongside authoritative and permissive. Authoritarian parents expect obedience without much explanation or negotiation, often relying on punishment rather than dialogue. Research generally links this style to worse outcomes than authoritative parenting, including lower self-esteem and more behavior problems — though later research found this doesn\'t hold true the same way in every culture. In some cultural contexts, a similarly controlling approach paired with high involvement doesn\'t show the same negative associations as the Western authoritarian label suggests.',
    aliases: ['authoritarian'],
    sources: [
      { label: 'Baumrind — original parenting styles research (1966, 1971), summarized', url: 'https://www.devpsy.org/teaching/parent/baumrind_parenting_styles.pdf' },
      { label: 'Chao, "Beyond Parental Control and Authoritarian Parenting Style" — Child Development (1994)', url: 'https://pubmed.ncbi.nlm.nih.gov/7956468/' },
    ] },

  { id: 'permissive', term: 'Permissive Parenting', category: 'parenting',
    short: 'A parenting style with lots of warmth but few rules or limits.',
    long: 'The second of Diana Baumrind\'s original three parenting styles: high warmth and responsiveness, but low demands and few consistent limits. Permissive parents tend to avoid confrontation and let kids largely self-regulate. Research generally links this style to more difficulty with self-control and following rules outside the home, compared to authoritative parenting, which combines that same warmth with real, consistent limits.',
    aliases: ['permissive'],
    sources: [
      { label: 'Baumrind — original parenting styles research (1966, 1971), summarized', url: 'https://www.devpsy.org/teaching/parent/baumrind_parenting_styles.pdf' },
    ] },

  { id: 'uninvolved', term: 'Uninvolved / Neglectful Parenting', category: 'parenting',
    short: 'A parenting style low on both warmth and structure.',
    long: 'Added in 1983 by psychologists Eleanor Maccoby and John Martin to complete Baumrind\'s original three-style framework into a full four-style grid. Uninvolved parents provide little emotional engagement and little guidance or structure. Of the four styles, this one is the most consistently linked to difficulty across the board — poor self-control, lower self-esteem, and weaker social and academic functioning. It\'s rarely intentional in the way other styles are chosen — it more often reflects a parent overwhelmed by their own stress, mental health, or circumstances than a deliberate philosophy.',
    aliases: ['uninvolved parenting', 'neglectful parenting'] },

  { id: 'positive_discipline', term: 'Positive Discipline', category: 'parenting',
    short: 'A discipline approach focused on teaching skills and mutual respect instead of punishment or rewards.',
    long: 'Rooted in the psychology of Alfred Adler and Rudolf Dreikurs from the early 20th century, and developed into its modern form by Jane Nelsen starting in the 1980s. It\'s built on the idea that misbehavior is often a child looking for a sense of belonging or significance, and that discipline works best when it\'s both kind and firm at the same time, not one or the other. Common tools include problem-solving together, natural and logical consequences, and family or class meetings.' },

  { id: 'montessori_parenting', term: 'Montessori Parenting', category: 'parenting',
    short: 'Applying Maria Montessori\'s educational philosophy — child-led learning and real independence — at home, not just in a classroom.',
    long: 'Montessori education has more rigorous research behind it than most parenting philosophies. A landmark 2006 study in the journal Science used a randomized school lottery, a genuine experiment rather than just observation, and found Montessori-educated kids did better on reading, math, social cognition, and self-control. A 2025 national trial replicated this at scale using public Montessori preschools. At home, the philosophy translates into child-sized furniture and tools, real choices within limits, and letting a child do things themselves, even slowly and imperfectly, rather than doing it for them.',
    aliases: ['Montessori'],
    sources: [
      { label: 'Montessori Science — 2025 national RCT on public Montessori preschool outcomes (PNAS)', url: 'https://www.montessori-science.org/montessori_preschool_rct_better_outcomes_lower_cost_pnas_journal.htm' },
    ] },

  // DEVELOPMENT
  { id: 'tummy_time', term: 'Tummy Time', category: 'development',
    short: 'Supervised time on your baby\'s stomach to build the strength they need to hold their head up, roll, and eventually crawl.',
    long: 'Tummy time matters more than it used to because of a tradeoff: since the "Back to Sleep" campaign taught parents to put babies on their backs to sleep, which dramatically cut SIDS deaths, babies get less natural stomach time than they used to — so tummy time while awake and supervised makes up the difference.',
    steps: [
      'Start from birth — even just a few minutes at a time counts.',
      'Build up gradually toward a goal of about 30+ minutes a day, spread across several short sessions, by 3 to 4 months.',
      'If your baby resists it, try shorter, more frequent sessions instead of one long one.',
      'Try tummy time on your chest, across your lap, or over a rolled towel or nursing pillow if flat-on-the-floor feels too hard at first.',
      'Always stay right there supervising — tummy time is awake-only, not for sleep.',
    ] },

  { id: 'object_permanence', term: 'Object Permanence', category: 'development',
    short: 'The understanding that things and people keep existing even when you can\'t see them.',
    long: 'Jean Piaget originally placed this around 8 to 12 months, based on watching whether babies would physically search for a hidden object. More recent research using a different method — measuring how long babies stare at things that seem physically "impossible" — has found babies show some understanding of this much earlier, as young as 2.5 to 5 months in some studies. The likely explanation isn\'t that Piaget was wrong exactly; his method required a motor skill (actually searching) that very young babies don\'t have yet, even if the understanding is already forming. This is part of why peekaboo is so delightful, and part of why separation anxiety tends to ramp up around the same general window.',
    sources: [
      { label: 'Simply Psychology — "Object Permanence" (Piaget & Baillargeon)', url: 'https://www.simplypsychology.org/object-permanence.html' },
    ] },

  { id: 'wonder_weeks', term: 'Wonder Weeks / Mental Leaps', category: 'development',
    short: 'A theory that fussy stretches in babies line up with predictable leaps in brain development.',
    long: 'This one is worth knowing the real story on. The theory comes from Dutch researchers Frans Plooij and Hetty van de Rijt, based on a study of just 15 babies. When one of Plooij\'s own PhD students later tried to replicate the findings with a much larger group of 66 babies, she couldn\'t find evidence for the specific "leaps" — and the situation became a real academic controversy, with Plooij trying to block her paper from being published before it eventually came out in 2011. That doesn\'t mean babies don\'t go through fussy, clingy stretches tied to development — they clearly do — but the specific, precisely-timed "10 leaps" framework doesn\'t hold up well to independent scientific scrutiny. It\'s fine to use the app or book if it helps you feel more prepared, just worth knowing it\'s more a popular framework than settled science.',
    aliases: ['Wonder Weeks', 'mental leaps'],
    sources: [
      { label: '"Let\'s Set The Record Straight, There\'s No Such Thing As \'Wonder Weeks\'" — Fatherly', url: 'https://www.fatherly.com/parenting/the-wonder-weeks-child-development-fact-check' },
      { label: '"The Wonder Weeks" — Wikipedia (documents the replication controversy)', url: 'https://en.wikipedia.org/wiki/The_Wonder_Weeks' },
    ] },

  { id: 'gross_motor', term: 'Gross Motor Skills', category: 'development',
    short: 'Big movements using large muscles — rolling, sitting, crawling, walking.',
    long: 'Development generally follows a head-to-toe order: head control, rolling, sitting, pulling to stand, cruising, walking. The research behind the official milestone ages actually changed in 2022 — the CDC updated its charts and specifically removed crawling as a required milestone, since a real study of over 800 babies across 5 countries found about 4% of healthy babies never crawl at all, moving straight from sitting to other kinds of mobility. The normal range for walking alone spans roughly 8 to 18 months — a wide window, not a deadline.',
    aliases: ['gross motor development', 'motor milestones', 'gross motor'],
    sources: [
      { label: 'WHO Motor Development Study — "Windows of Achievement for Six Gross Motor Development Milestones" (2006)', url: 'https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/motor-development-milestones/who-motor-development-study-windows-of-achievement-for-six-gross-motor-development-milestones.pdf' },
      { label: 'CDC — "Learn the Signs. Act Early." official milestone checklists', url: 'https://www.cdc.gov/act-early/milestones/index.html' },
    ] },

  { id: 'fine_motor', term: 'Fine Motor Skills', category: 'development',
    short: 'Small movements using the hands and fingers — grasping, pincer grip, self-feeding.',
    long: 'The typical progression: a whole-hand palmar grasp around 4 to 6 months, using the thumb by 6 to 7 months, an early "raking" pincer grasp around 8 months, and a refined, precise pincer grasp — thumb and pointer fingertip to fingertip — by 9 to 10 months. There\'s a genuinely surprising finding behind why this matters beyond the obvious: a well-known 2010 study found fine motor skills at kindergarten entry predicted later reading and math achievement, in some analyses even more strongly than early academic scores did. BLW and open-ended play with age-appropriate objects both support this development naturally.',
    aliases: ['fine motor development', 'fine motor'],
    sources: [
      { label: 'Grissmer et al., "Fine Motor Skills and Early Comprehension of the World" (2010)', url: 'https://asu.elsevierpure.com/en/publications/fine-motor-skills-and-early-comprehension-of-the-world-two-new-sc/' },
      { label: 'Cleveland Clinic — "Finger to Thumb: What To Know About the Pincer Grasp"', url: 'https://health.clevelandclinic.org/pincer-grasp' },
    ] },

  { id: 'sensory_play', term: 'Sensory Play', category: 'development',
    short: 'Activities that engage your baby\'s senses and support brain development.',
    long: 'During the first years, when the brain is forming new connections at its fastest rate, every new sensory experience is genuinely part of building that architecture — different textures, sounds, and sights all contribute. One thing worth knowing: general sensory play and "sensory integration therapy," a specific branded clinical treatment, are different things. The American Academy of Pediatrics found in 2012 that the evidence for sensory integration therapy specifically is "limited and inconclusive," and cautioned against using "sensory processing disorder" as a stand-alone diagnosis. That doesn\'t make everyday sensory play any less valuable — it just means marketing claims about specific "SPD-treating" products deserve some skepticism.',
    sources: [
      { label: 'AAP — "Sensory Integration Therapies for Children With Developmental and Behavioral Disorders" (2012)', url: 'https://publications.aap.org/pediatrics/article/129/6/1186/32067/Sensory-Integration-Therapies-for-Children-With' },
      { label: 'Center on the Developing Child, Harvard — "Brain Architecture"', url: 'https://developingchild.harvard.edu/key-concept/brain-architecture/' },
    ] },

  { id: 'parallel_play', term: 'Parallel Play', category: 'development',
    short: 'When toddlers play alongside each other without directly interacting.',
    long: 'This comes from Mildred Parten\'s 1932 research, which described six stages children move through as they get more social with play, from unoccupied and solitary play up through parallel, then associative, and finally cooperative play. Parallel play — playing side by side, maybe watching or copying, but not coordinating — is typical between about 18 months and 3 years, and is a normal step on the way to true cooperative play, which usually develops around ages 3 to 4. If your toddler isn\'t really "playing with" other kids yet, that\'s expected, not a red flag.',
    sources: [
      { label: 'Parten\'s stages of play — summarized', url: 'https://en.wikipedia.org/wiki/Parten%27s_stages_of_play' },
    ] },

  { id: 'separation_anxiety', term: 'Separation Anxiety', category: 'development',
    short: 'Distress when separated from a primary caregiver — normal from about 6 to 24 months.',
    long: 'Signs typically appear around 6 to 8 months, peak between 10 and 18 months, and ease by around age 2, though it\'s normal for it to resurface during stress or big transitions. One of the most reassuring findings in developmental psychology, from psychologist Mary Ainsworth\'s classic "Strange Situation" research, is that protest at separation is actually a sign of secure attachment, not a problem — securely attached babies do show distress when a caregiver leaves. What differs for securely attached babies is how easily they\'re comforted once the caregiver comes back.',
    steps: [
      'Keep goodbyes short, warm, and consistent — don\'t sneak away, even though it feels easier in the moment.',
      'Acknowledge their feelings ("I know you don\'t want me to go") rather than dismissing them.',
      'Leave confidently — babies pick up on your own anxiety about leaving.',
      'Stick to consistent routines, since predictability itself is calming.',
    ],
    sources: [
      { label: 'Ainsworth\'s Strange Situation — findings summarized', url: 'https://www.simplypsychology.org/mary-ainsworth.html' },
    ] },

  { id: 'self_regulation', term: 'Self-Regulation', category: 'development',
    short: 'The ability to manage your emotions, behavior, and attention.',
    long: 'Babies are born with essentially no ability to self-regulate — they depend completely on you to help calm them down, which is called co-regulation. This is part of why responding to cries matters: you\'re helping wire the brain\'s stress-response system. Self-regulation develops gradually because it depends on the prefrontal cortex, the brain\'s control center, which doesn\'t finish maturing until the mid-20s. This is also the real science behind why toddler tantrums aren\'t manipulation — a study that recorded and analyzed over 100 real tantrums found they\'re made of two overlapping parts (anger and distress), not one single tantrum a toddler is choosing to have at you.',
    sources: [
      { label: 'Simply Psychology — "When Does the Prefrontal Cortex Fully Develop?"', url: 'https://www.simplypsychology.org/prefrontal-cortex-development-age.html' },
      { label: 'Potegal & Davidson, "Temper Tantrums in Young Children: 1. Behavioral Composition"', url: 'https://centerhealthyminds.org/assets/files-publications/PotegalTemper1DevelopmentalAndBehavioralPediatrics.pdf' },
    ] },

  { id: 'language_development', term: 'Language Development (Babbling Milestones)', category: 'development',
    short: 'The typical timeline for how babies go from cooing to babbling to first words.',
    long: 'Babbling usually starts around 4 to 6 months with single syllables like "ba" or "ga," becomes more complex with repeated syllables like "da-da-da" by around 9 months, and starts taking on the actual rhythm of speech by 10 to 12 months, which is often when first words show up. Babbling on the later side, after 10 months, has been linked to a smaller vocabulary at 2.5 years in research, which is one reason pediatricians ask about it at checkups. The best-supported way to support this naturally is simple: talk to your baby constantly, narrate what you\'re doing, and respond when they babble back, since language develops best through real back-and-forth interaction, not passive exposure like screen time.',
    aliases: ['language development', 'babbling milestones', 'babbling'],
    sources: [
      { label: 'NIDCD — "Speech and Language Developmental Milestones"', url: 'https://www.nidcd.nih.gov/health/speech-and-language' },
    ] },

  { id: 'stranger_anxiety', term: 'Stranger Anxiety', category: 'development',
    short: 'Wariness or fear around unfamiliar people — related to separation anxiety, but not the same thing.',
    long: 'Stranger anxiety can start as early as 3 months, becomes more noticeable around 7 to 8 months, and typically peaks between 12 and 15 months before gradually easing. It\'s about distinguishing familiar people from unfamiliar ones, while separation anxiety is specifically about missing a primary caregiver — they often show up around the same time and get lumped together, but they\'re driven by different developmental milestones. Both are normal signs that your baby\'s social and cognitive development is on track, not something to try to prevent.',
    sources: [
      { label: 'Merck Manual Professional Edition — "Separation Anxiety and Stranger Anxiety"', url: 'https://www.merckmanuals.com/professional/pediatrics/symptoms-in-infants-and-children/separation-anxiety-and-stranger-anxiety' },
    ] },

  { id: 'pretend_play', term: 'Pretend Play (Symbolic Play)', category: 'development',
    short: 'Play where an object or action stands in for something else — like feeding a doll or pretending a block is a phone.',
    long: 'This usually emerges around 12 to 18 months and becomes more elaborate through the toddler and preschool years. It\'s considered a real cognitive milestone, not just cute behavior: pretending requires holding two ideas in mind at once — what something actually is, and what you\'re pretending it is — which is an early building block for abstract thinking and, later, understanding that other people have their own thoughts and perspectives. It also tends to show up alongside, and support, language development, since a lot of pretend play involves narrating what\'s happening.',
    aliases: ['symbolic play', 'pretend play'] },

  // HEALTH
  { id: 'colic', term: 'Colic', category: 'health',
    short: 'Frequent, intense, hard-to-soothe crying in an otherwise healthy baby.',
    long: 'The classic definition (the "rule of three") comes from a 1954 study: crying more than 3 hours a day, more than 3 days a week, for more than 3 weeks, in a baby under 3 months. Newer clinical criteria shifted the focus toward how prolonged and hard-to-console the crying is, rather than hitting an exact hour count. The honest answer on cause is that nobody fully knows — leading theories include gut immaturity, differences in gut bacteria, and a nervous system that\'s easily overstimulated, but no single cause is agreed on. It generally peaks around 6 weeks and resolves by 3 to 4 months. It is not caused by anything you did as a parent, and it does end.',
    steps: [
      'Try babywearing — motion and closeness soothe a lot of colicky babies.',
      'White noise or other rhythmic sound can help.',
      'Try gentle motion — rocking, a car ride, a stroller walk.',
      'Take breaks: hand baby to a partner or support person for a stretch when you can, so you\'re not white-knuckling it alone.',
      'Mention it to your pediatrician if crying is truly relentless or you\'re worried — it\'s worth ruling out reflux or other causes.',
    ] },

  { id: 'reflux', term: 'Reflux / GERD', category: 'health',
    short: 'When stomach contents flow back up into the esophagus, causing spit-up or discomfort.',
    long: 'Infant reflux (GER) is extremely common because the valve between the esophagus and stomach is still immature in babies. Spitting up on its own is just GER and usually not a problem. It becomes GERD specifically when it also causes pain, poor weight gain, or a baby starting to refuse feeds. Signs of GERD: arching during or after feeds, crying with feeding, poor weight gain.',
    aliases: ['reflux', 'GERD'],
    steps: [
      'Keep baby upright for 20 to 30 minutes after feeds.',
      'Try smaller, more frequent feeds instead of large infrequent ones.',
      'Burp baby well, mid-feed and after.',
      'Talk to your pediatrician about thickened feeds or medication if weight gain or comfort is genuinely affected — not needed for simple spit-up.',
    ] },

  { id: 'jaundice', term: 'Jaundice', category: 'health',
    short: 'Yellowing of a baby\'s skin and eyes from a buildup of bilirubin.',
    long: 'Jaundice is extremely common — it affects roughly 60% of full-term babies and up to 80% of premature babies in the first week. It\'s caused by bilirubin building up as a newborn\'s liver matures, typically showing up on days 2 to 4 and resolving within about 2 weeks. The AAP actually raised its treatment thresholds in 2022, meaning current guidelines call for phototherapy less often than older guidelines did at the same bilirubin level, based on updated evidence about what levels are actually risky.',
    steps: [
      'Feed frequently — bilirubin is cleared partly through stool, so frequent feeding genuinely helps.',
      'Your baby will be screened with a bilirubin test between 24 and 48 hours old, or before hospital discharge — this is now standard.',
      'Watch for yellowing spreading to the chest, belly, or limbs, extreme sleepiness, or poor feeding — these warrant a call to your provider.',
      'More significant cases are treated with phototherapy (special lights) — this is common and not a sign anything went wrong.',
    ],
    sources: [
      { label: 'AAFP — "Hyperbilirubinemia in Newborns: Updated Guidelines From the AAP"', url: 'https://www.aafp.org/afp/2023/0600/practice-guidelines-hyperbilirubinemia-newborns' },
    ] },

  { id: 'tongue_tie', term: 'Tongue Tie (Ankyloglossia)', category: 'health',
    short: 'When the tissue connecting the tongue to the floor of the mouth is too short or tight, restricting movement.',
    long: 'This is a genuinely controversial area of pediatric care right now, worth knowing about directly. Tongue-tie diagnoses and surgical procedures (frenotomies) have risen sharply in recent years, without a matching rise in strong evidence to support that trend. The AAP has stated there\'s limited evidence to support treating anything beyond a clear, severe, classic tongue tie, and no real evidence to support surgery for "posterior tongue tie" specifically to help with feeding. That doesn\'t mean tongue tie is never real or never worth treating — it means it\'s worth getting more than one opinion, ideally including both a lactation consultant and a pediatric ENT, before agreeing to a procedure, and trying feeding support first when the case isn\'t clear-cut.',
    aliases: ['tongue tie', 'tongue-tie', 'ankyloglossia'],
    sources: [
      { label: 'HealthyChildren.org — "AAP Addresses Rise in Tongue-Tie Diagnoses for Breastfeeding Concerns"', url: 'https://www.healthychildren.org/English/news/Pages/AAP-report-addresses-rise-in-tongue-tie-diagnoses-for-breastfeeding-concerns.aspx' },
    ] },

  { id: 'lip_tie', term: 'Lip Tie', category: 'health',
    short: 'When the tissue connecting the upper lip to the gum is tight enough to limit how far the lip can flange during feeding.',
    long: 'Lip tie often gets diagnosed alongside tongue tie, but it\'s an even more contested diagnosis. The same AAP statement that raised concerns about overtreating tongue tie was specific that there\'s no real evidence supporting surgery for lip tie to help with feeding. If you\'re told your baby has a lip tie affecting feeding, it\'s worth getting a second opinion and trying hands-on feeding support, like working with an IBCLC, before agreeing to any procedure.',
    aliases: ['lip-tie'],
    sources: [
      { label: 'HealthyChildren.org — "AAP Addresses Rise in Tongue-Tie Diagnoses for Breastfeeding Concerns"', url: 'https://www.healthychildren.org/English/news/Pages/AAP-report-addresses-rise-in-tongue-tie-diagnoses-for-breastfeeding-concerns.aspx' },
    ] },

  { id: 'growth_spurt', term: 'Growth Spurt', category: 'health',
    short: 'A period of rapid physical growth, usually with increased hunger and fussiness.',
    long: 'Growth spurts commonly cluster around 2 to 3 weeks, 6 weeks, 3 months, and 6 months, though timing varies by baby. Breastfed babies often cluster feed intensely during a growth spurt to increase supply to match the new demand; formula-fed babies may just want more at each feed. Babies may also sleep more and be extra fussy. They typically last just 2 to 3 days. Responding to hunger cues, rather than trying to stick to a feeding schedule, is the right approach during one.',
    aliases: ['growth spurts'] },

  { id: 'fourth_trimester', term: 'Fourth Trimester', category: 'health',
    short: 'The first roughly 12 weeks after birth, when your newborn is still adjusting to life outside the womb.',
    long: 'Coined by pediatrician Dr. Harvey Karp, the idea is that a newborn\'s brain and nervous system are still very immature compared to other mammals at birth, so the first few months are really a continuation of gestation happening outside the womb instead of inside it. Karp\'s theory is that newborns are most soothed by things that recreate the womb: warmth, tight swaddling, shushing sounds, gentle rocking or swinging, and sucking. Understanding this framing helps set realistic expectations for how much a newborn genuinely needs to be held, fed, and soothed constantly — it\'s not spoiling, it\'s what they\'re built to expect at this stage.' },

  { id: 'teething', term: 'Teething', category: 'health',
    short: 'The process of new teeth pushing through your baby\'s gums, usually starting around 6 months.',
    long: 'Teething genuinely causes local symptoms: drooling, gum swelling, irritability, and wanting to chew on things. What it does not cause, according to the AAP and Mayo Clinic, is true fever, diarrhea, or vomiting, despite how often those get blamed on teething. A slight temperature bump (99–100°F) can happen from gum inflammation, but a real fever (100.4°F or higher) means something else is going on, like an actual illness, and shouldn\'t be written off as "just teething."',
    steps: [
      'Offer a chilled, not frozen, teething ring or a clean cold washcloth to chew on.',
      'Gently rub baby\'s gums with a clean finger.',
      'If your baby actually has a fever (100.4°F or higher), treat it as illness, not teething, and call your pediatrician if needed.',
      'Avoid teething gels with benzocaine or homeopathic teething tablets — the FDA has warned against both over safety concerns.',
    ],
    sources: [
      { label: 'Cleveland Clinic — "Does Teething Cause Fever? Signs and Symptoms"', url: 'https://health.clevelandclinic.org/teething-signs-and-symptoms' },
    ] },

  { id: 'rsv', term: 'RSV (Respiratory Syncytial Virus)', category: 'health',
    short: 'A common respiratory virus that\'s usually mild in older kids and adults but can be serious in infants.',
    long: 'RSV is the leading cause of hospitalization for infants in their first year. In 2023, a new option became available: nirsevimab (brand name Beyfortus), a long-acting monoclonal antibody given as a single shot that protects for about 5 months, roughly a full RSV season. Real-world data since its approval has been strong: studies found around 80% effectiveness against RSV-related ICU admission and over 90% against hospitalization. It\'s not a vaccine, but it works similarly — providing protection directly rather than asking a baby\'s immune system to build its own response.',
    aliases: ['RSV', 'respiratory syncytial virus'],
    steps: [
      'Ask your pediatrician about nirsevimab if your baby is under 8 months and entering their first RSV season (usually fall through spring).',
      'Watch for RSV warning signs: fast or labored breathing, wheezing, flaring nostrils, or ribs pulling in with each breath.',
      'Most RSV in infants is manageable at home, similar to a cold — but call your pediatrician or seek care right away if breathing looks labored or your baby is feeding poorly.',
      'Frequent handwashing and keeping sick people away from young infants remains one of the best everyday preventions.',
    ],
    sources: [
      { label: 'AAP — "Effectiveness of Nirsevimab Against RSV and RSV-Related Events in Infants"', url: 'https://publications.aap.org/pediatrics/article/156/2/e2024069510/202651/Effectiveness-of-Nirsevimab-Against-RSV-and-RSV' },
    ] },

  { id: 'diaper_rash', term: 'Diaper Rash', category: 'health',
    short: 'Skin irritation in the diaper area, usually from prolonged wetness, friction, or irritation.',
    long: 'Most diaper rash is simple contact irritation and clears up with basic care. Persistent rash that doesn\'t improve, especially with satellite red spots spreading outward, can be a yeast (candida) infection instead, which needs a different treatment — an antifungal, not just barrier cream — worth mentioning to your pediatrician if regular care isn\'t working within a few days.',
    steps: [
      'Change diapers promptly, before they\'re fully soaked if possible.',
      'Let the area air dry for a few minutes at changes when you can.',
      'Use a thick barrier cream (zinc oxide-based) at every change, not just once a rash appears.',
      'Avoid baby wipes with fragrance or alcohol if skin is already irritated — plain water and a soft cloth can be gentler.',
      'See your pediatrician if the rash doesn\'t improve in 2 to 3 days, has spreading red spots, or looks like it might be infected.',
    ] },

  // MENTAL HEALTH
  { id: 'baby_blues', term: 'Baby Blues', category: 'mentalhealth',
    short: 'Temporary mood swings, tearfulness, and anxiety in the first couple of weeks after birth.',
    long: 'This happens because hormones (estrogen and progesterone) crash to near pre-pregnancy levels within about 48 hours of delivery — a real, measurable hormonal event, not just "hormones" as a vague catch-all. How common it actually is varies a lot by study: estimates range from around 14% to 76% of new parents, with some Western studies landing around 80% and a broader pooled estimate closer to 39%. It typically starts 2 to 5 days after birth and resolves within about 2 weeks on its own. If it doesn\'t ease up by then, or feels severe from the start, that crosses into postpartum depression territory.',
    sources: [
      { label: '"Maternity Blues: A Narrative Review"', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9863514/' },
    ] },

  { id: 'ppd', term: 'Postpartum Depression (PPD)', category: 'mentalhealth',
    short: 'Clinical depression that occurs after childbirth — one of the most common complications of childbirth overall.',
    long: 'CDC data puts postpartum depressive symptoms at roughly 1 in 8 to 1 in 9 mothers in recent surveillance, while some broader clinical screening studies find rates as high as 1 in 7. Unlike baby blues, PPD persists beyond 2 weeks and can start any time in the first year, not just right after birth. Symptoms: persistent sadness, loss of interest, difficulty bonding, feelings of worthlessness, changes in appetite or sleep, and — a genuine emergency sign — thoughts of harming yourself or your baby.',
    aliases: ['postpartum depression', 'PPD'],
    steps: [
      'If you\'re having thoughts of harming yourself or your baby, call or text 988 (Suicide & Crisis Lifeline) or go to the nearest ER immediately.',
      'Otherwise, if symptoms last more than 2 weeks, call your OB, midwife, or primary care provider.',
      'The Edinburgh Postnatal Depression Scale is a quick, validated screening tool if you\'re unsure — many providers use it at postpartum visits.',
      'Treatment works: therapy (CBT and interpersonal therapy have the best evidence), support groups, and medication are all effective — many antidepressants are considered compatible with breastfeeding.',
    ],
    sources: [
      { label: 'CDC — "Timing of Postpartum Depressive Symptoms" (PRAMS surveillance data)', url: 'https://www.cdc.gov/pcd/issues/2023/23_0107.htm' },
      { label: 'Cochrane — "Psychosocial and psychological interventions for postpartum depression"', url: 'https://www.cochrane.org/evidence/CD006116_psychosocial-and-psychological-interventions-postpartum-depression' },
    ] },

  { id: 'pmads', term: 'PMADs', category: 'mentalhealth',
    short: 'Perinatal Mood & Anxiety Disorders — the umbrella term for mood and anxiety disorders during pregnancy and the postpartum period.',
    long: 'PMADs include postpartum depression, postpartum anxiety, postpartum OCD, postpartum PTSD, and postpartum psychosis. They\'re collectively common, affecting a meaningful share of birthing parents, and they can affect non-birthing partners too. Postpartum anxiety is actually about as common as PPD, maybe more so by some estimates, but gets talked about far less. Postpartum psychosis is rare, about 1 to 2 per 1,000 births, but is a true medical emergency.',
    steps: [
      'Postpartum Support International Helpline: 1-800-944-4773 (postpartum.net) — for support and referrals, not emergencies.',
      'National Maternal Mental Health Hotline: 1-833-852-6262 — free, confidential, 24/7.',
      'For immediate danger — thoughts of harming yourself or your baby, or symptoms of psychosis like confusion or hallucinations — call or text 988 or go to the ER.',
    ] },

  { id: 'matrescence', term: 'Matrescence', category: 'mentalhealth',
    short: 'The psychological transition of becoming a mother — as significant a developmental shift as adolescence.',
    long: 'Coined by anthropologist Dana Raphael in 1973, and more recently revived by researcher Aurelie Athan and popularized further by psychiatrist Dr. Alexandra Sacks. It describes the real psychological, physical, and social transformation of becoming a parent — identity reorganization, ambivalence, a sense of being caught between your old self and a new one. Naming this as a normal developmental process, not a disorder or a sign something\'s wrong, can be genuinely validating.',
    sources: [
      { label: 'Dana Raphael — origin of "matrescence" (1973)', url: 'https://en.wikipedia.org/wiki/Dana_Raphael' },
    ] },

  { id: 'postpartum_anxiety', term: 'Postpartum Anxiety (PPA)', category: 'mentalhealth',
    short: 'An anxiety disorder following childbirth — at least as common as PPD, but talked about far less.',
    long: 'PPA involves persistent, hard-to-control worry, often centered on your baby\'s safety. A recent review put global prevalence around 12%, and studies that screen for any anxiety disorder, not just generalized anxiety, have found rates as high as 1 in 5. It\'s often missed because anxious parents can look "engaged" and on top of things rather than visibly struggling, the way depression more often looks. It responds well to therapy, especially CBT, and sometimes medication.',
    aliases: ['postpartum anxiety', 'PPA'],
    sources: [
      { label: 'The Lancet Psychiatry — "Postpartum anxiety: a state-of-the-art review"', url: 'https://www.thelancet.com/journals/lanpsy/article/PIIS2215-0366(25)00197-X/abstract' },
    ] },

  { id: 'postpartum_ocd', term: 'Postpartum OCD', category: 'mentalhealth',
    short: 'Intrusive, unwanted thoughts about harm coming to your baby, often with related anxiety and rituals to try to prevent it.',
    long: 'First, context: unwanted intrusive thoughts about a baby\'s safety are extremely common in new parents generally — a landmark study found essentially all new mothers experience some version of this by 4 weeks postpartum, and they aren\'t linked to any increased risk of actually harming a child. Postpartum OCD specifically is different and less common, affecting an estimated 2 to 3% of new mothers: it involves those intrusive thoughts alongside real distress and compulsive behaviors, like excessive checking, avoidance of the baby, or repeated mental rituals meant to neutralize the thoughts. If intrusive thoughts come with compulsions or are making it hard to function, that\'s a treatable, well-recognized condition worth bringing to a provider or perinatal mental health specialist — disclosing the thoughts doesn\'t put your baby at risk of anything, and it\'s not a sign of who you are as a parent.',
    sources: [
      { label: 'Fairbrother & Woody (2008) — intrusive thoughts of infant-related harm in new mothers', url: 'https://www.psychiatrist.com/jcp/course-of-intrusive-thoughts-of-infant-related-harm/' },
    ] },

  { id: 'parental_burnout', term: 'Parental Burnout', category: 'mentalhealth',
    short: 'A specific, documented clinical condition — not just being really tired — involving exhaustion, feeling unlike yourself, and emotional distance from your kids.',
    long: 'Researchers Isabelle Roskam and Moïra Mikolajczak developed a validated 23-item scale for this, built around four dimensions: exhaustion in your parenting role, feeling like you don\'t recognize yourself as a parent anymore, feeling fed up with parenting, and emotional distancing from your own children. A 2020 study found it\'s genuinely distinct from job burnout and depression — it shares some symptoms with both, but is specifically and independently linked to things they don\'t explain, including a higher risk of neglectful or aggressive parenting and thoughts of escaping the family. That finding is exactly why it\'s worth taking seriously early, not a reason for alarm about any one parent — most people experiencing burnout never act on any of it, and burnout itself reflects how much you\'ve been trying, not how little you care.',
    steps: [
      'If you\'re having thoughts of escaping your family or harming your child, or you\'re worried about keeping your child safe, contact Postpartum Support International (1-800-944-4773) or call or text 988 if there\'s any immediate risk.',
      'Look at the balance between what\'s being demanded of you and what support you actually have — burnout comes from that gap, not from loving your kids too little.',
      'Add real resources back in where you can: sleep, a support person, lowering an unsustainable standard you\'re holding yourself to.',
      'Naming it early is protective — treat early symptoms as a real signal, not something to push through.',
    ],
    sources: [
      { label: 'Roskam, Brianda & Mikolajczak, "Parental Burnout Assessment (PBA)" — Frontiers in Psychology (2018)', url: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.00758/full' },
      { label: 'Mikolajczak et al., "Is Parental Burnout Distinct From Job Burnout and Depressive Symptoms?" — Clinical Psychological Science (2020)', url: 'https://journals.sagepub.com/doi/abs/10.1177/2167702620917447' },
    ] },

  { id: 'postpartum_rage', term: 'Postpartum Rage', category: 'mentalhealth',
    short: 'Intense anger, irritability, or agitation after having a baby — a real, common symptom that isn\'t its own official diagnosis.',
    long: 'Postpartum rage isn\'t listed as its own diagnosis, and standard screening tools for postpartum mental health often don\'t even ask about anger specifically, which means a lot of people experiencing it go unnoticed. Research still shows it\'s genuinely common: roughly 21 to 31% of new mothers report significant anger in the postpartum period, and it\'s tied to the same abrupt hormone shifts behind baby blues and PPD. It often shows up alongside postpartum depression or anxiety rather than completely on its own. It\'s not a moral failing or a sign you don\'t love your baby — it\'s a real symptom worth naming to your provider the same way you would sadness or anxiety, especially since it often responds to the same treatments.',
    sources: [
      { label: 'Cleveland Clinic — "Postpartum Rage: Symptoms, Diagnosis & Treatment"', url: 'https://my.clevelandclinic.org/health/diseases/24768-postpartum-rage' },
    ] },

  // MILESTONES
  { id: 'milestones', term: 'Developmental Milestones', category: 'milestones',
    short: 'Skill and behavior markers that most children reach by a certain age.',
    long: 'Milestones cover four areas: motor (big and small movements), language and communication, social and emotional skills, and cognitive skills. The CDC updated its official checklists in 2022 in a fairly significant way: milestones used to reflect what half of children could do at a given age (the 50th percentile), meaning half of kids were technically "behind" at any listed age. The update moved to the 75th percentile instead, so a listed age now reflects what about 3 out of 4 kids can do — meant to catch real delays earlier while reducing false alarms over totally normal variation. If your child has missed multiple milestones, or you\'re just concerned, asking for an evaluation is reasonable and free (see Early Intervention) — you don\'t need to wait and see.',
    sources: [
      { label: 'CDC — "Learn the Signs. Act Early." official milestone checklists', url: 'https://www.cdc.gov/act-early/milestones/index.html' },
      { label: 'Parenting Translator — "How Has the CDC Changed the Developmental Milestones?"', url: 'https://www.parentingtranslator.com/blog/how-has-the-cdc-changed-the-developmental-milestones-1' },
    ] },

  { id: 'percentiles', term: 'Percentiles / Growth Charts', category: 'milestones',
    short: 'A measure of how your baby\'s size compares to other babies the same age.',
    long: 'For babies under 2, US pediatricians are actually supposed to use World Health Organization growth charts, not the older CDC ones — a real, specific recommendation from both the CDC and AAP. The reason: the WHO charts are based on how healthy, predominantly breastfed babies actually grow, while the older CDC charts reflect a broader mixed-feeding US sample from a particular time and place. This is part of why some babies\' growth curves look different depending on which chart is used, especially in the first few months. Either way, percentiles aren\'t a report card — a healthy baby can be anywhere on the chart. What your pediatrician actually watches is the trajectory: is your baby consistently following their own curve over time? Crossing multiple percentile lines downward is a more meaningful signal than simply being small.',
    aliases: ['percentile', 'growth chart', 'growth charts'],
    sources: [
      { label: 'CDC — "Growth Charts: WHO Child Growth Standards"', url: 'https://www.cdc.gov/growthcharts/who_charts.htm' },
    ] },

  { id: 'adjusted_age', term: 'Adjusted Age (Corrected Age)', category: 'milestones',
    short: 'A preterm baby\'s age calculated from their due date rather than their actual birth date.',
    long: 'If your baby was born early, adjusted age subtracts the number of weeks premature from their actual age. A baby born 8 weeks early who is 6 months old, by birth date, has an adjusted age of 4 months. Developmental milestones, growth charts, and even feeding expectations should generally be measured against adjusted age, not the calendar date of birth, since a baby born early is developmentally younger than their birth date alone suggests. Most providers use adjusted age until about 2 to 2.5 years, after which the gap matters less.',
    aliases: ['corrected age', 'adjusted age'] },

  { id: 'early_intervention', term: 'Early Intervention', category: 'milestones',
    short: 'Free, government-funded evaluations and services for children under 3 with developmental delays or disabilities.',
    long: 'This is a federally mandated program (Part C of IDEA) available in every US state, though each state runs it under its own name. You do not need a doctor\'s referral or a diagnosis to request an evaluation — a parent can call and start the process directly. By federal law, the evaluation has to happen, and eligibility be determined, within 45 days of your request, and it\'s free regardless of income. Services can include speech therapy, occupational therapy, physical therapy, and more, depending on what the evaluation finds. Starting services earlier is consistently linked to better outcomes, which is part of why it\'s worth requesting an evaluation as soon as you\'re concerned rather than waiting to see.',
    aliases: ['EI'],
    steps: [
      'Contact your state\'s Part C early intervention program directly — no doctor\'s referral needed.',
      'Request a free evaluation — by law, it must happen within 45 days of your request.',
      'If your child qualifies, a service plan gets built around what the evaluation actually found.',
      'You can request this even if you\'re not sure — the evaluation is what determines eligibility, not you.',
    ] },

  { id: 'developmental_regression', term: 'Developmental Regression', category: 'milestones',
    short: 'Losing a skill your child had already reliably shown, rather than just being slow to reach a new one.',
    long: 'This is different from normal developmental variation, and it\'s the specific thing worth flagging to a pediatrician — not simply hitting a milestone a bit later than a chart suggests. A child who stops using words they used to say, stops walking after walking independently, or loses a previously mastered skill is a more meaningful signal than lateness on any single new milestone. Occasional regression tied to illness, stress, or exhaustion, like temporarily refusing to use the potty during a big transition, is common and usually resolves on its own. A real, sustained loss of skills is different and worth a conversation with your pediatrician.' },

  { id: 'failure_to_thrive', term: 'Failure to Thrive', category: 'milestones',
    short: 'A medical term for a baby or child not gaining weight or growing as expected — not just being small.',
    long: 'This is a specific clinical concern, not just a low percentile. The AAP\'s actual criteria: weight significantly below average for age (more than 2 standard deviations below the mean), or a weight curve that has crossed down through more than two percentile lines after previously following a stable pattern. It\'s about the trajectory and degree, not simply being a small baby on a consistently low but stable curve. The most common underlying cause is simply not getting enough calories in, whether from feeding difficulties, reflux causing vomiting, or an underlying medical condition affecting absorption or increasing calorie needs. It\'s treatable once the underlying cause is identified, which is why pediatricians track growth trajectory closely rather than just one measurement.',
    sources: [
      { label: 'AAFP — "Failure to Thrive: A Practical Guide"', url: 'https://www.aafp.org/pubs/afp/issues/2016/0815/p295.html' },
    ] },
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
          {term.steps && term.steps.length > 0 && (
            <View style={s.stepsBlock}>
              <Text style={s.stepsHeading}>How it works</Text>
              {term.steps.map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <View style={s.stepNumber}>
                    <Text style={s.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={s.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          )}
          {term.sources && term.sources.length > 0 && (
            <View style={s.sourcesBlock}>
              <Text style={s.sourcesHeading}>Sources</Text>
              {term.sources.map((src, i) => (
                <TouchableOpacity key={i} onPress={() => Linking.openURL(src.url)} accessibilityRole="link">
                  <Text style={s.sourceItem}>{src.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
    stepsBlock: { marginTop: 4, gap: 12 },
    stepsHeading: { fontSize: 15, fontWeight: '800', color: c.textPrimary, marginBottom: 2 },
    stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    stepNumber: {
      width: 24, height: 24, borderRadius: 12,
      backgroundColor: c.cardLavender, alignItems: 'center', justifyContent: 'center',
      marginTop: 1,
    },
    stepNumberText: { fontSize: 12, fontWeight: '800', color: c.textSecondary },
    stepText: { flex: 1, fontSize: 15, color: c.textPrimary, lineHeight: 22 },
    sourcesBlock: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.separator ?? c.cardLavender },
    sourcesHeading: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginBottom: 8, letterSpacing: 0.5 },
    sourceItem: { fontSize: 13, color: c.lavender, fontWeight: '600', lineHeight: 20, marginBottom: 6 },
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

export default function ParentingAZ({
  onBack,
  initialTermId,
  onTermConsumed,
}: {
  onBack: () => void;
  initialTermId?: string | null;
  onTermConsumed?: () => void;
}) {
  const c = useColors();
  const s = mainStyles(c);

  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('az');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | 'all'>('all');
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);

  useEffect(() => {
    if (!initialTermId) return;
    const match = TERMS.find(t => t.id === initialTermId);
    if (match) setSelectedTerm(match);
    onTermConsumed?.();
  }, [initialTermId]);

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
