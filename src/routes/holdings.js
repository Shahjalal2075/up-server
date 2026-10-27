import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, requirePage, requireRoles } from '../middleware/auth.js';
import { WARD_COUNT } from '../config/constants.js';
import { UP_BENEFITS, HOUSE_TYPES } from '../config/holdingOptions.js';
import { text, toAscii, mobile } from '../utils/validate.js';
import { VErr, need, opt, digits, money } from '../utils/cert.js';
import { getConfig, moderatorBilling } from '../services/billing.js';

// ডিজিটাল হোল্ডিং নম্বর।
//  দেখা/প্রিন্ট: Super Admin, Admin, Moderator, Printer | যোগ/এডিট: Printer বাদে বাকি ৩ জন | ডিলিট: শুধু Super Admin, Admin
export const NATURAL_HOLDING_SORT = `ARRAY(SELECT LEFT(x, 15)::bigint FROM regexp_split_to_table(holding_no, '\\D+') AS x WHERE x <> '')`;

const router = Router();
router.use(authenticate, requirePage('holdings'));
const EDITORS = ['super_admin', 'admin', 'moderator'];
const DELETERS = ['super_admin', 'admin'];
const PAGE_SIZE = 20;

const COLS = `id, holding_no, owner_name, father_name, mother_name, nid, mobile, ward_no, village, family_members,
  permanent_address, up_benefit, land_area, house_type, occupation, annual_income::float8 AS annual_income,
  annual_tax::float8 AS annual_tax, surveyor_name, note, created_at, public_key`;

const FIELDS = [
  ['holding_no', 'holdingNo'], ['owner_name', 'ownerName'], ['father_name', 'fatherName'], ['mother_name', 'motherName'],
  ['nid', 'nid'], ['mobile', 'mobile'], ['ward_no', 'wardNo'], ['village', 'village'], ['family_members', 'familyMembers'],
  ['permanent_address', 'permanentAddress'], ['up_benefit', 'upBenefit'], ['land_area', 'landArea'], ['house_type', 'houseType'],
  ['occupation', 'occupation'], ['annual_income', 'annualIncome'], ['annual_tax', 'annualTax'], ['surveyor_name', 'surveyorName'],
  ['note', 'note'],
];

export const holdingShape = (r) => shape(r);
export const HOLDING_COLS = () => COLS;
const shape = (r) => ({
  id: r.id, holdingNo: r.holding_no, ownerName: r.owner_name, fatherName: r.father_name || '', motherName: r.mother_name || '',
  nid: r.nid || '', mobile: r.mobile || '', wardNo: r.ward_no, village: r.village || '', familyMembers: r.family_members,
  permanentAddress: r.permanent_address || '', upBenefit: r.up_benefit || UP_BENEFITS[0], landArea: r.land_area || '',
  houseType: r.house_type || '', occupation: r.occupation || '', annualIncome: r.annual_income ?? 0, annualTax: r.annual_tax ?? 0,
  surveyorName: r.surveyor_name || '', note: r.note || '', createdAt: r.created_at, publicKey: r.public_key,
});

