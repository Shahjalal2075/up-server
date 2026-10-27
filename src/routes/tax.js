import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, requirePage } from '../middleware/auth.js';
import { toAscii } from '../utils/validate.js';
import { round2, todayStr } from '../services/billing.js';
import { NATURAL_HOLDING_SORT } from './holdings.js';

// ট্যাক্স আদায়। কর-বছর = ক্যালেন্ডার বছর (ঢাকা)। গণনা শুরু হয় হোল্ডিং যে বছর এন্ট্রি হয়েছে সেই বছর থেকে।
// কোনো বছরের কর দেওয়ার পর পরের বছর থেকে আবার গণনা। একাধিক বছর বাকি থাকলে সব বছরের কর একসাথে দিতে হয়।
const router = Router();
router.use(authenticate, requirePage('tax-collection'));
const TZ = "AT TIME ZONE 'Asia/Dhaka'";
const PAGE_SIZE = 20;
const like = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function validDate(v) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

// একটি হোল্ডিংয়ের কর-বছরের হিসাব
function buildLedger(h, collections, cy) {
  const paidYears = new Set();
  let last = null; // সর্বশেষ কর-বছর ও তার আদায়ের তারিখ
  for (const c of collections) {
    for (const y of c.years) {
      paidYears.add(y);
      if (!last || y > last.year) last = { year: y, paidOn: c.paid_on };
    }
  }
  const dueYears = [];
  for (let y = h.start_year; y <= cy; y++) if (!paidYears.has(y)) dueYears.push(y);
  return { startYear: h.start_year, currentYear: cy, paidYears: [...paidYears].sort(), dueYears, dueTotal: round2(h.annual_tax * dueYears.length), lastPaid: last };
}

// ---------- উপরের কার্ড: চলতি মাস / বছর / মোট আদায় ----------
router.get('/summary', async (_req, res, next) => {
  try {
    const today = todayStr();
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(tc.amount) FILTER (WHERE tc.paid_on >= date_trunc('month', $1::date)::date AND tc.paid_on <= $1::date), 0)::float8 AS month,
         COALESCE(SUM(tc.amount) FILTER (WHERE tc.paid_on >= date_trunc('year', $1::date)::date AND tc.paid_on <= $1::date), 0)::float8 AS year,
         COALESCE(SUM(tc.amount), 0)::float8 AS total
       FROM tax_collections tc JOIN holdings h ON h.id = tc.holding_id AND h.deleted_at IS NULL`, [today]
    );
    res.json({ ...rows[0], today, currentYear: Number(today.slice(0, 4)) });
  } catch (err) { next(err); }
});

// ---------- সার্চ: হোল্ডিং + কোন কোন বছরের কর বাকি ----------
router.get('/search', async (req, res, next) => {
  try {
    const q = toAscii(req.query.q || '').slice(0, 100);
    if (!q) return res.json({ items: [] });
    const cy = Number(todayStr().slice(0, 4));
    const hs = await pool.query(
      `SELECT id, holding_no, owner_name, father_name, ward_no, village, mobile, annual_tax::float8 AS annual_tax,
              EXTRACT(YEAR FROM created_at ${TZ})::int AS start_year
       FROM holdings
       WHERE deleted_at IS NULL AND (holding_no ILIKE $1 OR owner_name ILIKE $1 OR village ILIKE $1 OR father_name ILIKE $1 OR mobile ILIKE $1)
       ORDER BY (LOWER(holding_no) = LOWER($2)) DESC, id DESC LIMIT 10`, [like(q), q]
    );
    const ids = hs.rows.map((h) => h.id);
    const cs = ids.length
      ? await pool.query('SELECT holding_id, years, to_char(paid_on, \'YYYY-MM-DD\') AS paid_on FROM tax_collections WHERE holding_id = ANY($1::int[])', [ids])
      : { rows: [] };
    const items = hs.rows.map((h) => ({
      id: h.id, holdingNo: h.holding_no, ownerName: h.owner_name, fatherName: h.father_name || '', wardNo: h.ward_no,
      village: h.village || '', mobile: h.mobile || '', annualTax: h.annual_tax,
      ...buildLedger(h, cs.rows.filter((c) => c.holding_id === h.id), cy),
    }));
    res.json({ items });
  } catch (err) { next(err); }
});

// ---------- Mark as Paid: বাকি সব বছরের কর একসাথে ----------
router.post('/collect', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const holdingId = Number(req.body?.holdingId);
    const paidOn = validDate(req.body?.paidOn);
    const today = todayStr();
    if (!Number.isInteger(holdingId)) return res.status(400).json({ message: 'ভুল অনুরোধ।' });
    if (!paidOn || paidOn > today || paidOn < '2000-01-01') return res.status(400).json({ message: 'আদায়ের তারিখ সঠিক নয় (আজকের পরের তারিখ দেওয়া যায় না)।' });

    await client.query('BEGIN');
    const h = (await client.query(
      `SELECT id, annual_tax::float8 AS annual_tax, EXTRACT(YEAR FROM created_at ${TZ})::int AS start_year
       FROM holdings WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [holdingId]
    )).rows[0];
    if (!h) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'হোল্ডিং খুঁজে পাওয়া যায়নি।' }); }
    const cs = await client.query('SELECT years, paid_on FROM tax_collections WHERE holding_id = $1', [holdingId]);
    const led = buildLedger(h, cs.rows, Number(today.slice(0, 4)));
    if (led.dueYears.length === 0) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'এই হোল্ডিংয়ের কোনো কর বাকি নেই।' }); }
    if (!(h.annual_tax > 0)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'এই হোল্ডিংয়ের ধার্যকৃত কর ০। আগে হোল্ডিংয়ে কর ধার্য করুন।' }); }

    await client.query(
      'INSERT INTO tax_collections (holding_id, years, amount, paid_on, collected_by) VALUES ($1, $2, $3, $4, $5)',
      [holdingId, led.dueYears, led.dueTotal, paidOn, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ ok: true, years: led.dueYears, amount: led.dueTotal });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ---------- ইতিহাস: ফিল্টার, সর্ট (সময়/হোল্ডিং নম্বর), ২০ টি করে পেজ ----------
