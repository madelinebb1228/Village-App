import { useColorScheme } from 'react-native';
import { useAccessibility } from './AccessibilityContext';

// ─── Reminder / stat sub-types ────────────────────────────────────────────────

export interface ReminderColor { bg: string; border: string; text: string }
export interface StatColor { accent: string; bg: string }

// ─── Color interface ──────────────────────────────────────────────────────────

export interface Colors {
  // Backgrounds
  bg: string;
  bgAlt: string;

  // Cards
  card: string;
  cardBlue: string;
  cardSage: string;
  cardBlush: string;
  cardLavender: string;
  cardHoney: string;
  cardSlate: string;
  cardBorder: string;
  separator: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnColored: string;

  // Palette
  blue: string;
  sage: string;
  blush: string;
  lavender: string;
  honey: string;

  // Baby gender cards
  boyBg: string;
  boyBorder: string;
  girlBg: string;
  girlBorder: string;

  // Reminder cards (5 distinct, no two adjacent the same)
  reminderInfo: ReminderColor;
  reminderWarning: ReminderColor;
  reminderAlert: ReminderColor;
  reminderMilestone: ReminderColor;
  reminderStreak: ReminderColor;

  // Today stat cards
  statFeeds: StatColor;
  statDiapers: StatColor;
  statPumped: StatColor;

  // Post type accents
  postMilestone: string;
  postQuestion: string;
  postText: string;

  // Interactive
  primary: string;
  primaryText: string;
  primaryDisabled: string;

  // UI chrome
  fab: string;
  avatarBg: string;
  heroBg: string;
  heroShadow: string;
  signOut: string;
  editBtn: string;
  roleBadge: string;

  // Inputs
  inputBg: string;
  inputBorder: string;

  // Calendar
  calSelected: string;
  calSelectedText: string;
  calToday: string;
  calFuture: string;

  // Track tab buttons
  trackFeed: string;
  trackDiaper: string;
  trackPump: string;

  // Supplies
  supplyLowBg: string;
  supplyLowBorder: string;
  supplyLowText: string;

  // Village tab
  joinBtn: string;
  joinedBg: string;
  joinedBorder: string;
  quizCard: string;
  quizCardBorder: string;
  retakeCard: string;
  retakeCardBorder: string;
  optionSelected: string;
  optionSelectedBorder: string;
  optionDotSelected: string;
  progressFill: string;
  nextBtn: string;
}

// ─── Light palette ────────────────────────────────────────────────────────────

export const lightColors: Colors = {
  bg:              '#FFFFFF',
  bgAlt:           '#EDE9FF',

  card:            '#FAF9F6',
  cardBlue:        '#BFDBFE',
  cardSage:        '#A7F3D0',
  cardBlush:       '#FBCFE8',
  cardLavender:    '#DDD6FE',
  cardHoney:       '#FDE68A',
  cardSlate:       '#E2E8F0',
  cardBorder:      '#C4B5FD',
  separator:       '#E2E8F0',

  textPrimary:     '#1E1B4B',
  textSecondary:   '#374151',
  textMuted:       '#6B7280',
  textOnColored:   '#FFFFFF',

  blue:            '#2563EB',
  sage:            '#059669',
  blush:           '#DB2777',
  lavender:        '#7C3AED',
  honey:           '#D97706',

  boyBg:           '#BFDBFE',
  boyBorder:       '#2563EB',
  girlBg:          '#FBCFE8',
  girlBorder:      '#DB2777',

  reminderInfo:      { bg: '#BFDBFE', border: '#2563EB', text: '#1E3A8A' },
  reminderWarning:   { bg: '#FDE68A', border: '#D97706', text: '#78350F' },
  reminderAlert:     { bg: '#FBCFE8', border: '#DB2777', text: '#831843' },
  reminderMilestone: { bg: '#A7F3D0', border: '#059669', text: '#064E3B' },
  reminderStreak:    { bg: '#DDD6FE', border: '#7C3AED', text: '#4C1D95' },

  statFeeds:   { accent: '#059669', bg: '#A7F3D0' },
  statDiapers: { accent: '#D97706', bg: '#FDE68A' },
  statPumped:  { accent: '#DB2777', bg: '#FBCFE8' },

  postMilestone:   '#D97706',
  postQuestion:    '#2563EB',
  postText:        '#7C3AED',

  primary:         '#7C3AED',
  primaryText:     '#FFFFFF',
  primaryDisabled: '#C4B5FD',

  fab:             '#DB2777',
  avatarBg:        '#FBCFE8',
  heroBg:          '#FBCFE8',
  heroShadow:      '#F9A8D4',
  signOut:         '#EF4444',
  editBtn:         '#059669',
  roleBadge:       '#DB2777',

  inputBg:         '#F5F3FF',
  inputBorder:     '#C4B5FD',

  calSelected:     '#7C3AED',
  calSelectedText: '#FFFFFF',
  calToday:        '#7C3AED',
  calFuture:       '#C4B5FD',

  trackFeed:       '#7C3AED',
  trackDiaper:     '#059669',
  trackPump:       '#DB2777',

  supplyLowBg:     '#FDE68A',
  supplyLowBorder: '#D97706',
  supplyLowText:   '#B45309',

  joinBtn:              '#7C3AED',
  joinedBg:             '#A7F3D0',
  joinedBorder:         '#059669',
  quizCard:             '#FBCFE8',
  quizCardBorder:       '#DB2777',
  retakeCard:           '#DDD6FE',
  retakeCardBorder:     '#7C3AED',
  optionSelected:       '#BFDBFE',
  optionSelectedBorder: '#2563EB',
  optionDotSelected:    '#2563EB',
  progressFill:         '#7C3AED',
  nextBtn:              '#7C3AED',
};