function parse(b) {
  const holdingNo = toAscii(b.holdingNo).replace(/\s+/g, '');
  if (!holdingNo) throw new VErr('হোল্ডিং নম্বর দিন।');
  if (!/^[A-Za-z0-9/.\-]{1,30}$/.test(holdingNo)) throw new VErr('হোল্ডিং নম্বর সর্বোচ্চ ৩০ অক্ষরের (সংখ্যা, ইংরেজি অক্ষর, - বা /) হতে পারে।');

  const ward = toAscii(b.wardNo);
  if (!/^\d{1,2}$/.test(ward) || Number(ward) < 1 || Number(ward) > WARD_COUNT) throw new VErr('ওয়ার্ড নং নির্বাচন করুন।');

  const members = toAscii(b.familyMembers);
  if (!/^\d{1,3}$/.test(members) || Number(members) < 1) throw new VErr('পরিবারের সদস্য সংখ্যা সঠিকভাবে দিন।');

  const mob = mobile(b.mobile);
  if (!mob) throw new VErr('মোবাইল নম্বর সঠিক নয় (যেমন: 01712345678)।');
  const nid = digits(b.nid, 'এন আই ডি / জন্ম নিবন্ধন নং', /^\d{10,20}$/);
  if (!nid) throw new VErr('এন আই ডি / জন্ম নিবন্ধন নং দিন।');

  const upBenefit = text(b.upBenefit) || UP_BENEFITS[0];
  if (!UP_BENEFITS.includes(upBenefit)) throw new VErr('ইউপি সুবিধার ঘরে সঠিক অপশন নির্বাচন করুন।');
  const houseType = text(b.houseType);
  if (!HOUSE_TYPES.includes(houseType)) throw new VErr('হোল্ডিং / বাসা / বাড়ির ধরন নির্বাচন করুন।');

  return {
    holdingNo,
    ownerName: need(b.ownerName, 'বাসা/হোল্ডিং মালিকের নাম'),
    fatherName: need(b.fatherName, 'পিতা/স্বামীর নাম'),
    motherName: need(b.motherName, 'মাতার নাম'),
    nid,
    mobile: mob,
    wardNo: Number(ward),
    village: need(b.village, 'গ্রাম/মহল্লা', 100),
    familyMembers: Number(members),
    permanentAddress: need(b.permanentAddress, 'স্থায়ী ঠিকানা', 250),
    upBenefit,
    landArea: need(b.landArea, 'জমি জায়গার পরিমাণ', 50),
    houseType,
    occupation: need(b.occupation, 'পেশা', 100),
    annualIncome: money(b.annualIncome, 'বাৎসরিক আয়'),
    annualTax: money(b.annualTax, 'ধার্যকৃত কর'),
    surveyorName: need(b.surveyorName, 'জরিপকারীর নাম'),
    note: opt(b.note, 'মন্তব্য', 500),
  };
}

const like = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const DUP = { message: 'এই হোল্ডিং নম্বরটি আগে থেকেই আছে।' };

const isMod = (req) => req.user.role === 'moderator';
const ownerArg = (req) => (isMod(req) ? req.user.id : null); // moderator shudhu nijer add kora holding dekhe

const EMPTY_STATS = () => ({ certificate: { print: 0, download: 0 }, plate: { print: 0, download: 0 } });

