// >>> SANAD-BRANDS
export const TREND_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const isTrendScope = (s: string) => s === 'all' || TREND_ID.test(s);
// <<< SANAD-BRANDS
