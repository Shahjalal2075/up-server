import { ICON_KEYS } from '../config/siteDefaults.js';

export class VErr extends Error {}

// Public homepage-e jabe, tai shob field-er type/length/link check kore, shudhu allowed key rakhe.
const str = (v, label, max, { required = false, multiline = false } = {}) => {
  let s = String(v ?? '').replace(/\r\n/g, '\n').trim();
  if (!multiline) s = s.replace(/\s*\n\s*/g, ' ');
  if (required && !s) throw new VErr(`${label} খালি রাখা যাবে না।`);
  if (s.length > max) throw new VErr(`${label} সর্বোচ্চ ${max} অক্ষরের হতে পারে।`);
  return s;
};

const url = (v, label) => {
  const s = str(v, label, 500);
  if (!s) return '';
  if (/^https?:\/\/[^\s]+$/i.test(s) || /^\/(?!\/)[^\s]*$/.test(s)) return s;
  throw new VErr(`${label} সঠিক লিংক নয় (https://… অথবা /path লিখুন)।`);
};

const email = (v) => {
  const s = str(v, 'ইমেইল', 120);
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new VErr('ইমেইল সঠিক নয়।');
  return s;
};

const icon = (v) => (ICON_KEYS.includes(v) ? v : 'Landmark');

const obj = (v, label) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new VErr(`${label} ভুল ফরম্যাটে আছে।`);
  return v;
};

const list = (v, label, max, fn) => {
  if (!Array.isArray(v)) throw new VErr(`${label} ভুল ফরম্যাটে আছে।`);
  if (v.length > max) throw new VErr(`${label} সর্বোচ্চ ${max} টি হতে পারে।`);
  return v.map(fn);
};

const strings = (v, label, max, itemMax, opts = {}) =>
  list(v, label, max, (x) => str(x, label, itemMax, opts)).filter(Boolean);

const count = (v, label) => {
  const raw = String(v ?? '').trim().replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  if (raw === '') return null;
  if (!/^\d+$/.test(raw) || Number(raw) > 1_000_000) throw new VErr(`${label}: সংখ্যা সঠিক নয়।`);
  return Number(raw);
};

export function sanitizeSite(b) {
  obj(b, 'তথ্য');
  const contact = obj(b.contact ?? {}, 'যোগাযোগ');
  const ch = obj(b.chairman ?? {}, 'চেয়ারম্যান');
  const hi = obj(b.history ?? {}, 'ইতিহাস');
  const geo = obj(b.geo ?? {}, 'ভৌগলিক তথ্য');
  const en = obj(b.entrepreneur ?? {}, 'উদ্যোক্তা');

  return {
    unionName: str(b.unionName, 'ইউনিয়নের নাম', 100, { required: true }),
    heroEyebrow: str(b.heroEyebrow, 'ব্যানারের ছোট লেখা', 60),
    tagline: str(b.tagline, 'ট্যাগলাইন', 250, { required: true }),
    notices: strings(b.notices ?? [], 'নোটিশ', 10, 200),
    contact: {
      email: email(contact.email),
      phone: str(contact.phone, 'ফোন নম্বর', 30),
      address: str(contact.address, 'ঠিকানা', 200),
    },
    established: str(b.established, 'প্রতিষ্ঠাকাল', 30),
    area: str(b.area, 'আয়তন', 40),
    chairman: {
      name: str(ch.name, 'চেয়ারম্যানের নাম', 80),
      designation: str(ch.designation, 'পদবি', 60),
      title: str(ch.title, 'সম্মানসূচক উপাধি', 80),
      photo: url(ch.photo, 'ছবির লিংক'),
      lead: str(ch.lead, 'শুভেচ্ছা বাণীর মূল লাইন', 300),
      message: strings(ch.message ?? [], 'শুভেচ্ছা বাণী', 6, 1500, { multiline: true }),
    },
    history: {
      text: str(hi.text, 'ইতিহাসের বর্ণনা', 2000, { multiline: true }),
      timeline: list(hi.timeline ?? [], 'সময়রেখা', 12, (t) => ({
        year: str(t?.year, 'সাল', 20),
        text: str(t?.text, 'সময়রেখার বিবরণ', 300),
      })).filter((t) => t.year || t.text),
    },
    geo: {
      text: str(geo.text, 'ভৌগলিক বর্ণনা', 2000, { multiline: true }),
      sectors: list(geo.sectors ?? [], 'খাত', 12, (s) => ({ icon: icon(s?.icon), label: str(s?.label, 'খাতের নাম', 40) })).filter((s) => s.label),
    },
    serviceMenu: list(b.serviceMenu ?? [], 'সেবা মেনু', 12, (s) => ({
      label: str(s?.label, 'মেনুর নাম', 60),
      url: url(s?.url, `"${s?.label ?? ''}" এর লিংক`),
    })).filter((s) => s.label),
    services: list(b.services ?? [], 'সেবা', 12, (s) => ({
      icon: icon(s?.icon),
      title: str(s?.title, 'সেবার নাম', 60),
      text: str(s?.text, 'সেবার বিবরণ', 200),
    })).filter((s) => s.title),
    projectsNote: str(b.projectsNote, 'প্রকল্পের নোট', 300),
    projects: list(b.projects ?? [], 'প্রকল্প', 15, (p) => ({ icon: icon(p?.icon), title: str(p?.title, 'প্রকল্পের নাম', 80) })).filter((p) => p.title),
    entrepreneur: {
      text: str(en.text, 'উদ্যোক্তার বর্ণনা', 500),
      helps: strings(en.helps ?? [], 'উদ্যোক্তা সেবা', 12, 60),
      note: str(en.note, 'উদ্যোক্তার নোট', 300),
    },
    offices: list(b.offices ?? [], 'সরকারি অফিস', 20, (o) => ({
      icon: icon(o?.icon),
      label: str(o?.label, 'অফিসের নাম', 80),
      url: url(o?.url, `"${o?.label ?? ''}" এর লিংক`),
    })).filter((o) => o.label),
    institutions: list(b.institutions ?? [], 'প্রতিষ্ঠান', 20, (i) => ({
      icon: icon(i?.icon),
      label: str(i?.label, 'প্রতিষ্ঠানের নাম', 80),
      count: count(i?.count, `"${i?.label ?? ''}" এর সংখ্যা`),
      names: strings(i?.names ?? [], 'প্রতিষ্ঠানের নামের তালিকা', 200, 100),
    })).filter((i) => i.label),
  };
}
