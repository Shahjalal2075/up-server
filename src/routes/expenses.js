import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, requirePage } from '../middleware/auth.js';
import { VErr, need, money } from '../utils/cert.js';
import { todayStr } from '../services/billing.js';

// অ্যাকাউন্টিংয়ের খরচ: কোন মডারেটরকে কত টাকা কী উদ্দেশ্যে দেওয়া হয়েছে + মোট/দৈনিক/সাপ্তাহিক হিসাব
const router = Router();
router.use(authenticate, requirePage('expenses'));
const PAGE_SIZE = 20;

function validDate(v) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

router.get('/moderators', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, COALESCE(full_name, username) AS name, username, is_active FROM users
       WHERE role = 'moderator' AND deleted_at IS NULL ORDER BY LOWER(COALESCE(full_name, username))`
    );
    res.json({ moderators: rows.map((r) => ({ id: r.id, name: r.name, username: r.username, isActive: r.is_active })) });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const today = todayStr();
    const from = validDate(req.query.from);
    const to = validDate(req.query.to);
    const mod = Number.parseInt(req.query.moderator, 10);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const vals = [];
    let where = 'e.deleted_at IS NULL';
    if (from) { vals.push(from); where += ` AND e.expense_date >= $${vals.length}::date`; }
    if (to) { vals.push(to); where += ` AND e.expense_date <= $${vals.length}::date`; }
    if (Number.isInteger(mod)) { vals.push(mod); where += ` AND e.moderator_id = $${vals.length}`; }

    const agg = (await pool.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(e.amount), 0)::float8 AS s FROM moderator_expenses e WHERE ${where}`, vals)).rows[0];
    const list = await pool.query(
      `SELECT e.id, e.amount::float8 AS amount, e.note, to_char(e.expense_date, 'YYYY-MM-DD') AS expense_date, e.created_at,
              COALESCE(m.full_name, m.username) AS moderator_name, e.recipient_name, COALESCE(c.full_name, c.username) AS created_by_name
       FROM moderator_expenses e LEFT JOIN users m ON m.id = e.moderator_id LEFT JOIN users c ON c.id = e.created_by
       WHERE ${where} ORDER BY e.expense_date DESC, e.id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, vals
    );
    // দৈনিক ও সাপ্তাহিক (শনি–শুক্র) হিসাব — ফিল্টার মেনে
    const daily = await pool.query(
      `SELECT to_char(e.expense_date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n, SUM(e.amount)::float8 AS s
       FROM moderator_expenses e WHERE ${where} GROUP BY 1 ORDER BY 1 DESC LIMIT 60`, vals
    );
    const weekly = await pool.query(
      `SELECT to_char((e.expense_date - ((EXTRACT(DOW FROM e.expense_date)::int + 1) % 7)), 'YYYY-MM-DD') AS ws,
              COUNT(*)::int AS n, SUM(e.amount)::float8 AS s
       FROM moderator_expenses e WHERE ${where} GROUP BY 1 ORDER BY 1 DESC LIMIT 26`, vals
    );
    // ফিল্টারের বাইরের কার্ড: আজ / গত ৭ দিন / চলতি মাস
    const cards = (await pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE expense_date = $1::date), 0)::float8 AS today,
              COALESCE(SUM(amount) FILTER (WHERE expense_date >= $1::date - 6 AND expense_date <= $1::date), 0)::float8 AS week,
              COALESCE(SUM(amount) FILTER (WHERE expense_date >= date_trunc('month', $1::date)::date AND expense_date <= $1::date), 0)::float8 AS month
       FROM moderator_expenses WHERE deleted_at IS NULL`, [today]
    )).rows[0];

    res.json({
      today, cards, total: agg.s, count: agg.n, page, pages: Math.max(1, Math.ceil(agg.n / PAGE_SIZE)),
      items: list.rows.map((r) => ({ id: r.id, amount: r.amount, note: r.note, date: r.expense_date, createdAt: r.created_at, moderatorName: r.moderator_name || '', recipientName: r.recipient_name || '', createdBy: r.created_by_name || '' })),
      daily: daily.rows.map((r) => ({ date: r.d, count: r.n, total: r.s })),
      weekly: weekly.rows.map((r) => ({ weekStart: r.ws, count: r.n, total: r.s })),
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    // কাকে দিয়েছে: মডারেটর বাছা বা নিজে লেখা নাম — দুটোই ঐচ্ছিক
    let moderatorId = null;
    const rawMod = req.body?.moderatorId;
    if (rawMod !== undefined && rawMod !== null && rawMod !== '') {
      moderatorId = Number(rawMod);
      const m = Number.isInteger(moderatorId)
        ? (await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'moderator' AND deleted_at IS NULL", [moderatorId])).rowCount
        : 0;
      if (!m) throw new VErr('মডারেটর নির্বাচন ঠিক নয়।');
    }
    const recipientName = String(req.body?.recipientName ?? '').trim().replace(/\s+/g, ' ');
    if (recipientName.length > 100) throw new VErr('নাম সর্বোচ্চ ১০০ অক্ষরের হতে পারে।');
    const amount = money(req.body?.amount, 'টাকার পরিমাণ');
    if (amount <= 0) throw new VErr('টাকার পরিমাণ ০-এর বেশি দিন।');
    const note = need(req.body?.note, 'বিবরণ/মন্তব্য', 300);
    if (note.length < 3) throw new VErr('বিবরণ/মন্তব্য লিখুন।');
    const today = todayStr();
    const date = req.body?.date ? validDate(req.body.date) : today;
    if (!date || date > today || date < '2000-01-01') throw new VErr('তারিখ সঠিক নয় (আজকের পরের তারিখ দেওয়া যায় না)।');

    const { rows } = await pool.query(
      'INSERT INTO moderator_expenses (moderator_id, recipient_name, amount, note, expense_date, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [moderatorId, recipientName || null, amount, note, date, req.user.id]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err instanceof VErr) return res.status(400).json({ message: err.message });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'ভুল আইডি।' });
    const { rowCount } = await pool.query('UPDATE moderator_expenses SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!rowCount) return res.status(404).json({ message: 'খরচ খুঁজে পাওয়া যায়নি।' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
