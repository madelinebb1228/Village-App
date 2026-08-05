import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface ExportRange {
  startDate: Date;
  endDate: Date;
}

export function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function section(title: string, rows: string[][], headers: string[]): string {
  if (rows.length === 0) return '';
  const head = headers.map(h => `<th>${esc(h)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `
    <h2>${esc(title)}</h2>
    <table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

/**
 * Pulls a baby's tracker data for a date range and builds a printable HTML
 * report — handy for pediatrician visits. Generates a PDF and opens the
 * native share sheet.
 */
export async function generateAndShareReport(
  babyId: string,
  babyName: string,
  range: ExportRange,
): Promise<void> {
  const start = new Date(range.startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(range.endDate); end.setHours(23, 59, 59, 999);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [feedsRes, diapersRes, growthRes, vaccinesRes, milestonesRes, medLogsRes, medsRes] = await Promise.all([
    supabase.from('feeds').select('feed_type, logged_at, breast_side, bottle_amount_oz, breastmilk_oz, formula_oz')
      .eq('baby_id', babyId).gte('logged_at', startIso).lte('logged_at', endIso).order('logged_at', { ascending: true }),
    supabase.from('diaper_logs').select('diaper_type, logged_at, rash')
      .eq('baby_id', babyId).gte('logged_at', startIso).lte('logged_at', endIso).order('logged_at', { ascending: true }),
    supabase.from('growth_logs').select('date, weight_lbs, height_in')
      .eq('baby_id', babyId).gte('date', startIso).lte('date', endIso).order('date', { ascending: true }),
    supabase.from('vaccine_records').select('vaccine_key, given_date, notes')
      .eq('baby_id', babyId).gte('given_date', startIso).lte('given_date', endIso).order('given_date', { ascending: true }),
    supabase.from('milestones').select('title, milestone_date, notes')
      .eq('baby_id', babyId).gte('milestone_date', startIso).lte('milestone_date', endIso).order('milestone_date', { ascending: true }),
    supabase.from('medication_logs').select('medication_id, dose_given, notes, taken_at')
      .eq('baby_id', babyId).gte('taken_at', startIso).lte('taken_at', endIso).order('taken_at', { ascending: true }),
    supabase.from('medications').select('id, name').eq('category', 'baby'),
  ]);

  const medNameById = new Map((medsRes.data ?? []).map((m: any) => [m.id, m.name]));

  const feedRows = (feedsRes.data ?? []).map((f: any) => [
    formatDate(f.logged_at),
    f.feed_type ?? '',
    f.feed_type === 'breast' ? (f.breast_side ?? '') : `${f.bottle_amount_oz ?? f.breastmilk_oz ?? f.formula_oz ?? ''} oz`,
  ]);
  const diaperRows = (diapersRes.data ?? []).map((d: any) => [
    formatDate(d.logged_at), d.diaper_type ?? '', d.rash ? 'Yes' : '',
  ]);
  const growthRows = (growthRes.data ?? []).map((g: any) => [
    formatDate(g.date), g.weight_lbs != null ? `${g.weight_lbs} lb` : '', g.height_in != null ? `${g.height_in} in` : '',
  ]);
  const vaccineRows = (vaccinesRes.data ?? []).map((v: any) => [
    formatDate(v.given_date), v.vaccine_key ?? '', v.notes ?? '',
  ]);
  const milestoneRows = (milestonesRes.data ?? []).map((m: any) => [
    formatDate(m.milestone_date), m.title ?? '', m.notes ?? '',
  ]);
  const medRows = (medLogsRes.data ?? []).map((m: any) => [
    formatDate(m.taken_at), medNameById.get(m.medication_id) ?? 'Medication', m.dose_given ?? '',
  ]);

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #222; padding: 24px; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
          h2 { font-size: 16px; margin-top: 28px; border-bottom: 2px solid #eee; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { text-align: left; padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
          th { color: #555; font-weight: 600; }
        </style>
      </head>
      <body>
        <h1>${esc(babyName)}'s Tracker Summary</h1>
        <div class="sub">${formatDate(start.toISOString())} – ${formatDate(end.toISOString())}</div>
        ${section('Feeds', feedRows, ['Date', 'Type', 'Amount / Side'])}
        ${section('Diapers', diaperRows, ['Date', 'Type', 'Rash'])}
        ${section('Growth', growthRows, ['Date', 'Weight', 'Height'])}
        ${section('Vaccines', vaccineRows, ['Date', 'Vaccine', 'Notes'])}
        ${section('Milestones', milestoneRows, ['Date', 'Milestone', 'Notes'])}
        ${section('Medications', medRows, ['Date', 'Medication', 'Dose'])}
        ${[feedRows, diaperRows, growthRows, vaccineRows, milestoneRows, medRows].every(r => r.length === 0)
          ? '<p>No tracker entries found for this date range.</p>' : ''}
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${babyName}'s Tracker Summary` });
  }
}
