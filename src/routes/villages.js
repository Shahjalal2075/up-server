import { crudRouter } from './crud.js';
import { WARD_COUNT } from '../config/constants.js';
import { text, int, decimal, mobile } from '../utils/validate.js';

function parse(b) {
  const name = text(b.name);
  if (name.length < 2 || name.length > 100) return { error: 'গ্রামের নাম দিন (২–১০০ অক্ষর)।' };
  const wardNo = int(b.wardNo, 1, WARD_COUNT);
  if (wardNo === null) return { error: 'ওয়ার্ড নং নির্বাচন করুন।' };
  const population = int(b.population, 0, 10_000_000);
  if (population === null) return { error: 'মোট জনসংখ্যা সঠিকভাবে দিন।' };
  const voters = int(b.voters, 0, 10_000_000);
  if (voters === null) return { error: 'মোট ভোটার সংখ্যা সঠিকভাবে দিন।' };
  if (voters > population) return { error: 'মোট ভোটার জনসংখ্যার চেয়ে বেশি হতে পারে না।' };
  const literacyRate = decimal(b.literacyRate, 0, 100);
  if (literacyRate === null) return { error: 'শিক্ষার হার ০–১০০ এর মধ্যে দিন (যেমন: ৬৫.৫)।' };
  const headName = text(b.headName);
  if (headName.length < 2 || headName.length > 100) return { error: 'গ্রাম প্রধান / দায়িত্বপ্রাপ্ত সদস্যের নাম দিন।' };
  const headMobile = mobile(b.headMobile);
  if (!headMobile) return { error: 'মোবাইল নম্বর সঠিক নয় (যেমন: 01712345678)।' };
  const notes = text(b.notes);
  if (notes.length > 1000) return { error: 'মন্তব্য সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।' };
  return { value: { name, wardNo, population, voters, literacyRate, headName, headMobile, notes: notes || null } };
}

export default crudRouter({
  page: 'village-info',
  table: 'villages',
  select: 'id, name, ward_no, population, voters, literacy_rate::float8 AS literacy_rate, head_name, head_mobile, notes, created_at',
  orderBy: 'ward_no, name',
  columns: [
    ['name', 'name'], ['ward_no', 'wardNo'], ['population', 'population'], ['voters', 'voters'],
    ['literacy_rate', 'literacyRate'], ['head_name', 'headName'], ['head_mobile', 'headMobile'], ['notes', 'notes'],
  ],
  parse,
  dupMessage: 'এই ওয়ার্ডে এই নামের গ্রাম আগে থেকেই আছে।',
  shape: (r) => ({
    id: r.id, name: r.name, wardNo: r.ward_no, population: r.population, voters: r.voters,
    literacyRate: r.literacy_rate, headName: r.head_name, headMobile: r.head_mobile, notes: r.notes || '',
    createdAt: r.created_at,
  }),
});
