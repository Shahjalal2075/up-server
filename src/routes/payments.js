import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { mobile, text, toAscii } from '../utils/validate.js';
import { VErr, money } from '../utils/cert.js';
import { addDays, allBilling, getConfig, moderatorBilling, moderatorEarnings, round2, saveConfig, todayStr } from '../services/billing.js';

const router = Router();
router.use(authenticate);
const STAFF = ['accounting']; // হিসাব দেখা/অনুমোদন/সেটিংস: শুধু Accounting
const METHODS = ['bkash', 'nagad'];
const PAGE_SIZE = 20;

function validDate(v) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

// ---------- সেটিংস: প্রতি ডাটার চার্জ + বিকাশ/নগদ নম্বর ----------
router.get('/config', requireRoles('moderator', ...STAFF), async (req, res, next) => {
  try {
    const cfg = await getConfig();
    // মডারেটর শুধু সক্রিয় নম্বর দেখে
    res.json({
      entryFee: cfg.entryFee, rewardPerEntry: cfg.rewardPerEntry, withdrawEnabled: cfg.withdrawEnabled,
      accounts: req.user.role === 'moderator' ? cfg.accounts.filter((a) => a.active) : cfg.accounts,
    });
  } catch (err) { next(err); }
});

router.put('/config', requireRoles(...STAFF), async (req, res, next) => {
  try {
    const entryFee = money(req.body?.entryFee, 'প্রতি ডাটার চার্জ');
    if (entryFee <= 0) throw new VErr('প্রতি ডাটার চার্জ ০-এর বেশি হতে হবে।');
    const rewardPerEntry = money(req.body?.rewardPerEntry, 'প্রতি ডাটায় মডারেটরের আয়');
    const withdrawEnabled = req.body?.withdrawEnabled === true;
    if (!Array.isArray(req.body?.accounts) || req.body.accounts.length > 10) throw new VErr('নম্বরের তালিকা ভুল বা অনেক বড়।');
    const seen = new Set();
    const accounts = req.body.accounts.map((a) => {
      const method = text(a?.method);
      if (!METHODS.includes(method)) throw new VErr('মাধ্যম বিকাশ বা নগদ হতে হবে।');
      const number = mobile(a?.number);
      if (!number) throw new VErr('বিকাশ/নগদ নম্বর সঠিক নয় (যেমন: 01712345678)।');
      if (seen.has(`${method}:${number}`)) throw new VErr('একই নম্বর দুইবার দেওয়া হয়েছে।');
      seen.add(`${method}:${number}`);
      const label = text(a?.label);
      if (label.length > 40) throw new VErr('লেবেল সর্বোচ্চ ৪০ অক্ষরের হতে পারে।');
      const id = /^[a-f0-9]{8}$/.test(a?.id || '') ? a.id : crypto.randomBytes(4).toString('hex');
      return { id, method, number, label, active: a?.active !== false };
    });
    await saveConfig({ entryFee, rewardPerEntry, withdrawEnabled, accounts });
    res.json({ entryFee, rewardPerEntry, withdrawEnabled, accounts });
  } catch (err) {
    if (err instanceof VErr) return res.status(400).json({ message: err.message });
    next(err);
  }
});

// ---------- মডারেটর: নিজের হিসাব ও পেমেন্ট জমা ----------
const payShape = (r) => ({
  id: r.id, method: r.method, toNumber: r.to_number, senderNumber: r.sender_number, trxId: r.trx_id,
  amount: r.amount, dueAtSubmit: r.due_at_submit, status: r.status, note: r.note || '', createdAt: r.created_at, reviewedAt: r.reviewed_at,
  ...(r.moderator_name !== undefined ? { moderatorId: r.moderator_id, moderatorName: r.moderator_name, moderatorUsername: r.moderator_username, reviewerName: r.reviewer_name || '' } : {}),
});
const PAY_COLS = `p.id, p.moderator_id, p.method, p.to_number, p.sender_number, p.trx_id, p.amount::float8 AS amount,
  p.due_at_submit::float8 AS due_at_submit, p.status, p.note, p.created_at, p.reviewed_at`;

