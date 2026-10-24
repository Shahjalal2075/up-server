import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।' },
});

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  fullName: u.full_name,
  role: u.role,
  isActive: u.is_active,
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ message: 'ইউজারনেম ও পাসওয়ার্ড দিন।' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL', [username]);
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ message: 'ইউজারনেম অথবা পাসওয়ার্ড সঠিক নয়।' });
    if (!user.is_active) {
      return res.status(403).json({ message: 'আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা আছে। অ্যাডমিনের সাথে যোগাযোগ করুন।' });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '12h',
    });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

// JWT stateless, tai server-e kichu clear korte hoy na; client token muche felbe.
router.post('/logout', authenticate, (_req, res) => res.json({ message: 'লগআউট সম্পন্ন হয়েছে।' }));

export default router;
