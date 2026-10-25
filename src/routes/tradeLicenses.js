import crypto from 'node:crypto';
import { certRoutes } from './certRouter.js';
import { text, toAscii, mobile } from '../utils/validate.js';
import { VErr, need, opt, digits, anyDate, money } from '../utils/cert.js';

const LIC_RE = /^[A-Za-z0-9/-]{1,17}$/;

// ফাঁকা রাখলে অটো লাইসেন্স নং: সাল + ১০ সংখ্যা (১৪ সংখ্যা)
function genLicenseNo() {
  const y = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date()).slice(0, 4);
  return y + String(crypto.randomInt(0, 10_000_000_000)).padStart(10, '0');
}

function parse(b) {
  const licenseNo = toAscii(b.licenseNo).replace(/\s+/g, '');
  if (licenseNo && !LIC_RE.test(licenseNo)) throw new VErr('লাইসেন্স নম্বর সর্বোচ্চ ১৭ অক্ষরের (ইংরেজি অক্ষর, সংখ্যা, - বা /) হতে পারে।');

  const mob = mobile(b.mobile);
  if (!mob) throw new VErr('মোবাইল নম্বর সঠিক নয় (যেমন: 01712345678)।');

  const photo = text(b.photo);
  if (photo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 250_000))
    throw new VErr('ছবি সঠিক নয় বা অনেক বড়। আবার আপলোড করুন।');

  const fees = {
    licenseFee: money(b.licenseFee, 'লাইসেন্স ফি'),
    vat: money(b.vat, 'ভ্যাট'),
    professionTax: money(b.professionTax, 'পেশা কর'),
    adTax: money(b.adTax, 'বিজ্ঞাপন কর'),
    arrears: money(b.arrears, 'বকেয়া'),
    serviceCharge: money(b.serviceCharge, 'সার্ভিস চার্জ'),
  };
  const totalFee = Math.round(Object.values(fees).reduce((a, n) => a + n, 0) * 100) / 100;

  return {
    certNo: licenseNo,
    businessName: need(b.businessName, 'ব্যবসা প্রতিষ্ঠানের নাম'),
    ownerName: need(b.ownerName, 'মালিকের নাম'),
    fatherName: need(b.fatherName, 'পিতা/স্বামীর নাম'),
    motherName: need(b.motherName, 'মাতার নাম'),
    mobile: mob,
    nid: digits(b.nid, 'NID নম্বর', /^(\d{10}|\d{13}|\d{17})$/),
    brn: opt(b.brn, 'জন্ম নিবন্ধন নম্বর', 30),
    taxId: opt(b.taxId, 'ট্যাক্স আইডি', 30),
    businessAddress: need(b.businessAddress, 'ব্যবসা প্রতিষ্ঠানের ঠিকানা', 250),
    businessType: need(b.businessType, 'ব্যবসার ধরন', 100),
    capital: opt(b.capital, 'মূলধন', 50),
    issueDate: anyDate(b.issueDate, 'ইস্যুর তারিখ'),
    renewalDate: anyDate(b.renewalDate, 'নবায়ন তারিখ'),
    expiryDate: anyDate(b.expiryDate, 'মেয়াদ উত্তীর্ণ তারিখ'),
    fiscalYear: opt(b.fiscalYear, 'অর্থ বছর', 20),
    ...fees,
    totalFee,
    photo,
  };
}

const BASE = `id, cert_no, business_name, owner_name, father_name, mother_name, mobile, nid, brn, tax_id,
  business_address, business_type, capital,
  to_char(issue_date, 'YYYY-MM-DD') AS issue_date, to_char(renewal_date, 'YYYY-MM-DD') AS renewal_date,
  to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, fiscal_year,
  license_fee::float8 AS license_fee, vat::float8 AS vat, profession_tax::float8 AS profession_tax,
  ad_tax::float8 AS ad_tax, arrears::float8 AS arrears, service_charge::float8 AS service_charge,
  total_fee::float8 AS total_fee, created_at, public_key`;

export default certRoutes({
  page: 'trade-licenses',
  table: 'trade_licenses',
  label: 'ট্রেড লাইসেন্স',
  select: `${BASE}, photo`,
  listSelect: BASE, // তালিকায় বড় ছবি আসে না
  genNo: genLicenseNo,
  publicLookup: false, // হাতে-দেওয়া লাইসেন্স নম্বর অনুমানযোগ্য, তাই public search নেই
  dupChecks: [['nid', 'nid', 'NID নম্বর'], ['brn', 'brn', 'জন্ম নিবন্ধন নম্বর'], ['mobile', 'mobile', 'মোবাইল নম্বর']],
  columns: [
    ['business_name', 'businessName'], ['owner_name', 'ownerName'], ['father_name', 'fatherName'], ['mother_name', 'motherName'],
    ['mobile', 'mobile'], ['nid', 'nid', 'opt'], ['brn', 'brn', 'opt'], ['tax_id', 'taxId', 'opt'],
    ['business_address', 'businessAddress'], ['business_type', 'businessType'], ['capital', 'capital', 'opt'],
    ['issue_date', 'issueDate', 'opt'], ['renewal_date', 'renewalDate', 'opt'], ['expiry_date', 'expiryDate', 'opt'],
    ['fiscal_year', 'fiscalYear', 'opt'],
    ['license_fee', 'licenseFee'], ['vat', 'vat'], ['profession_tax', 'professionTax'], ['ad_tax', 'adTax'],
    ['arrears', 'arrears'], ['service_charge', 'serviceCharge'], ['total_fee', 'totalFee'], ['photo', 'photo', 'opt'],
  ],
  searchWhere: 'cert_no ILIKE $1 OR business_name ILIKE $1 OR owner_name ILIKE $1 OR mobile ILIKE $1 OR nid ILIKE $1',
  lookupWhere: 'cert_no = $1 OR nid = $1 OR mobile = $1',
  parse,
  shape: (r) => ({
    id: r.id, certNo: r.cert_no, businessName: r.business_name, ownerName: r.owner_name, fatherName: r.father_name,
    motherName: r.mother_name, mobile: r.mobile, nid: r.nid || '', brn: r.brn || '', taxId: r.tax_id || '',
    businessAddress: r.business_address, businessType: r.business_type, capital: r.capital || '',
    issueDate: r.issue_date || '', renewalDate: r.renewal_date || '', expiryDate: r.expiry_date || '', fiscalYear: r.fiscal_year || '',
    licenseFee: r.license_fee, vat: r.vat, professionTax: r.profession_tax, adTax: r.ad_tax,
    arrears: r.arrears, serviceCharge: r.service_charge, totalFee: r.total_fee, photo: r.photo || '', createdAt: r.created_at, publicKey: r.public_key,
  }),
});
