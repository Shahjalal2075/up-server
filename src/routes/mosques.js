import { crudRouter } from './crud.js';
import { WARD_COUNT } from '../config/constants.js';
import { text, int, mobile } from '../utils/validate.js';

const nameOk = (s) => s.length >= 2 && s.length <= 100;

function parse(b) {
  const name = text(b.name);
  if (!nameOk(name)) return { error: 'মসজিদের নাম দিন।' };
  const wardNo = int(b.wardNo, 1, WARD_COUNT);
  if (wardNo === null) return { error: 'ওয়ার্ড নং নির্বাচন করুন।' };
  const villageName = text(b.villageName);
  if (!nameOk(villageName)) return { error: 'গ্রাম/মহল্লার নাম দিন।' };
  const imamName = text(b.imamName);
  if (!nameOk(imamName)) return { error: 'ইমাম সাহেবের নাম দিন।' };
  const imamMobile = mobile(b.imamMobile);
  if (!imamMobile) return { error: 'ইমাম সাহেবের মোবাইল নম্বর সঠিক নয় (যেমন: 01712345678)।' };
  const muazzinName = text(b.muazzinName);
  if (!nameOk(muazzinName)) return { error: 'মুয়াজ্জিন সাহেবের নাম দিন।' };
  const muazzinMobile = mobile(b.muazzinMobile);
  if (!muazzinMobile) return { error: 'মুয়াজ্জিন সাহেবের মোবাইল নম্বর সঠিক নয় (যেমন: 01912345678)।' };

  let annualCost = null;
  if (text(b.annualCost) !== '') {
    annualCost = int(b.annualCost, 0, 1_000_000_000);
    if (annualCost === null) return { error: 'বাৎসরিক খরচ শুধু সংখ্যায় দিন।' };
  }
  const notes = text(b.notes);
  if (notes.length > 1000) return { error: 'বিবরণ সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।' };
  return { value: { name, wardNo, villageName, imamName, imamMobile, muazzinName, muazzinMobile, annualCost, notes: notes || null } };
}

export default crudRouter({
  page: 'mosque-info',
  table: 'mosques',
  select: 'id, name, ward_no, village_name, imam_name, imam_mobile, muazzin_name, muazzin_mobile, annual_cost::float8 AS annual_cost, notes, created_at',
  orderBy: 'ward_no, name',
  columns: [
    ['name', 'name'], ['ward_no', 'wardNo'], ['village_name', 'villageName'], ['imam_name', 'imamName'],
    ['imam_mobile', 'imamMobile'], ['muazzin_name', 'muazzinName'], ['muazzin_mobile', 'muazzinMobile'],
    ['annual_cost', 'annualCost'], ['notes', 'notes'],
  ],
  parse,
  dupMessage: 'এই ওয়ার্ড ও গ্রামে এই নামের মসজিদ আগে থেকেই আছে।',
  shape: (r) => ({
    id: r.id, name: r.name, wardNo: r.ward_no, villageName: r.village_name, imamName: r.imam_name,
    imamMobile: r.imam_mobile, muazzinName: r.muazzin_name, muazzinMobile: r.muazzin_mobile,
    annualCost: r.annual_cost, notes: r.notes || '', createdAt: r.created_at,
  }),
});
