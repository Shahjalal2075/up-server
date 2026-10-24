import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { authenticate, requirePage } from '../middleware/auth.js';
import { WARD_COUNT } from '../config/constants.js';
import { loadSite } from './site.js';
import { text, toAscii, mobile } from '../utils/validate.js';

const router = Router();
router.use(authenticate, requirePage('agriculture-certificates'));

const PAGE_SIZE = 20;
const MARITAL = ['বিবাহিত', 'অবিবাহিত', 'বিধবা', 'বিপত্নীক', 'তালাকপ্রাপ্ত'];
const COLS = `id, cert_no, applicant_name, father_name, mother_name, spouse_name,
  to_char(birth_date, 'YYYY-MM-DD') AS birth_date, marital_status, mobile, nid, brn, post_office,
  current_address, permanent_address, created_at`;

const shape = (r) => ({
  id: r.id, certNo: r.cert_no, applicantName: r.applicant_name, fatherName: r.father_name, motherName: r.mother_name,
  spouseName: r.spouse_name || '', birthDate: r.birth_date, maritalStatus: r.marital_status, mobile: r.mobile,
  nid: r.nid || '', brn: r.brn || '', postOffice: r.post_office || '',
  currentAddress: r.current_address, permanentAddress: r.permanent_address, createdAt: r.created_at,
});

class VErr extends Error {}
const need = (v, label, max = 150) => {
  const s = text(v).replace(/\s+/g, ' ');
  if (!s) throw new VErr(`${label} দিন।`);
  if (s.length > max) throw new VErr(`${label} সর্বোচ্চ ${max} অক্ষরের হতে পারে।`);
  return s;
};
const opt = (v, label, max = 150) => {
  const s = text(v).replace(/\s+/g, ' ');
  if (s.length > max) throw new VErr(`${label} সর্বোচ্চ ${max} অক্ষরের হতে পারে।`);
  return s;
};
const digits = (v, label, re) => {
  const s = toAscii(v).replace(/[\s-]/g, '');
  if (!s) return '';
  if (!re.test(s)) throw new VErr(`${label} সঠিক নয়।`);
  return s;
};

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
  const birth = toAscii(b.birthDate);
  const bd = /^\d{4}-\d{2}-\d{2}$/.test(birth) ? new Date(`${birth}T00:00:00Z`) : null;
  if (!bd || Number.isNaN(bd.getTime()) || bd.toISOString().slice(0, 10) !== birth || bd.getUTCFullYear() < 1900 || bd > new Date())
    throw new VErr('জন্ম তারিখ সঠিক নয়।');
  const maritalStatus = text(b.maritalStatus);
  if (!MARITAL.includes(maritalStatus)) throw new VErr('বৈবাহিক অবস্থা নির্বাচন করুন।');
  const mob = mobile(b.mobile);
  if (!mob) throw new VErr('মোবাইল নম্বর সঠিক নয় (যেমন: 01712345678)।');

  return {
    applicantName: need(b.applicantName, 'আবেদনকারীর নাম'),
    fatherName: need(b.fatherName, 'পিতার নাম'),
    motherName: need(b.motherName, 'মাতার নাম'),
    spouseName: opt(b.spouseName, 'স্বামী/স্ত্রীর নাম'),
    birthDate: birth,
    maritalStatus,
    mobile: mob,
    nid: digits(b.nid, 'NID নম্বর', /^(\d{10}|\d{13}|\d{17})$/),
    brn: digits(b.brn, 'জন্ম নিবন্ধন নম্বর', /^\d{10,20}$/),
    postOffice: opt(b.postOffice, 'ডাকঘর', 100),
    currentAddress: address(b.currentAddress, 'বর্তমান ঠিকানা', d),
    permanentAddress: address(b.permanentAddress, 'স্থায়ী ঠিকানা', d),
  };
}

// সনদ নং: YYYYMMDD (ঢাকার সময়) + ৯ সংখ্যার র‍্যান্ডম = ১৭ সংখ্যা
function genCertNo() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date()).replace(/-/g, '');
  return d + String(crypto.randomInt(0, 1_000_000_000)).padStart(9, '0');
}

const like = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

router.get('/', async (req, res, next) => {
  try {
    const q = toAscii(req.query.q || '').slice(0, 100);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const where = ['deleted_at IS NULL'];
    const vals = [];
    if (q) {
      vals.push(like(q));
      where.push(`(cert_no ILIKE $1 OR applicant_name ILIKE $1 OR nid ILIKE $1 OR mobile ILIKE $1)`);
    }
    const w = where.join(' AND ');
    const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM agri_certificates WHERE ${w}`, vals)).rows[0].n;
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM agri_certificates WHERE ${w} ORDER BY id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, vals
    );
    res.json({ items: rows.map(shape), total, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  } catch (err) { next(err); }
});

// সনদ নং / NID / মোবাইল দিয়ে হুবহু খোঁজা (নতুন আবেদন ও সনদ পেজের সার্চ বার)
router.get('/lookup', async (req, res, next) => {
  try {
    const q = toAscii(req.query.q || '').replace(/[\s-]/g, '').slice(0, 30);
    if (!q) return res.status(404).json({ message: 'পাওয়া যায়নি।' });
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM agri_certificates
       WHERE deleted_at IS NULL AND (cert_no = $1 OR nid = $1 OR mobile = $1)
       ORDER BY id DESC LIMIT 1`, [q]
    );
    if (!rows[0]) return res.status(404).json({ message: 'পাওয়া যায়নি।' });
    res.json({ item: shape(rows[0]) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'ভুল আইডি।' });
    const { rows } = await pool.query(`SELECT ${COLS} FROM agri_certificates WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!rows[0]) return res.status(404).json({ message: 'প্রত্যয়নপত্র খুঁজে পাওয়া যায়নি।' });
    res.json({ item: shape(rows[0]) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  let v;
  try {
    const site = await loadSite();
    v = parse(req.body || {}, site.certificate);
  } catch (err) {
    if (err instanceof VErr) return res.status(400).json({ message: err.message });
    return next(err);
  }
  try {
    for (let i = 0; i < 6; i++) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO agri_certificates
             (cert_no, applicant_name, father_name, mother_name, spouse_name, birth_date, marital_status, mobile,
              nid, brn, post_office, current_address, permanent_address, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ${COLS}`,
          [genCertNo(), v.applicantName, v.fatherName, v.motherName, v.spouseName || null, v.birthDate, v.maritalStatus, v.mobile,
            v.nid || null, v.brn || null, v.postOffice || null, JSON.stringify(v.currentAddress), JSON.stringify(v.permanentAddress), req.user.id]
        );
        return res.status(201).json({ item: shape(rows[0]) });
      } catch (err) {
        if (err.code !== '23505') throw err; // সনদ নং মিলে গেলে আবার চেষ্টা
      }
    }
    res.status(500).json({ message: 'সনদ নম্বর তৈরি করা যায়নি। আবার চেষ্টা করুন।' });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'ভুল আইডি।' });
    const { rowCount } = await pool.query('UPDATE agri_certificates SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!rowCount) return res.status(404).json({ message: 'প্রত্যয়নপত্র খুঁজে পাওয়া যায়নি।' });
    res.json({ message: 'প্রত্যয়নপত্র ডিলিট করা হয়েছে।' });
  } catch (err) { next(err); }
});

export default router;
