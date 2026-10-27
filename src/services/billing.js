import { pool } from '../db.js';

// মডারেটরের ডাটা এন্ট্রির চার্জ (প্রতিটি হোল্ডিং = entryFee টাকা) ও পেমেন্টের হিসাব।
// দিনের হিসাব Asia/Dhaka সময়ে। পেমেন্ট FIFO: পুরনো দিনের বকেয়া আগে মেটে।
const TZ = "AT TIME ZONE 'Asia/Dhaka'";
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
export const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------- config (settings table-e 'payment_config') ----------
export async function getConfig() {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'payment_config'");
  let saved = {};
  try { saved = JSON.parse(rows[0]?.value || '{}'); } catch { /* default */ }
  return {
    entryFee: Number.isFinite(saved.entryFee) ? saved.entryFee : 150,
    accounts: Array.isArray(saved.accounts) ? saved.accounts : [],
  };
}
export async function saveConfig(cfg) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('payment_config', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(cfg)]
  );
}

// ---------- হিসাব ----------
export function buildBilling(dayRows, approved, pending, today = todayStr()) {
  let rem = round2(approved);
  const days = dayRows.map((d) => {
    const charge = round2(d.charge);
    const paid = Math.min(rem, charge);
    rem = round2(rem - paid);
    return { day: d.day, count: d.count, charge, paid: round2(paid), due: round2(charge - paid) };
  });
  const sum = (arr, k) => round2(arr.reduce((s, d) => s + d[k], 0));
  const totalDue = sum(days, 'due');
  const previousDue = sum(days.filter((d) => d.day < today), 'due');
  return {
    days,
    totalCount: days.reduce((s, d) => s + d.count, 0),
    totalCharge: sum(days, 'charge'),
    approved: round2(approved),
    pending: round2(pending),
    totalDue,
    previousDue,                                   // আজকের আগের দিনগুলোর বকেয়া — এটা থাকলে নতুন এন্ট্রি বন্ধ
    available: round2(Math.max(0, totalDue - pending)), // এখনো পেমেন্ট জমা দেওয়া যাবে এত টাকা
    blocked: previousDue > 0,
    lastWork: [...days].reverse().find((d) => d.count > 0)?.day || null,
  };
}

const dayQuery = (where) => `
  SELECT created_by AS mid, to_char(created_at ${TZ}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count,
         COALESCE(SUM(entry_fee), 0)::float8 AS charge
  FROM holdings WHERE deleted_at IS NULL AND ${where} GROUP BY 1, 2 ORDER BY 2`;

export async function moderatorBilling(id) {
  const [d, p] = await Promise.all([
    pool.query(dayQuery('created_by = $1'), [id]),
    pool.query('SELECT status, COALESCE(SUM(amount), 0)::float8 AS s FROM moderator_payments WHERE moderator_id = $1 GROUP BY status', [id]),
  ]);
  const by = Object.fromEntries(p.rows.map((r) => [r.status, r.s]));
  return buildBilling(d.rows, by.approved || 0, by.pending || 0);
}

// সব সক্রিয় মডারেটরের হিসাব
export async function allBilling() {
  const mods = await pool.query(
    `SELECT id, full_name, username, is_active FROM users WHERE role = 'moderator' AND deleted_at IS NULL
     ORDER BY LOWER(COALESCE(full_name, username))`
  );
  const ids = mods.rows.map((m) => m.id);
  if (!ids.length) return [];
  const [d, p] = await Promise.all([
    pool.query(dayQuery('created_by = ANY($1::int[])'), [ids]),
    pool.query(
      'SELECT moderator_id AS mid, status, COALESCE(SUM(amount), 0)::float8 AS s FROM moderator_payments WHERE moderator_id = ANY($1::int[]) GROUP BY 1, 2', [ids]
    ),
  ]);
  return mods.rows.map((m) => {
    const days = d.rows.filter((r) => r.mid === m.id);
    const pay = Object.fromEntries(p.rows.filter((r) => r.mid === m.id).map((r) => [r.status, r.s]));
    return { id: m.id, name: m.full_name || m.username, username: m.username, isActive: m.is_active, ...buildBilling(days, pay.approved || 0, pay.pending || 0) };
  });
}
