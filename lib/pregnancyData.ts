// Pregnancy week helpers + size-comparison content for expecting parents.
// Standard obstetric convention: due date = 280 days (40 weeks) from LMP.

function parseLocalDate(dateStr: string): Date {
  // Parse a date-only string ("YYYY-MM-DD") as a local calendar date rather
  // than UTC midnight — see the same fix applied to DOB math in feedUtils.tsx.
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export interface PregnancyProgress {
  weeksPregnant: number;
  daysUntilDue: number;
  trimester: 1 | 2 | 3;
}

export function getPregnancyProgress(dueDate: string): PregnancyProgress {
  const due = parseLocalDate(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86400000);
  const daysPregnant = 280 - daysUntilDue;
  const weeksPregnant = Math.max(0, Math.min(42, Math.floor(daysPregnant / 7)));
  const trimester: 1 | 2 | 3 = weeksPregnant < 13 ? 1 : weeksPregnant < 27 ? 2 : 3;
  return { weeksPregnant, daysUntilDue, trimester };
}

interface WeekInfo { size: string; emoji: string; note: string }

// Size comparisons for weeks 4-42. Weeks before 4 fall back to the week-4 entry.
const WEEKLY_SIZE: Record<number, WeekInfo> = {
  4:  { size: 'a poppy seed',       emoji: '🌱', note: 'Implantation is just wrapping up.' },
  5:  { size: 'a sesame seed',      emoji: '🌱', note: 'The neural tube is starting to form.' },
  6:  { size: 'a lentil',           emoji: '🫘', note: "A heartbeat may be visible on ultrasound." },
  7:  { size: 'a blueberry',        emoji: '🫐', note: 'Arm and leg buds are appearing.' },
  8:  { size: 'a raspberry',        emoji: '🍇', note: 'Tiny fingers and toes are forming.' },
  9:  { size: 'a grape',            emoji: '🍇', note: 'Essential organs have all begun forming.' },
  10: { size: 'a kumquat',          emoji: '🍊', note: 'Vital organs are now functioning.' },
  11: { size: 'a fig',              emoji: '🫒', note: 'Nearly all systems are fully formed.' },
  12: { size: 'a lime',             emoji: '🍈', note: 'Reflexes are starting to kick in.' },
  13: { size: 'a peapod',           emoji: '🫛', note: 'Second trimester — vocal cords are forming.' },
  14: { size: 'a lemon',            emoji: '🍋', note: 'Facial muscles let baby practice expressions.' },
  15: { size: 'an apple',           emoji: '🍎', note: 'Baby can sense light through closed eyelids.' },
  16: { size: 'an avocado',         emoji: '🥑', note: 'Baby may start making tiny movements you can feel soon.' },
  17: { size: 'a turnip',           emoji: '🥔', note: 'Fat stores are beginning to develop.' },
  18: { size: 'a bell pepper',      emoji: '🫑', note: 'Ears are in place and hearing is developing.' },
  19: { size: 'a mango',            emoji: '🥭', note: 'A protective waxy coating covers baby\'s skin.' },
  20: { size: 'a banana',           emoji: '🍌', note: 'Halfway there! Anatomy scan territory.' },
  21: { size: 'a carrot',           emoji: '🥕', note: 'Movements are becoming stronger and more regular.' },
  22: { size: 'a spaghetti squash', emoji: '🎃', note: 'Eyebrows and eyelids are fully formed.' },
  23: { size: 'a grapefruit',       emoji: '🍊', note: 'Baby is practicing swallowing and hiccupping.' },
  24: { size: 'an ear of corn',     emoji: '🌽', note: 'Lungs are developing branching airways.' },
  25: { size: 'a cauliflower',      emoji: '🥦', note: "Baby's grip is getting stronger." },
  26: { size: 'a head of lettuce',  emoji: '🥬', note: 'Eyes are beginning to open.' },
  27: { size: 'a head of broccoli', emoji: '🥦', note: 'Third trimester begins.' },
  28: { size: 'an eggplant',        emoji: '🍆', note: 'Baby can blink and may be dreaming.' },
  29: { size: 'a butternut squash', emoji: '🎃', note: 'Bones are hardening, but the skull stays soft.' },
  30: { size: 'a cabbage',          emoji: '🥬', note: 'Baby is gaining weight quickly now.' },
  31: { size: 'a coconut',          emoji: '🥥', note: 'All five senses are now working.' },
  32: { size: 'a jicama',           emoji: '🥔', note: 'Practice breathing movements continue.' },
  33: { size: 'a pineapple',        emoji: '🍍', note: "Baby's immune system is developing." },
  34: { size: 'a cantaloupe',       emoji: '🍈', note: 'Central nervous system is maturing.' },
  35: { size: 'a honeydew melon',   emoji: '🍈', note: 'Kidneys are fully developed.' },
  36: { size: 'a head of romaine',  emoji: '🥬', note: 'Baby may be settling head-down.' },
  37: { size: 'a bunch of chard',   emoji: '🥬', note: 'Considered early term as of this week.' },
  38: { size: 'a leek',             emoji: '🥬', note: 'Baby continues to build fat stores for warmth.' },
  39: { size: 'a mini watermelon',  emoji: '🍉', note: 'Full term — organs are ready for the outside world.' },
  40: { size: 'a small pumpkin',    emoji: '🎃', note: "Any day now!" },
  41: { size: 'a small pumpkin',    emoji: '🎃', note: 'Still cooking — this is common and okay.' },
  42: { size: 'a small pumpkin',    emoji: '🎃', note: "Your care team will discuss next steps with you." },
};

export function getWeekInfo(weeksPregnant: number): WeekInfo {
  const clamped = Math.max(4, Math.min(42, weeksPregnant));
  return WEEKLY_SIZE[clamped];
}