router.get('/history', async (req, res, next) => {
  try {
    const from = validDate(req.query.from);
    const to = validDate(req.query.to);
    const q = toAscii(req.query.q || '').slice(0, 100);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const dir = req.query.order === 'asc' ? 'ASC' : 'DESC';
    const vals = [];
    let where = 'h.deleted_at IS NULL';
    if (from) { vals.push(from); where += ` AND tc.paid_on >= $${vals.length}::date`; }
    if (to) { vals.push(to); where += ` AND tc.paid_on <= $${vals.length}::date`; }
    if (q) { vals.push(like(q)); where += ` AND (h.holding_no ILIKE $${vals.length} OR h.owner_name ILIKE $${vals.length})`; }
    const natural = NATURAL_HOLDING_SORT.replace(/holding_no/g, 'h.holding_no');
    const orderBy = req.query.sort === 'holding'
      ? `${natural} ${dir}, h.holding_no ${dir}, tc.id ${dir}`
      : `tc.created_at ${dir}, tc.id ${dir}`;

    const join = 'FROM tax_collections tc JOIN holdings h ON h.id = tc.holding_id LEFT JOIN users u ON u.id = tc.collected_by';
    const agg = (await pool.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(tc.amount), 0)::float8 AS s ${join} WHERE ${where}`, vals)).rows[0];
    const { rows } = await pool.query(
      `SELECT tc.id, tc.years, tc.amount::float8 AS amount, to_char(tc.paid_on, 'YYYY-MM-DD') AS paid_on, tc.created_at,
              h.holding_no, h.owner_name, COALESCE(u.full_name, u.username) AS collector
       ${join} WHERE ${where} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, vals
    );
    res.json({
      items: rows.map((r) => ({ id: r.id, years: r.years, amount: r.amount, paidOn: r.paid_on, createdAt: r.created_at, holdingNo: r.holding_no, ownerName: r.owner_name, collector: r.collector || '' })),
      total: agg.n, rangeTotal: agg.s, page, pages: Math.max(1, Math.ceil(agg.n / PAGE_SIZE)),
    });
  } catch (err) { next(err); }
});

export default router;
