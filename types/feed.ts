import { Colors } from '../lib/theme';

// ─── Post / comment types ─────────────────────────────────────────────────────

export interface Post {
  id: string;
  user_id: string;
  author: string;
  content: string;
  post_type: 'text' | 'milestone' | 'question' | 'poll';
  likes: number;
  created_at: string;
  image_url?: string | null;
  video_url?: string | null;
  tags?: string[] | null;
  village_id?: string | null;
  is_sensitive?: boolean | null;
  sensitive_label?: string | null;
}

export interface Comment {
  id: string;
  user_id: string;
  author: string;
  content: string;
  created_at: string;
  parent_id?: string | null;
  replies?: Comment[];
}

export type Stats = {
  feeds: number;
  diapers: number;
  pumpedMl: number;
};

export type ReminderUrgency = 'info' | 'warning' | 'alert' | 'milestone' | 'streak';

export interface Reminder {
  id: string;
  emoji: string;
  text: string;
  urgency: ReminderUrgency;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const POST_TAGS = [
  'Sleep', 'Feeding', 'Milestones', 'Health', 'Play', 'Development',
  'Mom Life', 'Dad Life', 'Breastfeeding', 'Formula', 'Solid Foods',
  'Newborn', 'Toddler', 'Pregnancy', 'Postpartum', 'Self Care',
  'Products', 'Travel', 'Safety',
];

export const MENTAL_HEALTH_KEYWORDS = [
  'struggling', 'overwhelmed', 'ppd', 'postpartum depression', 'postpartum anxiety',
  "can't cope", 'hopeless', 'suicidal', 'breakdown', 'depressed', 'not okay',
  "can't do this", 'losing my mind', 'burnout', 'want to give up', 'hurting myself',
  'self harm', 'end it all', 'help me please', 'can\'t take it', 'giving up',
];

export const PART_LIMITS: Record<string, { sessions: number; days: number }> = {
  membranes:      { sessions: 30,  days: 60  },
  valves:         { sessions: 15,  days: 28  },
  breast_shields: { sessions: 100, days: 180 },
  tubing:         { sessions: 100, days: 180 },
};

export const PART_LABELS: Record<string, string> = {
  membranes:      'Pump membranes',
  valves:         'Pump valves',
  breast_shields: 'Breast shields',
  tubing:         'Pump tubing',
};

// ─── Reminder color helper ────────────────────────────────────────────────────

export function getReminderColors(c: Colors): Record<ReminderUrgency, { bg: string; border: string; text: string }> {
  return {
    info:      { bg: c.reminderInfo.bg,      border: c.reminderInfo.border,      text: c.reminderInfo.text },
    warning:   { bg: c.reminderWarning.bg,   border: c.reminderWarning.border,   text: c.reminderWarning.text },
    alert:     { bg: c.reminderAlert.bg,     border: c.reminderAlert.border,     text: c.reminderAlert.text },
    milestone: { bg: c.reminderMilestone.bg, border: c.reminderMilestone.border, text: c.reminderMilestone.text },
    streak:    { bg: c.reminderStreak.bg,    border: c.reminderStreak.border,    text: c.reminderStreak.text },
  };
}
