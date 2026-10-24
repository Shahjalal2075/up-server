import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authenticate, requirePage } from '../middleware/auth.js';
import { ROLES } from '../config/roles.js';

const router = Router();
router.use(authenticate, requirePage('users'));

// UI theke notun user-e ei role gulo deya jabe (Super Admin UI theke toiri hoy na).
const ASSIGNABLE = [ROLES.ADMIN, ROLES.MODERATOR, ROLES.ACCOUNTING, ROLES.PRINTER];
const COLS = 'id, username, full_name, role, is_active, created_at';
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
const text = (v) => String(v ?? '').trim();

// Permission rules (frontend ei flag gulo dekhe button dekhay; asol check ekhane):
//  - Super Admin account: sudhu nijer profile edit korte pare. Keu delete/inactive korte pare na.
//  - Nijeke delete/inactive kora jay na.
//  - Admin, Super Admin-er kono kichu chuite pare na.
function permissions(actor, target) {
  const self = actor.id === target.id;
  const isSuper = target.role === ROLES.SUPER_ADMIN;
  const manageable = !self && !isSuper;
  return { canEdit: isSuper ? self : true, canToggle: manageable, canDelete: manageable };
}

const shape = (actor, u) => ({
  id: u.id,
  username: u.username,
  fullName: u.full_name,
  role: u.role,
  isActive: u.is_active,
  createdAt: u.created_at,
  ...permissions(actor, u),
});

async function loadTarget(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: 'ভুল ইউজার আইডি।' });
    return null;
  }
  const { rows } = await pool.query(`SELECT ${COLS} FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!rows[0]) {
    res.status(404).json({ message: 'ইউজার খুঁজে পাওয়া যায়নি।' });
    return null;
  }
  return rows[0];
}

const forbid = (res) => res.status(403).json({ message: 'এই ইউজারের ওপর এই কাজের অনুমতি নেই।' });

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${COLS} FROM users WHERE deleted_at IS NULL ORDER BY id DESC`);
    res.json({ users: rows.map((u) => shape(req.user, u)) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const fullName = text(req.body?.fullName);
    const username = text(req.body?.username).toLowerCase();
    const password = String(req.body?.password ?? '');
    const role = text(req.body?.role);

    if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ message: 'পূর্ণ নাম ২–১০০ অক্ষরের মধ্যে দিন।' });
    if (!USERNAME_RE.test(username)) return res.status(400).json({ message: 'ইউজারনেম ৩–৩০ অক্ষরের হতে হবে (ইংরেজি ছোট হাতের অক্ষর, সংখ্যা, . বা _)।' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ message: 'পাসওয়ার্ড ৮–৭২ অক্ষরের হতে হবে।' });
    if (!ASSIGNABLE.includes(role)) return res.status(400).json({ message: 'সঠিক রোল নির্বাচন করুন।' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (username, full_name, password_hash, role, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [username, fullName, hash, role, req.user.id]
    );
    res.status(201).json({ user: shape(req.user, rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'এই ইউজারনেম আগে থেকেই আছে।' });
    next(err);
  }
});

// Edit: username kokhono change hoy na. Password dile bodle jabe, na dile ager-ta thakbe.
router.patch('/:id', async (req, res, next) => {
  try {
    const target = await loadTarget(req, res);
    if (!target) return;
    if (!permissions(req.user, target).canEdit) return forbid(res);

    const fullName = text(req.body?.fullName);
    const password = String(req.body?.password ?? '');
    const role = text(req.body?.role) || target.role;

    if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ message: 'পূর্ণ নাম ২–১০০ অক্ষরের মধ্যে দিন।' });
    if (password && (password.length < 8 || password.length > 72)) return res.status(400).json({ message: 'পাসওয়ার্ড ৮–৭২ অক্ষরের হতে হবে।' });

    // Role shudhu onno (Super Admin na) user-er bodlano jabe; nijer ba Super Admin-er na.
    let newRole = target.role;
    if (role !== target.role) {
      if (target.role === ROLES.SUPER_ADMIN || target.id === req.user.id || !ASSIGNABLE.includes(role)) return forbid(res);
      newRole = role;
    }

    const sets = ['full_name = $1', 'role = $2'];
    const vals = [fullName, newRole];
    if (password) {
      vals.push(await bcrypt.hash(password, 12));
      sets.push(`password_hash = $${vals.length}`);
    }
    vals.push(target.id);
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING ${COLS}`, vals
    );
    res.json({ user: shape(req.user, rows[0]) });
  } catch (err) { next(err); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    if (typeof req.body?.isActive !== 'boolean') return res.status(400).json({ message: 'ভুল অনুরোধ।' });
    const target = await loadTarget(req, res);
    if (!target) return;
    if (!permissions(req.user, target).canToggle) return forbid(res);

    // Shudhu users table-er is_active badle; onno kono table-e hat pore na.
    const { rows } = await pool.query(
      `UPDATE users SET is_active = $1 WHERE id = $2 RETURNING ${COLS}`, [req.body.isActive, target.id]
    );
    res.json({ user: shape(req.user, rows[0]) });
  } catch (err) { next(err); }
});

// Soft delete: row thake, kintu login/list theke sorey jay. Onno data (jeman created_by) ager moto thake.
router.delete('/:id', async (req, res, next) => {
  try {
    const target = await loadTarget(req, res);
    if (!target) return;
    if (!permissions(req.user, target).canDelete) return forbid(res);

    await pool.query('UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE id = $1', [target.id]);
    res.json({ message: 'ইউজার ডিলিট করা হয়েছে।' });
  } catch (err) { next(err); }
});

export default router;
