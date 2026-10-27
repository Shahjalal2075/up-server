import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, requirePage, requireRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requirePage('dashboard'));

const TZ = "AT TIME ZONE 'Asia/Dhaka'";
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

// YYYY-MM-DD, বাস্তব তারিখ না হলে null
function validDate(v) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

// ---------- Super Admin / Admin / Accounting: ট্যাক্স ও হোল্ডিংয়ের মোট হিসাব ----------
router.get('/stats', requireRoles('super_admin', 'admin', 'accounting'), async (_req, res, next) => {
  try {
    // ধার্য = প্রতি হোল্ডিংয়ের বার্ষিক কর × এন্ট্রির বছর থেকে এ বছর পর্যন্ত বছর; আদায় = tax_collections
    const cy = Number(todayStr().slice(0, 4));
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total_holdings,
              COALESCE(SUM(annual_tax * GREATEST(1, $1::int - EXTRACT(YEAR FROM created_at ${TZ})::int + 1)), 0)::float8 AS total_tax
       FROM holdings WHERE deleted_at IS NULL`, [cy]
    );
    const col = await pool.query(
      `SELECT COALESCE(SUM(tc.amount), 0)::float8 AS s FROM tax_collections tc JOIN holdings h ON h.id = tc.holding_id AND h.deleted_at IS NULL`
    );
    const s = rows[0];
    const collected = col.rows[0].s;
    res.json({
      totalHoldings: s.total_holdings,
      totalTax: s.total_tax,
      collectedTax: collected,
      dueTax: Math.max(s.total_tax - collected, 0),
    });
  } catch (err) { next(err); }
});

// ---------- Moderator: নিজের যোগ করা হোল্ডিং (আজ / গত ৭ দিন / চলতি মাস / মোট) + তারিখ অনুযায়ী ----------
router.get('/my-activity', requireRoles('moderator'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE (created_at ${TZ})::date = (NOW() ${TZ})::date)::int AS today,
         COUNT(*) FILTER (WHERE (created_at ${TZ})::date >= (NOW() ${TZ})::date - 6)::int AS week,
         COUNT(*) FILTER (WHERE date_trunc('month', created_at ${TZ}) = date_trunc('month', NOW() ${TZ}))::int AS month,
         COUNT(*)::int AS total
       FROM holdings WHERE deleted_at IS NULL AND created_by = $1`, [req.user.id]
    );
    const out = { ...rows[0] };

    const date = validDate(req.query.date);
    if (req.query.date && !date) return res.status(400).json({ message: 'তারিখ সঠিক নয়।' });
    if (date) {
      const where = `deleted_at IS NULL AND created_by = $1 AND (created_at ${TZ})::date = $2::date`;
      const count = (await pool.query(`SELECT COUNT(*)::int AS n FROM holdings WHERE ${where}`, [req.user.id, date])).rows[0].n;
      const items = (await pool.query(
        `SELECT id, holding_no, owner_name, created_at FROM holdings WHERE ${where} ORDER BY created_at DESC LIMIT 200`, [req.user.id, date]
      )).rows.map((r) => ({ id: r.id, holdingNo: r.holding_no, ownerName: r.owner_name, createdAt: r.created_at }));
      out.date = { date, count, items };
    }
    res.json(out);
  } catch (err) { next(err); }
});

// ---------- Super Admin / Admin: আজ মোট + মডারেটর অনুযায়ী (তারিখ ফিল্টার ও সর্ট) ----------
const SORTS = {
  count: 'count', name: 'LOWER(u.full_name)', recent: 'last_at',
};
router.get('/team', requireRoles('super_admin', 'admin'), async (req, res, next) => {
  try {
    const today = todayStr();
    let from = validDate(req.query.from) || today;
    let to = validDate(req.query.to) || today;
    if (from > to) [from, to] = [to, from];
    const sortKey = SORTS[req.query.sort] ? req.query.sort : 'count';
    const dir = req.query.order === 'asc' ? 'ASC' : 'DESC';
    const nulls = dir === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';

    const todayTotal = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM holdings WHERE deleted_at IS NULL AND (created_at ${TZ})::date = $1::date`, [today]
    )).rows[0].n;

    const mods = await pool.query(
      `SELECT u.id, u.full_name, u.username, u.is_active, COUNT(h.id)::int AS count, MAX(h.created_at) AS last_at
       FROM users u
       LEFT JOIN holdings h ON h.created_by = u.id AND h.deleted_at IS NULL
         AND (h.created_at ${TZ})::date BETWEEN $1::date AND $2::date
       WHERE u.role = 'moderator' AND u.deleted_at IS NULL
       GROUP BY u.id
       ORDER BY ${SORTS[sortKey]} ${dir} ${nulls}, LOWER(u.full_name) ASC`, [from, to]
    );

    // মডারেটর ছাড়া অন্য কারও (Admin ইত্যাদি) বা আগের ডাটা
    const others = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM holdings h LEFT JOIN users u ON u.id = h.created_by
       WHERE h.deleted_at IS NULL AND (h.created_at ${TZ})::date BETWEEN $1::date AND $2::date
         AND (u.id IS NULL OR u.role <> 'moderator' OR u.deleted_at IS NOT NULL)`, [from, to]
    )).rows[0].n;

    const moderators = mods.rows.map((m) => ({
      id: m.id, name: m.full_name || m.username, username: m.username, isActive: m.is_active, count: m.count, lastAt: m.last_at,
    }));
    res.json({
      today, todayTotal, from, to, sort: sortKey, order: dir.toLowerCase(), moderators, others,
      rangeTotal: moderators.reduce((s, m) => s + m.count, 0) + others,
    });
  } catch (err) { next(err); }
});

// ---------- Printer: মোট হোল্ডিং, নিজে কতবার প্রিন্ট ও ডাউনলোড করেছে ----------
router.get('/printer', requireRoles('printer'), async (req, res, next) => {
  try {
    const total = (await pool.query('SELECT COUNT(*)::int AS n FROM holdings WHERE deleted_at IS NULL')).rows[0].n;
    const ev = await pool.query(
      'SELECT doc, action, COUNT(*)::int AS n FROM holding_events WHERE user_id = $1 GROUP BY doc, action', [req.user.id]
    );
    const blank = () => ({ total: 0, certificate: 0, plate: 0 });
    const out = { totalHoldings: total, prints: blank(), downloads: blank() };
    for (const e of ev.rows) {
      const t = e.action === 'print' ? out.prints : out.downloads;
      t[e.doc] = e.n;
      t.total += e.n;
    }
    res.json(out);
  } catch (err) { next(err); }
});

export default router;
