// Set this to your Amazon Associates tag once your account is approved (e.g. 'village-20')
export const AMAZON_AFFILIATE_TAG = 'madelinebea07-20';

export function amazonSearchUrl(query: string): string {
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
  return AMAZON_AFFILIATE_TAG ? `${base}&tag=${AMAZON_AFFILIATE_TAG}` : base;
}

export function amazonProductUrl(asin: string): string {
  const base = `https://www.amazon.com/dp/${asin}`;
  return AMAZON_AFFILIATE_TAG ? `${base}?tag=${AMAZON_AFFILIATE_TAG}` : base;
}
