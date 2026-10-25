import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { canAccess } from '../config/roles.js';

// Token verify kore + database theke user-er latest role/status ane.
// Tai account inactive/delete korle sathe sathe access bondho hoye jay.
export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'অনুগ্রহ করে লগইন করুন।' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT id, username, full_name, role, is_active FROM users WHERE id = $1 AND deleted_at IS NULL',
      [payload.id]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'এই অ্যাকাউন্টটি সক্রিয় নেই।' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'সেশন শেষ হয়েছে, আবার লগইন করুন।' });
  }
}

// Usage: router.delete('/x', authenticate, requireRoles('super_admin','admin'), handler)
export const requireRoles = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ message: 'এই কাজের অনুমতি আপনার নেই।' });

// Usage: router.get('/x', authenticate, requirePage('holdings'), handler)
export const requirePage = (page) => (req, res, next) =>
  canAccess(req.user.role, page)
    ? next()
    : res.status(403).json({ message: 'এই পেজে আপনার অ্যাক্সেস নেই।' });

// Login thakle req.user set kore, na thakle (ba token bhul hole) bina-error-e agay jay. (public form-e "ke toiri korlo" jante)
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await pool.query(
        'SELECT id, username, full_name, role, is_active FROM users WHERE id = $1 AND deleted_at IS NULL', [payload.id]
      );
      if (rows[0]?.is_active) req.user = rows[0];
    } catch { /* guest hisabe cholbe */ }
  }
  next();
}