router.get('/my', requireRoles('moderator'), async (req, res, next) => {
  try {
    const [b, cfg] = await Promise.all([moderatorBilling(req.user.id), getConfig()]);
    const today = todayStr();
    const out = {
      fee: cfg.entryFee, today, totalCount: b.totalCount, totalCharge: b.totalCharge, approved: b.approved, pending: b.pending,
      totalDue: b.totalDue, previousDue: b.previousDue, available: b.available, blocked: b.blocked, lastWork: b.lastWork,
      todayRow: b.days.find((d) => d.day === today) || { day: today, count: 0, charge: 0, paid: 0, due: 0 },
    };
    if (req.query.date) {
      const date = validDate(req.query.date);
      if (!date) return res.status(400).json({ message: 'তারিখ সঠিক নয়।' });
      out.day = b.days.find((d) => d.day === date) || { day: date, count: 0, charge: 0, paid: 0, due: 0 };
    }
    const pays = await pool.query(
      `SELECT ${PAY_COLS} FROM moderator_payments p WHERE p.moderator_id = $1 ORDER BY p.id DESC LIMIT 20`, [req.user.id]
    );
    out.payments = pays.rows.map(payShape);
    res.json(out);
  } catch (err) { next(err); }
});

router.post('/', requireRoles('moderator'), async (req, res, next) => {
  try {
    const cfg = await getConfig();
    const method = text(req.body?.method);
    if (!METHODS.includes(method)) throw new VErr('বিকাশ বা নগদ নির্বাচন করুন।');
    const account = cfg.accounts.find((a) => a.id === req.body?.accountId && a.method === method && a.active);
    if (!account) throw new VErr('যে নম্বরে টাকা পাঠিয়েছেন সেটি নির্বাচন করুন।');
    const sender = mobile(req.body?.senderNumber);
    if (!sender) throw new VErr('যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি সঠিক নয় (যেমন: 01712345678)।');
    const trx = toAscii(req.body?.trxId).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{6,30}$/.test(trx)) throw new VErr('ট্রানজেকশন আইডি সঠিক নয় (শুধু ইংরেজি অক্ষর ও সংখ্যা)।');
    const amount = money(req.body?.amount, 'টাকার পরিমাণ');
    if (amount <= 0) throw new VErr('টাকার পরিমাণ ০-এর বেশি দিন।');

    const b = await moderatorBilling(req.user.id);
    if (b.totalDue <= 0) throw new VErr('আপনার কোনো বকেয়া নেই।');
    if (amount > b.available + 0.001) {
      throw new VErr(b.available > 0
        ? `সর্বোচ্চ ৳${b.available} জমা দেওয়া যাবে (বাকি টাকা অনুমোদনের অপেক্ষায় আছে)।`
        : 'আপনার সব বকেয়ার পেমেন্ট ইতিমধ্যে অনুমোদনের অপেক্ষায় আছে।');
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO moderator_payments (moderator_id, method, to_number, sender_number, trx_id, amount, due_at_submit)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [req.user.id, method, account.number, sender, trx, amount, b.totalDue]
      );
      res.status(201).json({ id: rows[0].id });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ message: 'এই ট্রানজেকশন আইডি দিয়ে আগেই পেমেন্ট জমা দেওয়া হয়েছে।' });
      throw err;
    }
  } catch (err) {
    if (err instanceof VErr) return res.status(400).json({ message: err.message });
    next(err);
  }
});

