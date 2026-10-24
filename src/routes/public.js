import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { loadSite } from './site.js';

const router = Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }));

// Public homepage-er jonno. Shudhu safe tothyo; mobile number, bajet, mantabyo ekhane ashe na.
router.get('/overview', async (_req, res, next) => {
  try {
    const [v, m] = await Promise.all([
      pool.query(`SELECT id, name, ward_no, population, voters, literacy_rate::float8 AS literacy_rate
                  FROM villages ORDER BY ward_no, name`),
      pool.query(`SELECT id, name, ward_no, village_name, imam_name FROM mosques ORDER BY ward_no, name`),
    ]);
    const villages = v.rows.map((r) => ({
      id: r.id, name: r.name, wardNo: r.ward_no, population: r.population, voters: r.voters, literacyRate: r.literacy_rate,
    }));
    const mosques = m.rows.map((r) => ({
      id: r.id, name: r.name, wardNo: r.ward_no, villageName: r.village_name, imamName: r.imam_name,
    }));
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      villages,
      mosques,
      stats: {
        villages: villages.length,
        mosques: mosques.length,
        population: villages.reduce((s, x) => s + x.population, 0),
        voters: villages.reduce((s, x) => s + x.voters, 0),
      },
    });
  } catch (err) { next(err); }
});

// Homepage-er shob text (admin "ইউপি সেটিংস" theke edit kora)
router.get('/site', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=30');
    res.json(await loadSite());
  } catch (err) { next(err); }
});

export default router;
