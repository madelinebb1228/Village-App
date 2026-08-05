// Shared vocabulary for how the app addresses/labels users, so onboarding,
// Profile, and any caregiver-facing UI stay in sync instead of drifting into
// separate ad hoc option lists.

export const CUSTOM_TERM_ID = '__custom__';

export type ParentTermOption = { id: string; label: string; emoji: string };

export const PARENT_TERM_OPTIONS: ParentTermOption[] = [
  { id: 'Mom',         label: 'Mom',         emoji: '👩' },
  { id: 'Dad',         label: 'Dad',         emoji: '👨' },
  { id: 'Parent',      label: 'Parent',      emoji: '🧡' },
  { id: 'Grandparent', label: 'Grandparent', emoji: '🧓' },
  { id: 'Caregiver',   label: 'Caregiver',   emoji: '🤲' },
  { id: 'Nanny',       label: 'Nanny / Professional Caregiver', emoji: '🧑‍🍼' },
  { id: CUSTOM_TERM_ID, label: 'Something else', emoji: '✏️' },
];

const PLURALS: Record<string, string> = {
  Mom: 'Moms',
  Dad: 'Dads',
  Parent: 'Parents',
  Grandparent: 'Grandparents',
  Caregiver: 'Caregivers',
  Nanny: 'Nannies',
};

/** The term this profile's owner wants to be called, falling back to 'Parent'. */
export function getParentTerm(profile: { preferred_term?: string | null } | null | undefined): string {
  return profile?.preferred_term?.trim() || 'Parent';
}

/** Pluralized form of a term, e.g. for "other Moms nearby". */
export function getParentPlural(term: string): string {
  if (PLURALS[term]) return PLURALS[term];
  return /[sxz]$|[cs]h$/i.test(term) ? `${term}es` : `${term}s`;
}

export type FamilyStructure =
  | 'Mom + Dad'
  | 'Two Moms'
  | 'Two Dads'
  | 'Single Parent'
  | 'Co-Parents (separated/divorced)'
  | 'Grandparent-led'
  | 'Other';

export const FAMILY_STRUCTURE_OPTIONS: FamilyStructure[] = [
  'Mom + Dad',
  'Two Moms',
  'Two Dads',
  'Single Parent',
  'Co-Parents (separated/divorced)',
  'Grandparent-led',
  'Other',
];

const TWO_PARENT_STRUCTURES: ReadonlySet<string> = new Set([
  'Mom + Dad', 'Two Moms', 'Two Dads', 'Co-Parents (separated/divorced)',
]);

/** Label for the "invite another caregiver" action, tailored to the family's own description of itself. */
export function getCaregiverInviteLabel(familyStructure: string | null | undefined): string {
  if (familyStructure && TWO_PARENT_STRUCTURES.has(familyStructure)) return 'Invite your co-parent';
  if (familyStructure === 'Grandparent-led') return 'Invite a family caregiver';
  return 'Invite a caregiver';
}
