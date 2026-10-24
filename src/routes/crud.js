import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, requirePage } from '../middleware/auth.js';

// Simple list/create/update/delete router. Notun module (jemon holdings) holeo eta reuse kora jabe.
//  columns: [[dbColumn, valueKey], ...]  parse(body) -> { error } | { value }
export function crudRouter({ page, table, select, orderBy, columns, parse, shape, dupMessage }) {
  const router = Router();
  router.use(authenticate, requirePage(page));

  const idOf = (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ message: 'ভুল আইডি।' }); return null; }
    return id;
  };

  router.get('/', async (_req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT ${select} FROM ${table} ORDER BY ${orderBy}`);
      res.json({ items: rows.map(shape) });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const r = parse(req.body || {});
      if (r.error) return res.status(400).json({ message: r.error });
      const cols = columns.map(([c]) => c);
      const vals = columns.map(([, k]) => r.value[k]);
      vals.push(req.user.id);
      const marks = vals.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${cols.join(', ')}, created_by) VALUES (${marks}) RETURNING ${select}`, vals
      );
      res.status(201).json({ item: shape(rows[0]) });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ message: dupMessage });
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const id = idOf(req, res); if (id === null) return;
      const r = parse(req.body || {});
      if (r.error) return res.status(400).json({ message: r.error });
      const sets = columns.map(([c], i) => `${c} = $${i + 1}`);
      const vals = columns.map(([, k]) => r.value[k]);
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING ${select}`, vals
      );
      if (!rows[0]) return res.status(404).json({ message: 'তথ্য খুঁজে পাওয়া যায়নি।' });
      res.json({ item: shape(rows[0]) });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ message: dupMessage });
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const id = idOf(req, res); if (id === null) return;
      const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      if (!rowCount) return res.status(404).json({ message: 'তথ্য খুঁজে পাওয়া যায়নি।' });
      res.json({ message: 'ডিলিট করা হয়েছে।' });
    } catch (err) { next(err); }
  });

  return router;
}