router.get('/', async (req, res, next) => {
  try {
    const q = toAscii(req.query.q || '').slice(0, 100);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const vals = [];
    let scope = 'deleted_at IS NULL';
    if (isMod(req)) { vals.push(req.user.id); scope += ` AND created_by = $${vals.length}`; }
    let where = scope;
    if (q) {
      vals.push(like(q));
      const n = vals.length;
      where += ` AND (holding_no ILIKE $${n} OR owner_name ILIKE $${n} OR village ILIKE $${n} OR father_name ILIKE $${n} OR mobile ILIKE $${n})`;
    }
    const scopeVals = isMod(req) ? [req.user.id] : [];
    const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM holdings WHERE ${where}`, vals)).rows[0].n;
    const grandTotal = q ? (await pool.query(`SELECT COUNT(*)::int AS n FROM holdings WHERE ${scope}`, scopeVals)).rows[0].n : total;
    // সর্ট: তারিখ অনুযায়ী (নতুন যোগ) বা হোল্ডিং নম্বর অনুযায়ী (03/264 < 389 — সংখ্যার হিসাবে)
    const dir = req.query.order === 'asc' ? 'ASC' : 'DESC';
    const orderBy = req.query.sort === 'holding'
      ? `${NATURAL_HOLDING_SORT} ${dir}, holding_no ${dir}, id ${dir}`
      : `created_at ${dir}, id ${dir}`;
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM holdings WHERE ${where} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, vals
    );
    const items = rows.map(shape);

    // প্রতিটি হোল্ডিংয়ের সনদ/প্লেট কতবার প্রিন্ট ও ডাউনলোড হয়েছে (hover-e dekhay)
    if (items.length) {
      const ev = await pool.query(
        `SELECT holding_id, doc, action, COUNT(*)::int AS n FROM holding_events
         WHERE holding_id = ANY($1::int[]) GROUP BY holding_id, doc, action`, [items.map((i) => i.id)]
      );
      const map = new Map(items.map((i) => [i.id, (i.stats = EMPTY_STATS())]));
      for (const e of ev.rows) {
        const st = map.get(e.holding_id);
        if (st?.[e.doc]) st[e.doc][e.action] = e.n;
      }
    }
    let billing = null;
    if (isMod(req)) {
      const b = await moderatorBilling(req.user.id);
      billing = { blocked: b.blocked, previousDue: b.previousDue, totalDue: b.totalDue };
    }
    res.json({ items, total, grandTotal, billing, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'ভুল আইডি।' });
    const { rows } = await pool.query(`SELECT ${COLS} FROM holdings WHERE id = $1 AND deleted_at IS NULL AND ($2::int IS NULL OR created_by = $2)`, [id, ownerArg(req)]);
    if (!rows[0]) return res.status(404).json({ message: 'হোল্ডিং খুঁজে পাওয়া যায়নি।' });
    res.json({ item: shape(rows[0]) });
  } catch (err) { next(err); }
});

router.post('/', requireRoles(...EDITORS), async (req, res, next) => {
  let v;
  try { v = parse(req.body || {}); } catch (err) {
    if (err instanceof VErr) return res.status(400).json({ message: err.message });
    return next(err);
  }
  try {
    // মডারেটর: আগের দিনের পেমেন্ট অনুমোদিত না হলে নতুন এন্ট্রি বন্ধ; এন্ট্রির চার্জ এখনকার রেটে ঠিক হয়
    let fee = null;
    if (isMod(req)) {
      const b = await moderatorBilling(req.user.id);
      if (b.previousDue > 0) {
        return res.status(403).json({
          code: 'PAYMENT_DUE', previousDue: b.previousDue,
          message: `আগের দিনের ৳${b.previousDue} পেমেন্ট বাকি আছে। পেমেন্ট সম্পূর্ণ (অনুমোদিত) না হওয়া পর্যন্ত নতুন হোল্ডিং যোগ করা যাবে না।`,
        });
      }
      fee = (await getConfig()).entryFee;
    }
    const cols = FIELDS.map(([c]) => c);
    const vals = FIELDS.map(([, k]) => (k === 'note' ? v[k] || null : v[k]));
    vals.push(fee, req.user.id);
    const marks = vals.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `INSERT INTO holdings (${cols.join(', ')}, entry_fee, created_by) VALUES (${marks}) RETURNING ${COLS}`, vals
    );
    res.status(201).json({ item: shape(rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json(DUP);
    next(err);
  }
});

router.put('/:id', requireRoles(...EDITORS), async (req, res, next) => {
  let v;
  try { v = parse(req.body || {}); } catch (err) {
    if (err instanceof VErr) return res.status(400).json({ message: err.message });
    return next(err);
  }
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'ভুল আইডি।' });
    const sets = FIELDS.map(([c], i) => `${c} = $${i + 1}`);
    const vals = FIELDS.map(([, k]) => (k === 'note' ? v[k] || null : v[k]));
    vals.push(id, ownerArg(req));
    const { rows } = await pool.query(
      `UPDATE holdings SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${vals.length - 1} AND deleted_at IS NULL AND ($${vals.length}::int IS NULL OR created_by = $${vals.length}) RETURNING ${COLS}`, vals
    );
    if (!rows[0]) return res.status(404).json({ message: 'হোল্ডিং খুঁজে পাওয়া যায়নি।' });
    res.json({ item: shape(rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json(DUP);
    next(err);
  }
});

// Soft delete: ভবিষ্যতে ট্যাক্স আদায়ের হিসাব নষ্ট হয় না
router.delete('/:id', requireRoles(...DELETERS), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'ভুল আইডি।' });
    const { rowCount } = await pool.query('UPDATE holdings SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!rowCount) return res.status(404).json({ message: 'হোল্ডিং খুঁজে পাওয়া যায়নি।' });
    res.json({ message: 'হোল্ডিং ডিলিট করা হয়েছে।' });
  } catch (err) { next(err); }
});

// প্রিন্ট/ডাউনলোড হলে গোনা হয় (printer dashboard ও hover-er jonno)
router.post('/:id/events', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const doc = String(req.body?.doc || '');
    const action = String(req.body?.action || '');
    if (!Number.isInteger(id) || !['certificate', 'plate'].includes(doc) || !['print', 'download'].includes(action)) {
      return res.status(400).json({ message: 'ভুল অনুরোধ।' });
    }
    const ok = await pool.query('SELECT 1 FROM holdings WHERE id = $1 AND deleted_at IS NULL AND ($2::int IS NULL OR created_by = $2)', [id, ownerArg(req)]);
    if (!ok.rowCount) return res.status(404).json({ message: 'হোল্ডিং খুঁজে পাওয়া যায়নি।' });
    await pool.query('INSERT INTO holding_events (holding_id, doc, action, user_id) VALUES ($1, $2, $3, $4)', [id, doc, action, req.user.id]);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
