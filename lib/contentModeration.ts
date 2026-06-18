const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_KEY ?? '';

type Likelihood = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';

const SCORE: Record<Likelihood, number> = {
  UNKNOWN: 0, VERY_UNLIKELY: 1, UNLIKELY: 2, POSSIBLE: 3, LIKELY: 4, VERY_LIKELY: 5,
};

export type ModerationResult =
  | { blocked: false }
  | { blocked: true; severity: 'high' | 'extreme'; reason: string };

async function uriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function moderateImage(uri: string): Promise<ModerationResult> {
  if (!API_KEY) return { blocked: false };
  try {
    const content = await uriToBase64(uri);
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }],
        }),
      }
    );
    const json = await res.json();
    const s = json.responses?.[0]?.safeSearchAnnotation;
    if (!s) return { blocked: false };

    const adult = SCORE[s.adult as Likelihood] ?? 0;
    const violence = SCORE[s.violence as Likelihood] ?? 0;
    const racy = SCORE[s.racy as Likelihood] ?? 0;

    // VERY_LIKELY explicit or violent = potential illegal material (extreme severity)
    if (adult >= 5 || violence >= 5) {
      return {
        blocked: true,
        severity: 'extreme',
        reason: adult >= 5 ? 'explicit sexual content' : 'extreme violence',
      };
    }

    // LIKELY adult/violence or VERY_LIKELY racy = inappropriate (high severity)
    if (adult >= 4 || violence >= 4 || racy >= 5) {
      return {
        blocked: true,
        severity: 'high',
        reason: adult >= 4 ? 'explicit content' : violence >= 4 ? 'violent content' : 'inappropriate content',
      };
    }

    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}