// ---------- অ্যাকাউন্টিং: পেমেন্ট তালিকা ও অনুমোদন ----------
router.get('/', requireRoles(...STAFF), async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const q = toAscii(req.query.q || '').slice(0, 60);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const vals = [];
    let where = 'TRUE';
    if (status) { vals.push(status); where += ` AND p.status = $${vals.length}`; }
    if (q) {
      vals.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where += ` AND (p.trx_id ILIKE $${vals.length} OR p.sender_number ILIKE $${vals.length} OR u.full_name ILIKE $${vals.length} OR u.username ILIKE $${vals.length})`;
    }
    const join = 'FROM moderator_payments p JOIN users u ON u.id = p.moderator_id LEFT JOIN users r ON r.id = p.reviewed_by';
    const total = (await pool.query(`SELECT COUNT(*)::int AS n ${join} WHERE ${where}`, vals)).rows[0].n;
    const { rows } = await pool.query(
      `SELECT ${PAY_COLS}, COALESCE(u.full_name, u.username) AS moderator_name, u.username AS moderator_username,
              COALESCE(r.full_name, r.username) AS reviewer_name
       ${join} WHERE ${where} ORDER BY (p.status = 'pending') DESC, p.id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, vals
    );
    const counts = await pool.query('SELECT status, COUNT(*)::int AS n FROM moderator_payments GROUP BY status');
    const c = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]));
    res.json({
      items: rows.map(payShape), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      counts: { pending: c.pending || 0, approved: c.approved || 0, rejected: c.rejected || 0 },
    });
  } catch (err) { next(err); }
});

router.patch('/:id/review', requireRoles(...STAFF), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const action = req.body?.action;
    const note = text(req.body?.note).slice(0, 300);
    if (!Number.isInteger(id) || !['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'ভুল অনুরোধ।' });
    if (action === 'reject' && note.length < 3) return res.status(400).json({ message: 'বাতিলের কারণ লিখুন।' });
    const { rowCount } = await pool.query(
      `UPDATE moderator_payments SET status = $2, note = $3, reviewed_by = $4, reviewed_at = NOW()
       WHERE id = $1 AND status = 'pending'`, [id, action === 'approve' ? 'approved' : 'rejected', note || null, req.user.id]
    );
    if (!rowCount) return res.status(409).json({ message: 'এই পেমেন্ট ইতিমধ্যে অনুমোদন বা বাতিল করা হয়েছে।' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------- অ্যাকাউন্টিং: সব মডারেটরের হিসাব (ড্যাশবোর্ড + মডারেটর হিসাব পেজ) ----------
router.get('/accounts', requireRoles(...STAFF), async (_req, res, next) => {
  try {
    const today = todayStr();
    const y = addDays(today, -1); // "আজকের হিসাব" = গতকালের কাজের হিসাব
    const [mods, cfg, pend] = await Promise.all([
      allBilling(), getConfig(),
      pool.query("SELECT COUNT(*)::int AS n FROM moderator_payments WHERE status = 'pending'"),
    ]);
    const sum = (arr, f) => round2(arr.reduce((s, m) => s + f(m), 0));
    const yRow = (m) => m.days.find((d) => d.day === y) || { count: 0, charge: 0, paid: 0, due: 0 };
    const moderators = mods.map((m) => ({
      id: m.id, name: m.name, username: m.username, isActive: m.isActive, totalCount: m.totalCount, totalCharge: m.totalCharge,
      approved: m.approved, pending: m.pending, totalDue: m.totalDue, previousDue: m.previousDue, blocked: m.blocked, lastWork: m.lastWork,
      yesterday: yRow(m),
    }));
    res.json({
      fee: cfg.entryFee, today, yesterdayDate: y, pendingCount: pend.rows[0].n,
      overall: { count: sum(mods, (m) => m.totalCount), charge: sum(mods, (m) => m.totalCharge), paid: sum(mods, (m) => m.approved), due: sum(mods, (m) => m.totalDue) },
      yesterday: {
        count: sum(mods, (m) => yRow(m).count), charge: sum(mods, (m) => yRow(m).charge),
        paid: sum(mods, (m) => yRow(m).paid), due: sum(mods, (m) => yRow(m).due),
      },
      moderators,
    });
  } catch (err) { next(err); }
});

// ---------- মডারেটরের আয়, উত্তোলন (withdraw) ----------
const wdShape = (r) => ({
  id: r.id, amount: r.amount, method: r.method, number: r.number, status: r.status, trxId: r.trx_id || '', note: r.note || '',
  createdAt: r.created_at, reviewedAt: r.reviewed_at,
  ...(r.moderator_name !== undefined ? { moderatorId: r.moderator_id, moderatorName: r.moderator_name, moderatorUsername: r.moderator_username, reviewerName: r.reviewer_name || '' } : {}),
});
const WD_COLS = 'w.id, w.moderator_id, w.amount::float8 AS amount, w.method, w.number, w.status, w.trx_id, w.note, w.created_at, w.reviewed_at';

router.get('/earnings', requireRoles('moderator'), async (req, res, next) => {
  try {
    const [e, cfg, h] = await Promise.all([
      moderatorEarnings(req.user.id), getConfig(),
      pool.query(`SELECT ${WD_COLS} FROM moderator_withdrawals w WHERE w.moderator_id = $1 ORDER BY w.id DESC LIMIT 30`, [req.user.id]),
    ]);
    res.json({ reward: cfg.rewardPerEntry, enabled: cfg.withdrawEnabled, ...e, history: h.rows.map(wdShape) });
  } catch (err) { next(err); }
});

router.post('/withdrawals', requireRoles('moderator'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const cfg = await getConfig();
    if (!cfg.withdrawEnabled) throw new VErr('উত্তোলন এখন বন্ধ আছে। অ্যাকাউন্টিং চালু করলে টাকা তুলতে পারবেন।');
    const method = text(req.body?.method);
    if (!METHODS.includes(method)) throw new VErr('বিকাশ বা নগদ নির্বাচন করুন।');
    const number = mobile(req.body?.number);
    if (!number) throw new VErr('যে নম্বরে টাকা নেবেন সেটি সঠিক নয় (যেমন: 01712345678)।');
    const amount = money(req.body?.amount, 'টাকার পরিমাণ');
    if (amount <= 0) throw new VErr('টাকার পরিমাণ ০-এর বেশি দিন।');

    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]); // একই সময়ে দুই অনুরোধে বেশি তোলা আটকায়
    const e = await moderatorEarnings(req.user.id, client);
    if (amount > e.available + 0.001) {
      await client.query('ROLLBACK');
      throw new VErr(e.available > 0 ? `সর্বোচ্চ ৳${e.available} তোলা যাবে।` : 'আপনার তোলার মতো ব্যালেন্স নেই।');
    }
    const { rows } = await client.query(
      'INSERT INTO moderator_withdrawals (moderator_id, amount, method, number) VALUES ($1, $2, $3, $4) RETURNING id', [req.user.id, amount, method, number]
    );
    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof VErr) return res.status(400).json({ message: err.message });
    next(err);
  } finally {
    client.release();
  }
});

// অ্যাকাউন্টিং: উত্তোলন অনুরোধের তালিকা
router.get('/withdrawals', requireRoles(...STAFF), async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const q = toAscii(req.query.q || '').slice(0, 60);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const vals = [];
    let where = 'TRUE';
    if (status) { vals.push(status); where += ` AND w.status = $${vals.length}`; }
    if (q) {
      vals.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where += ` AND (u.full_name ILIKE $${vals.length} OR u.username ILIKE $${vals.length} OR w.number ILIKE $${vals.length} OR w.trx_id ILIKE $${vals.length})`;
    }
    const join = 'FROM moderator_withdrawals w JOIN users u ON u.id = w.moderator_id LEFT JOIN users r ON r.id = w.reviewed_by';
    const total = (await pool.query(`SELECT COUNT(*)::int AS n ${join} WHERE ${where}`, vals)).rows[0].n;
    const { rows } = await pool.query(
      `SELECT ${WD_COLS}, COALESCE(u.full_name, u.username) AS moderator_name, u.username AS moderator_username, COALESCE(r.full_name, r.username) AS reviewer_name
       ${join} WHERE ${where} ORDER BY (w.status = 'pending') DESC, w.id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, vals
    );
    const c = Object.fromEntries((await pool.query('SELECT status, COUNT(*)::int AS n FROM moderator_withdrawals GROUP BY status')).rows.map((r) => [r.status, r.n]));
    res.json({ items: rows.map(wdShape), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), counts: { pending: c.pending || 0, approved: c.approved || 0, rejected: c.rejected || 0 } });
  } catch (err) { next(err); }
});

