import { certRoutes } from './certRouter.js';
import { WARD_COUNT } from '../config/constants.js';
import { text, toAscii } from '../utils/validate.js';
import { VErr, need, opt, digits, pastDate } from '../utils/cert.js';

const MAX_HEIRS = 30;

function parse(b, d) {
  const ward = toAscii(b.wardNo);
  if (!/^\d{1,2}$/.test(ward) || Number(ward) < 1 || Number(ward) > WARD_COUNT) throw new VErr('ওয়ার্ড নং নির্বাচন করুন।');

  if (!Array.isArray(b.heirs)) throw new VErr('ওয়ারিশগণের তালিকা দিন।');
  const heirs = b.heirs
    .filter((h) => h && ['name', 'relation', 'ageOrDob', 'nid', 'note'].some((k) => text(h[k])))
    .map((h, i) => ({
      name: need(h.name, `ওয়ারিশ #${i + 1}: নাম`, 100),
      relation: need(h.relation, `ওয়ারিশ #${i + 1}: সম্পর্ক`, 50),
      ageOrDob: opt(h.ageOrDob, `ওয়ারিশ #${i + 1}: বয়স/জন্মতারিখ`, 30),
      nid: digits(h.nid, `ওয়ারিশ #${i + 1}: NID/BRN`, /^\d{10,20}$/),
      note: opt(h.note, `ওয়ারিশ #${i + 1}: মন্তব্য`, 100),
    }));
  if (heirs.length < 1) throw new VErr('কমপক্ষে একজন ওয়ারিশের তথ্য দিন।');
  if (heirs.length > MAX_HEIRS) throw new VErr(`ওয়ারিশ সর্বোচ্চ ${MAX_HEIRS} জন হতে পারে।`);

  return {
    deceasedName: need(b.deceasedName, 'মৃত ব্যক্তির নাম'),
    fatherName: need(b.fatherName, 'পিতা/স্বামীর নাম'),
    motherName: need(b.motherName, 'মাতার নাম'),
    deceasedNid: digits(b.deceasedNid, 'মৃতের NID/BRN', /^\d{10,20}$/),
    deathDate: pastDate(b.deathDate, 'মৃত্যু তারিখ'),
    deathRegNo: opt(b.deathRegNo, 'মৃত্যু নিবন্ধন নম্বর', 40),
    village: opt(b.village, 'গ্রাম', 100),
    postOffice: opt(b.postOffice, 'ডাকঘর', 100),
    wardNo: Number(ward),
    upazila: opt(b.upazila, 'উপজেলা', 100) || d.upazila,
    district: opt(b.district, 'জেলা', 100) || d.district,
    applicantName: need(b.applicantName, 'আবেদনকারীর নাম'),
    applicantRelation: opt(b.applicantRelation, 'আবেদনকারীর সম্পর্ক', 50),
    heirs,
  };
}

export default certRoutes({
  page: 'warish-certificates',
  table: 'warish_certificates',
  label: 'ওয়ারিশ সনদ',
  select: `id, cert_no, deceased_name, father_name, mother_name, deceased_nid, to_char(death_date, 'YYYY-MM-DD') AS death_date,
    death_reg_no, village, post_office, ward_no, upazila, district, applicant_name, applicant_relation, heirs, created_at, public_key`,
  columns: [
    ['deceased_name', 'deceasedName'], ['father_name', 'fatherName'], ['mother_name', 'motherName'],
    ['deceased_nid', 'deceasedNid', 'opt'], ['death_date', 'deathDate', 'opt'], ['death_reg_no', 'deathRegNo', 'opt'],
    ['village', 'village', 'opt'], ['post_office', 'postOffice', 'opt'], ['ward_no', 'wardNo'],
    ['upazila', 'upazila'], ['district', 'district'], ['applicant_name', 'applicantName'],
    ['applicant_relation', 'applicantRelation', 'opt'], ['heirs', 'heirs', 'json'],
  ],
  searchWhere: `cert_no ILIKE $1 OR deceased_name ILIKE $1 OR applicant_name ILIKE $1 OR deceased_nid ILIKE $1
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(heirs) h WHERE h->>'nid' ILIKE $1)`,
  lookupWhere: `cert_no = $1 OR deceased_nid = $1
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(heirs) h WHERE h->>'nid' = $1)`,
  dupChecks: [['deceased_nid', 'deceasedNid', 'মৃত ব্যক্তির NID/BRN']],
  parse,
  shape: (r) => ({
    id: r.id, certNo: r.cert_no, deceasedName: r.deceased_name, fatherName: r.father_name, motherName: r.mother_name,
    deceasedNid: r.deceased_nid || '', deathDate: r.death_date || '', deathRegNo: r.death_reg_no || '',
    village: r.village || '', postOffice: r.post_office || '', wardNo: r.ward_no, upazila: r.upazila, district: r.district,
    applicantName: r.applicant_name, applicantRelation: r.applicant_relation || '', heirs: r.heirs, createdAt: r.created_at, publicKey: r.public_key,
  }),
});
