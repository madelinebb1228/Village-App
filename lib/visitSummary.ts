import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { supabase, supabaseUrl } from './supabase';
import { esc, section } from './exportReport';

export type VisitType = 'Well Visit' | 'Sick Visit' | 'Follow-up' | 'Other';
export type RangeDays = 7 | 14 | 30;

export interface VisitSummary {
  babyName: string;
  visitType: VisitType;
  visitDate: string;
  rangeDays: RangeDays;
  generatedAt: string;
  feedingLine: string;
  sleepLine: string;
  concerns: string[];
  questions: string[];
  growthRows: { date: string; weight: string; height: string }[];
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Same threshold used by the Health Tracker's fever flag (screens/HealthTracker.tsx).
function isFever(value: number, unit: string): boolean {
  return unit === 'F' ? value >= 100.4 : value >= 38.0;
}

export async function buildVisitSummary(
  babyId: string,
  babyName: string,
  visitType: VisitType,
  visitDate: string,
  rangeDays: RangeDays,
): Promise<VisitSummary> {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setDate(start.getDate() - rangeDays); start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const startDate = startIso.split('T')[0];
  const endDate = endIso.split('T')[0];

  const [feedsRes, sleepRes, diapersRes, episodesRes, growthRes] = await Promise.all([
    supabase.from('feeds').select('feed_type, logged_at, bottle_amount_oz, breastmilk_oz, formula_oz')
      .eq('baby_id', babyId).gte('logged_at', startIso).lte('logged_at', endIso),
    supabase.from('sleep_logs').select('sleep_type, duration_minutes, start_time')
      .eq('baby_id', babyId).gte('start_time', startIso).lte('start_time', endIso),
    supabase.from('diaper_logs').select('rash, logged_at')
      .eq('baby_id', babyId).gte('logged_at', startIso).lte('logged_at', endIso),
    (supabase.from('illness_episodes') as any).select('id, title, start_date, end_date, status')
      .eq('baby_id', babyId).gte('start_date', startDate).lte('start_date', endDate),
    supabase.from('growth_logs').select('date, weight_lbs, height_in')
      .eq('baby_id', babyId).gte('date', startDate).lte('date', endDate).order('date', { ascending: true }),
  ]);

  // ── Feeding ──────────────────────────────────────────────────────────────
  const feeds = feedsRes.data ?? [];
  const bottleFeeds = feeds.filter((f: any) => f.bottle_amount_oz ?? f.breastmilk_oz ?? f.formula_oz);
  const feedsPerDay = feeds.length / rangeDays;
  const avgOz = bottleFeeds.length
    ? bottleFeeds.reduce((sum: number, f: any) => sum + (f.bottle_amount_oz ?? f.breastmilk_oz ?? f.formula_oz ?? 0), 0) / bottleFeeds.length
    : null;
  const feedingLine = feeds.length === 0
    ? 'No feeds logged in this window.'
    : `Averaging ${feedsPerDay.toFixed(1)} feeds/day${avgOz != null ? `, ${avgOz.toFixed(1)}oz each` : ''}.`;

  // ── Sleep ────────────────────────────────────────────────────────────────
  const nightSessions = (sleepRes.data ?? []).filter((s: any) => s.sleep_type === 'night');
  const totalNightMinutes = nightSessions.reduce((sum: number, s: any) => sum + (s.duration_minutes ?? 0), 0);
  const avgNightHours = nightSessions.length ? (totalNightMinutes / rangeDays) / 60 : 0;
  const avgSessionsPerDay = nightSessions.length / rangeDays;
  const nightWakings = Math.max(0, Math.round(avgSessionsPerDay - 1));
  const sleepLine = nightSessions.length === 0
    ? 'No night sleep logged in this window.'
    : `Night sleep averaging ${avgNightHours.toFixed(1)}hrs, about ${nightWakings} night waking${nightWakings === 1 ? '' : 's'}.`;

  // ── Concerns ─────────────────────────────────────────────────────────────
  const concerns: string[] = [];

  const rashCount = (diapersRes.data ?? []).filter((d: any) => d.rash && d.rash !== 'none').length;
  if (rashCount > 0) concerns.push(`${rashCount} diaper rash${rashCount === 1 ? '' : 'es'} logged`);

  const episodes = episodesRes.data ?? [];
  const episodeIds = episodes.map((e: any) => e.id);
  let feverCount = 0;
  let severeSymptoms: string[] = [];
  if (episodeIds.length > 0) {
    const [tempsRes, symptomsRes] = await Promise.all([
      (supabase.from('temperature_logs') as any).select('value, unit').in('episode_id', episodeIds),
      (supabase.from('symptom_logs') as any).select('symptom, severity').in('episode_id', episodeIds),
    ]);
    feverCount = (tempsRes.data ?? []).filter((t: any) => isFever(t.value, t.unit)).length;
    severeSymptoms = (symptomsRes.data ?? []).filter((s: any) => s.severity === 'severe').map((s: any) => s.symptom);
  }

  for (const ep of episodes) {
    concerns.push(`${ep.title || 'Illness'} (${ep.status === 'resolved' ? 'resolved' : 'ongoing'})`);
  }
  if (feverCount > 0) concerns.push(`${feverCount} fever reading${feverCount === 1 ? '' : 's'} logged`);
  if (severeSymptoms.length > 0) concerns.push(`Severe symptoms: ${severeSymptoms.join(', ')}`);

  // ── Questions ────────────────────────────────────────────────────────────
  const questions: string[] = [];
  if (feverCount > 0) questions.push('Is there a pattern to these fevers I should be tracking?');
  if (episodes.some((e: any) => e.status === 'ongoing')) questions.push('Is a follow-up needed for the ongoing illness?');
  if (rashCount >= 3) questions.push('Any recommendations for the recurring diaper rash?');
  if (severeSymptoms.length > 0) questions.push(`Should ${severeSymptoms[0]} be evaluated further?`);
  if (questions.length === 0) questions.push('Any developmental milestones to watch for at this age?');

  // ── Growth ───────────────────────────────────────────────────────────────
  const growthRows = (growthRes.data ?? []).map((g: any) => ({
    date: formatDate(g.date),
    weight: g.weight_lbs != null ? `${g.weight_lbs} lb` : '',
    height: g.height_in != null ? `${g.height_in} in` : '',
  }));

  return {
    babyName, visitType, visitDate, rangeDays,
    generatedAt: new Date().toISOString(),
    feedingLine, sleepLine, concerns, questions, growthRows,
  };
}

export async function generateVisitSummaryPDF(summary: VisitSummary): Promise<void> {
  const concernsHtml = summary.concerns.length
    ? `<ul>${summary.concerns.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '<p>No concerns logged in this window.</p>';
  const questionsHtml = summary.questions.length
    ? `<ul>${summary.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>`
    : '';
  const growthTableRows = summary.growthRows.map(r => [r.date, r.weight, r.height]);

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #222; padding: 24px; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
          h2 { font-size: 16px; margin-top: 28px; border-bottom: 2px solid #eee; padding-bottom: 4px; }
          ul { padding-left: 20px; }
          li { font-size: 13px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { text-align: left; padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
          th { color: #555; font-weight: 600; }
          .notes-lines div { border-bottom: 1px solid #ccc; height: 28px; }
          .footer { margin-top: 32px; color: #999; font-size: 11px; }
        </style>
      </head>
      <body>
        <h1>${esc(summary.babyName)}'s Visit Summary</h1>
        <div class="sub">${esc(summary.visitType)} · ${esc(summary.visitDate)} · Last ${summary.rangeDays} days</div>

        <h2>Feeding</h2>
        <p>${esc(summary.feedingLine)}</p>

        <h2>Sleep</h2>
        <p>${esc(summary.sleepLine)}</p>

        <h2>Concerns Logged</h2>
        ${concernsHtml}

        ${section('Growth', growthTableRows, ['Date', 'Weight', 'Height'])}

        ${questionsHtml ? `<h2>Questions You Might Ask</h2>${questionsHtml}` : ''}

        <h2>Doctor's Notes</h2>
        <div class="notes-lines"><div></div><div></div><div></div><div></div><div></div></div>

        <div class="footer">Generated by Parent Patch on ${esc(new Date(summary.generatedAt).toLocaleDateString())}</div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${summary.babyName}'s Visit Summary` });
  }
}

export async function shareWithProvider(babyId: string, summary: VisitSummary): Promise<void> {
  const { data: token, error } = await (supabase as any).rpc('create_provider_share', {
    p_baby_id: babyId,
    p_data: summary,
  });
  if (error) throw error;

  const functionsBase = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
  const url = `${functionsBase}/provider-share-view?token=${token}`;

  await Share.share({
    message: `Here's ${summary.babyName}'s visit summary for our appointment. This link is read-only and expires in 24 hours: ${url}`,
  });
}
