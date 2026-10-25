import { WARD_COUNT } from '../config/constants.js';
import { text, toAscii, mobile } from '../utils/validate.js';
import { VErr, need, opt, digits, pastDate } from '../utils/cert.js';

// ব্যক্তির সনদ (কৃষি প্রত্যয়নপত্র, নাগরিক সনদ): একই ফিল্ড, আলাদা table।
const MARITAL = ['বিবাহিত', 'অবিবাহিত', 'বিধবা', 'বিপত্নীক', 'তালাকপ্রাপ্ত'];

// ঠিকানা: খালি থানা/ইউনিয়ন/উপজেলা/জেলা সনদ-সেটিংসের ডিফল্ট দিয়ে ভরে
function address(a, label, d) {
  if (!a || typeof a !== 'object') throw new VErr(`${label} দিন।`);
  const ward = toAscii(a.wardNo);
  if (!/^\d{1,2}$/.test(ward) || Number(ward) < 1 || Number(ward) > WARD_COUNT) throw new VErr(`${label}: ওয়ার্ড নং নির্বাচন করুন।`);
  return {
    village: opt(a.village, `${label}: গ্রাম`, 100),
    holding: opt(a.holding, `${label}: হোল্ডিং নং`, 50),
    wardNo: String(Number(ward)),
    thana: opt(a.thana, `${label}: থানা`, 100) || d.upazila,
    union: opt(a.union, `${label}: ইউনিয়ন`, 100) || d.unionShort,
    upazila: opt(a.upazila, `${label}: উপজেলা`, 100) || d.upazila,
    district: opt(a.district, `${label}: জেলা`, 100) || d.district,
  };
}

function parse(b, d) {
  const maritalStatus = text(b.maritalStatus);
  if (!MARITAL.includes(maritalStatus)) throw new VErr('বৈবাহিক অবস্থা নির্বাচন করুন।');
  const mob = mobile(b.mobile);
  if (!mob) throw new VErr('মোবাইল নম্বর সঠিক নয় (যেমন: 01712345678)।');
  return {
    applicantName: need(b.applicantName, 'আবেদনকারীর নাম'),
    fatherName: need(b.fatherName, 'পিতার নাম'),
    motherName: need(b.motherName, 'মাতার নাম'),
    spouseName: opt(b.spouseName, 'স্বামী/স্ত্রীর নাম'),
    birthDate: pastDate(b.birthDate, 'জন্ম তারিখ', { required: true }),
    maritalStatus,
    mobile: mob,
    nid: digits(b.nid, 'NID নম্বর', /^(\d{10}|\d{13}|\d{17})$/),
    brn: digits(b.brn, 'জন্ম নিবন্ধন নম্বর', /^\d{10,20}$/),
    postOffice: opt(b.postOffice, 'ডাকঘর', 100),
    currentAddress: address(b.currentAddress, 'বর্তমান ঠিকানা', d),
    permanentAddress: address(b.permanentAddress, 'স্থায়ী ঠিকানা', d),
  };
}

export const personCert = {
  select: `id, cert_no, applicant_name, father_name, mother_name, spouse_name,
    to_char(birth_date, 'YYYY-MM-DD') AS birth_date, marital_status, mobile, nid, brn, post_office,
    current_address, permanent_address, created_at, public_key`,
  columns: [
    ['applicant_name', 'applicantName'], ['father_name', 'fatherName'], ['mother_name', 'motherName'],
    ['spouse_name', 'spouseName', 'opt'], ['birth_date', 'birthDate'], ['marital_status', 'maritalStatus'],
    ['mobile', 'mobile'], ['nid', 'nid', 'opt'], ['brn', 'brn', 'opt'], ['post_office', 'postOffice', 'opt'],
    ['current_address', 'currentAddress', 'json'], ['permanent_address', 'permanentAddress', 'json'],
  ],
  searchWhere: 'cert_no ILIKE $1 OR applicant_name ILIKE $1 OR nid ILIKE $1 OR brn ILIKE $1 OR mobile ILIKE $1',
  lookupWhere: 'cert_no = $1 OR nid = $1 OR brn = $1 OR mobile = $1',
  dupChecks: [['nid', 'nid', 'NID নম্বর'], ['brn', 'brn', 'জন্ম নিবন্ধন নম্বর'], ['mobile', 'mobile', 'মোবাইল নম্বর']],
  parse,
  shape: (r) => ({
    id: r.id, certNo: r.cert_no, applicantName: r.applicant_name, fatherName: r.father_name, motherName: r.mother_name,
    spouseName: r.spouse_name || '', birthDate: r.birth_date, maritalStatus: r.marital_status, mobile: r.mobile,
    nid: r.nid || '', brn: r.brn || '', postOffice: r.post_office || '',
    currentAddress: r.current_address, permanentAddress: r.permanent_address, createdAt: r.created_at, publicKey: r.public_key,
  }),
};