// approve করতে ট্রানজেকশন আইডি লাগে (অ্যাকাউন্টিং টাকা পাঠানোর পর); reject-এ কারণ লাগে
router.patch('/withdrawals/:id/review', requireRoles(...STAFF), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const action = req.body?.action;
    if (!Number.isInteger(id) || !['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'ভুল অনুরোধ।' });
    let trx = null;
    let note = text(req.body?.note).slice(0, 300);
    if (action === 'approve') {
      trx = toAscii(req.body?.trxId).replace(/\s+/g, '').toUpperCase();
      if (!/^[A-Z0-9]{6,30}$/.test(trx)) return res.status(400).json({ message: 'ট্রানজেকশন আইডি সঠিক নয় (শুধু ইংরেজি অক্ষর ও সংখ্যা)।' });
    } else if (note.length < 3) {
      return res.status(400).json({ message: 'বাতিলের কারণ লিখুন।' });
    }
    try {
      const { rowCount } = await pool.query(
        `UPDATE moderator_withdrawals SET status = $2, trx_id = $3, note = $4, reviewed_by = $5, reviewed_at = NOW()
         WHERE id = $1 AND status = 'pending'`, [id, action === 'approve' ? 'approved' : 'rejected', trx, note || null, req.user.id]
      );
      if (!rowCount) return res.status(409).json({ message: 'এই অনুরোধ ইতিমধ্যে অনুমোদন বা বাতিল করা হয়েছে।' });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ message: 'এই ট্রানজেকশন আইডি আগেই ব্যবহার হয়েছে।' });
      throw err;
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
