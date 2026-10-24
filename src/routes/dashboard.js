import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, requirePage } from '../middleware/auth.js';

const router = Router();

router.get('/stats', authenticate, requirePage('dashboard'), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int                          AS total_holdings,
             COALESCE(SUM(annual_tax), 0)::float8   AS total_tax,
             COALESCE(SUM(paid_amount), 0)::float8  AS collected_tax
      FROM holdings`);
    const s = rows[0];
    res.json({
      totalHoldings: s.total_holdings,
      totalTax: s.total_tax,
      collectedTax: s.collected_tax,
      dueTax: Math.max(s.total_tax - s.collected_tax, 0),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