// ─── Dark palette ─────────────────────────────────────────────────────────────

export const darkColors: Colors = {
  bg:              '#243040',
  bgAlt:           '#1E2A3C',

  card:            '#1A2332',
  cardBlue:        '#1A3858',
  cardSage:        '#1A3828',
  cardBlush:       '#3A1C32',
  cardLavender:    '#281840',
  cardHoney:       '#3C2A18',
  cardSlate:       '#243040',
  cardBorder:      '#3A4A5E',
  separator:       '#2E3D50',

  textPrimary:     '#E8EEF4',
  textSecondary:   '#B8C8D8',
  textMuted:       '#6A7E94',
  textOnColored:   '#E8EEF4',

  blue:            '#7BA7BC',
  sage:            '#6A9A84',
  blush:           '#B8829C',
  lavender:        '#8878A8',
  honey:           '#B8904A',

  boyBg:           '#1E3A5F',
  boyBorder:       '#4880B0',
  girlBg:          '#4A1535',
  girlBorder:      '#A06080',

  reminderInfo:      { bg: '#1A3858', border: '#7BA7BC',  text: '#B8C8D8' },
  reminderWarning:   { bg: '#3C2A18', border: '#B8904A',  text: '#B8C8D8' },
  reminderAlert:     { bg: '#3A1C32', border: '#B8829C',  text: '#B8C8D8' },
  reminderMilestone: { bg: '#1A3828', border: '#6A9A84',  text: '#B8C8D8' },
  reminderStreak:    { bg: '#281840', border: '#8878A8',  text: '#B8C8D8' },

  statFeeds:   { accent: '#6A9A84', bg: '#1A3828' },
  statDiapers: { accent: '#B8904A', bg: '#3C2A18' },
  statPumped:  { accent: '#B8829C', bg: '#3A1C32' },

  postMilestone:   '#B8904A',
  postQuestion:    '#7BA7BC',
  postText:        '#8878A8',

  primary:         '#7BA7BC',
  primaryText:     '#E8EEF4',
  primaryDisabled: '#2E3D50',

  fab:             '#B8829C',
  avatarBg:        '#B8829C',
  heroBg:          '#243040',
  heroShadow:      '#1A2332',
  signOut:         '#B8829C',
  editBtn:         '#6A9A84',
  roleBadge:       '#B8829C',

  inputBg:         '#243040',
  inputBorder:     '#2E3D50',

  calSelected:     '#7BA7BC',
  calSelectedText: '#FFFFFF',
  calToday:        '#7BA7BC',
  calFuture:       '#2E3D50',

  trackFeed:       '#8878A8',
  trackDiaper:     '#6A9A84',
  trackPump:       '#B8829C',

  supplyLowBg:     '#2A2820',
  supplyLowBorder: '#B8904A',
  supplyLowText:   '#B8904A',

  joinBtn:              '#7BA7BC',
  joinedBg:             '#1A3828',
  joinedBorder:         '#6A9A84',
  quizCard:             '#3A1C32',
  quizCardBorder:       '#B8829C',
  retakeCard:           '#281840',
  retakeCardBorder:     '#8878A8',
  optionSelected:       '#1A3858',
  optionSelectedBorder: '#7BA7BC',
  optionDotSelected:    '#7BA7BC',
  progressFill:         '#7BA7BC',
  nextBtn:              '#7BA7BC',
};

// ─── High contrast palettes (WCAG AAA-oriented overrides) ─────────────────────
// Spreads the base palette and only overrides text/border/primary/reminder-text
// tokens that need real contrast gains — everything else (card fills, accents
// used purely decoratively) is left as-is.

export const highContrastLightColors: Colors = {
  ...lightColors,
  textPrimary:   '#000000',
  textSecondary: '#1A1A1A',
  textMuted:     '#3D3D3D',
  separator:     '#000000',
  cardBorder:    '#000000',
  inputBorder:   '#000000',
  primary:       '#5B21B6',

  reminderInfo:      { ...lightColors.reminderInfo,      text: '#0A1E4D', border: '#0A1E4D' },
  reminderWarning:   { ...lightColors.reminderWarning,   text: '#4A2100', border: '#4A2100' },
  reminderAlert:     { ...lightColors.reminderAlert,     text: '#4D0026', border: '#4D0026' },
  reminderMilestone: { ...lightColors.reminderMilestone, text: '#022C1E', border: '#022C1E' },
  reminderStreak:    { ...lightColors.reminderStreak,    text: '#2A0A5C', border: '#2A0A5C' },
};

export const highContrastDarkColors: Colors = {
  ...darkColors,
  textPrimary:   '#FFFFFF',
  textSecondary: '#F0F0F0',
  textMuted:     '#D0D0D0',
  separator:     '#FFFFFF',
  cardBorder:    '#FFFFFF',
  inputBorder:   '#FFFFFF',
  primary:       '#A9C9DC',

  // Base dark palette reuses the same '#B8C8D8' text token across all five
  // reminder types with no differentiation; give each its own near-white text.
  reminderInfo:      { ...darkColors.reminderInfo,      text: '#DCEEFA' },
  reminderWarning:   { ...darkColors.reminderWarning,   text: '#FBEBD4' },
  reminderAlert:     { ...darkColors.reminderAlert,     text: '#FBE0EE' },
  reminderMilestone: { ...darkColors.reminderMilestone, text: '#DFF6EA' },
  reminderStreak:    { ...darkColors.reminderStreak,    text: '#EAE2FA' },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useColors(): Colors {
  const scheme = useColorScheme();
  const { settings } = useAccessibility();
  const isDark = scheme === 'dark';
  if (!settings.highContrast) return isDark ? darkColors : lightColors;
  return isDark ? highContrastDarkColors : highContrastLightColors;
}
