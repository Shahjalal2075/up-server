import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import userRoutes from './routes/users.js';
import villageRoutes from './routes/villages.js';
import mosqueRoutes from './routes/mosques.js';
import publicRoutes from './routes/public.js';
import siteRoutes from './routes/site.js';

for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing env variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1); // Render proxy-r pichone, rate-limit-er jonno dorkar

const allowed = (process.env.CLIENT_URL || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) =>
      !origin || allowed.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS')),
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Login page-er branding-er jonno (login er age lagbe, tai public)
app.get('/api/public/branding', async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'union_name'");
    res.json({ unionName: rows[0]?.value || null });
  } catch {
    res.json({ unionName: null });
  }
});

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', siteRoutes);
app.use('/api/villages', villageRoutes);
app.use('/api/mosques', mosqueRoutes);

app.use((_req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'সার্ভারে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।' });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API running on :${port}`));
