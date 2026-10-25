import crypto from 'node:crypto';
import { text, toAscii } from './validate.js';

export class VErr extends Error {}

export const need = (v, label, max = 150) => {
  const s = text(v).replace(/\s+/g, ' ');
  if (!s) throw new VErr(`${label} দিন।`);
  if (s.length > max) throw new VErr(`${label} সর্বোচ্চ ${max} অক্ষরের হতে পারে।`);
  return s;
};
export const opt = (v, label, max = 150) => {
  const s = text(v).replace(/\s+/g, ' ');
  if (s.length > max) throw new VErr(`${label} সর্বোচ্চ ${max} অক্ষরের হতে পারে।`);
  return s;
};
export const digits = (v, label, re) => {
  const s = toAscii(v).replace(/[\s-]/g, '');
  if (!s) return '';
  if (!re.test(s)) throw new VErr(`${label} সঠিক নয়।`);
  return s;
};

// YYYY-MM-DD, বাস্তব তারিখ, ভবিষ্যতের নয়
export function pastDate(v, label, { required = false } = {}) {
  const s = toAscii(v);
  if (!s) {
    if (required) throw new VErr(`${label} দিন।`);
    return '';
  }
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s || d.getUTCFullYear() < 1900 || d > new Date())
    throw new VErr(`${label} সঠিক নয়।`);
  return s;
}

// সনদ নং: YYYYMMDD (ঢাকার সময়) + ৯ সংখ্যার র‍্যান্ডম = ১৭ সংখ্যা
export function genCertNo() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date()).replace(/-/g, '');
  return d + String(crypto.randomInt(0, 1_000_000_000)).padStart(9, '0');
}

export const like = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// YYYY-MM-DD, বাস্তব তারিখ (ভবিষ্যতেরও চলে — মেয়াদ উত্তীর্ণের তারিখের জন্য)
export function anyDate(v, label) {
  const s = toAscii(v);
  if (!s) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s || d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2200)
    throw new VErr(`${label} সঠিক নয়।`);
  return s;
}

// টাকার অঙ্ক (২ দশমিক পর্যন্ত), ফাঁকা = 0
export function money(v, label) {
  const s = toAscii(v).replace(/,/g, '');
  if (!s) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) > 1_000_000_000) throw new VErr(`${label} সঠিক নয়।`);
  return Number(s);
}
