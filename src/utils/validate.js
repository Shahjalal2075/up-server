const BN = '০১২৩৪৫৬৭৮৯';

// Bangla digit -> English digit, ar trim
export const toAscii = (v) => String(v ?? '').replace(/[০-৯]/g, (d) => BN.indexOf(d)).trim();
export const text = (v) => String(v ?? '').trim();

export function int(v, min, max) {
  const s = toAscii(v);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

export function decimal(v, min, max) {
  const s = toAscii(v);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

// Bangladeshi mobile: 01XXXXXXXXX (+88 / 88 prefix thakle kete dey)
export function mobile(v) {
  let s = toAscii(v).replace(/[\s-]/g, '');
  if (s.startsWith('+88')) s = s.slice(3);
  else if (s.length === 13 && s.startsWith('88')) s = s.slice(2);
  return /^01[3-9]\d{8}$/.test(s) ? s : null;
}
