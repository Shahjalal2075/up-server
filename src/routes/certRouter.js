import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { authenticate, optionalAuth, requirePage } from '../middleware/auth.js';
import { loadSite } from './site.js';
import { toAscii } from '../utils/validate.js';
import { VErr, genCertNo, like } from '../utils/cert.js';

const PAGE_SIZE = 20;
const KEY_RE = /^[a-f0-9]{32}$/;

// সব সনদের (কৃষি, ওয়ারিশ, নাগরিক, ট্রেড) common routes।
//  admin: তালিকা/সার্চ/ডিলিট — শুধু Super Admin ও Admin
//  pub:   আবেদন জমা + নিজের সনদ দেখা — সবার জন্য (login লাগে না)
//    - সনদ দেখা হয় অনুমান-অযোগ্য public_key দিয়ে (sequential id দিয়ে নয়), তাই অন্যের সনদ গুনে গুনে দেখা যায় না
//  columns: [dbColumn, valueKey, 'opt' | 'json' | undefined]
//  dupChecks: [[dbColumn, valueKey, label]] — একই মান দিয়ে দ্বিতীয়বার আবেদন করা যাবে না
export function certRoutes({
  page, table, select, listSelect = select, genNo = genCertNo, columns, searchWhere, lookupWhere,
  parse, shape, label, dupChecks = [], publicLookup = true,
}) {
  const admin = Router();
  admin.use(authenticate, requirePage(page));
  const pub = Router();

  const idOf = (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ message: 'ভুল আইডি।' }); return null; }
    return id;
  };

  // ---------- admin ----------
  admin.get('/', async (req, res, next) => {
    try {
      const q = toAscii(req.query.q || '').slice(0, 100);
      const pg = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const vals = [];
      let where = 'deleted_at IS NULL';
      if (q) { vals.push(like(q)); where += ` AND (${searchWhere})`; }
      const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`, vals)).rows[0].n;
      const { rows } = await pool.query(
        `SELECT ${listSelect} FROM ${table} WHERE ${where} ORDER BY id DESC LIMIT ${PAGE_SIZE} OFFSET ${(pg - 1) * PAGE_SIZE}`, vals
      );
      res.json({ items: rows.map(shape), total, page: pg, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
    } catch (err) { next(err); }
  });

  // সনদ নং / NID / মোবাইল ... দিয়ে খোঁজা (শুধু admin)
  admin.get('/lookup', async (req, res, next) => {
    try {
      const q = toAscii(req.query.q || '').replace(/[\s-]/g, '').slice(0, 30);
      if (!q) return res.status(404).json({ message: 'পাওয়া যায়নি।' });
      const { rows } = await pool.query(
        `SELECT ${listSelect} FROM ${table} WHERE deleted_at IS NULL AND (${lookupWhere}) ORDER BY id DESC LIMIT 1`, [q]
      );
      if (!rows[0]) return res.status(404).json({ message: 'পাওয়া যায়নি।' });
      res.json({ item: shape(rows[0]) });
    } catch (err) { next(err); }
  });

  admin.delete('/:id', async (req, res, next) => {
    try {
      const id = idOf(req, res); if (id === null) return;
      const { rowCount } = await pool.query(`UPDATE ${table} SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id]);
      if (!rowCount) return res.status(404).json({ message: `${label} খুঁজে পাওয়া যায়নি।` });
      res.json({ message: 'ডিলিট করা হয়েছে।' });
    } catch (err) { next(err); }
  });

  // ---------- আবেদন জমা (admin ও public দুই জায়গা থেকেই) ----------
  async function create(req, res, next) {
    let v;
    try {
      const site = await loadSite();
      v = parse(req.body || {}, site.certificate);
    } catch (err) {
      if (err instanceof VErr) return res.status(400).json({ message: err.message });
      return next(err);
    }

    try {
      // এক NID / জন্ম নিবন্ধন / মোবাইল দিয়ে একই সনদে একবারই আবেদন
      for (const [col, key, lbl] of dupChecks) {
        if (!v[key]) continue;
        const r = await pool.query(`SELECT 1 FROM ${table} WHERE deleted_at IS NULL AND ${col} = $1 LIMIT 1`, [v[key]]);
        if (r.rowCount) {
          return res.status(409).json({ message: `এই ${lbl} দিয়ে ইতিমধ্যে আবেদন করা হয়েছে। একই ${lbl} দিয়ে একাধিকবার আবেদন করা যায় না।` });
        }
      }

      const cols = columns.map(([c]) => c);
      const vals = columns.map(([, k, t]) => (t === 'json' ? JSON.stringify(v[k]) : t === 'opt' ? v[k] || null : v[k]));
      vals.push(req.user?.id ?? null);
      const marks = vals.map((_, i) => `$${i + 2}`).join(', '); // $1 = cert_no
      const manual = v.certNo ? String(v.certNo) : ''; // হাতে দেওয়া নম্বর (ট্রেড লাইসেন্স)

      for (let i = 0; i < 6; i++) {
        try {
          const { rows } = await pool.query(
            `INSERT INTO ${table} (cert_no, ${cols.join(', ')}, created_by) VALUES ($1, ${marks}) RETURNING ${select}`,
            [manual || genNo(), ...vals]
          );
          return res.status(201).json({ item: shape(rows[0]) });
        } catch (err) {
          if (err.code !== '23505') throw err;
          if (!/cert_no|public_key/.test(err.constraint || '')) {
            // দুজন একই সময়ে একই NID/মোবাইল দিলে database-ই আটকায়
            return res.status(409).json({ message: 'এই তথ্য দিয়ে ইতিমধ্যে আবেদন করা হয়েছে।' });
          }
          if (manual) return res.status(409).json({ message: 'এই নম্বরটি আগে থেকেই আছে।' });
          // নিজে তৈরি নম্বর মিলে গেলে আবার চেষ্টা
        }
      }
      res.status(500).json({ message: 'সনদ নম্বর তৈরি করা যায়নি। আবার চেষ্টা করুন।' });
    } catch (err) { next(err); }
  }
  admin.post('/', create);

  // ---------- public ----------
  const readLimiter = rateLimit({
    windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
    message: { message: 'অনেকবার চেষ্টা হয়েছে। একটু পরে আবার চেষ্টা করুন।' },
  });
  const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
    message: { message: 'এই নেটওয়ার্ক থেকে অনেকগুলো আবেদন এসেছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।' },
  });

  pub.post('/', createLimiter, optionalAuth, create);

  // নিজের সনদ দেখা/প্রিন্ট: অনুমান-অযোগ্য key দিয়ে
  pub.get('/view/:key', readLimiter, async (req, res, next) => {
    try {
      const key = String(req.params.key || '');
      if (!KEY_RE.test(key)) return res.status(404).json({ message: `${label} খুঁজে পাওয়া যায়নি।` });
      const { rows } = await pool.query(`SELECT ${select} FROM ${table} WHERE public_key = $1 AND deleted_at IS NULL`, [key]);
      if (!rows[0]) return res.status(404).json({ message: `${label} খুঁজে পাওয়া যায়নি।` });
      res.json({ item: shape(rows[0]) });
    } catch (err) { next(err); }
  });

  // আগের সনদ খোঁজা: public-এ শুধু সনদ নম্বর দিয়ে (NID/মোবাইল দিয়ে নয়, যাতে অন্যের তথ্য দেখা না যায়)
  pub.get('/lookup', readLimiter, async (req, res, next) => {
    try {
      const q = toAscii(req.query.q || '').replace(/[\s-]/g, '');
      if (!publicLookup || !/^\d{14,17}$/.test(q)) return res.status(404).json({ message: 'পাওয়া যায়নি।' });
      const { rows } = await pool.query(`SELECT ${listSelect} FROM ${table} WHERE cert_no = $1 AND deleted_at IS NULL`, [q]);
      if (!rows[0]) return res.status(404).json({ message: 'পাওয়া যায়নি।' });
      res.json({ item: shape(rows[0]) });
    } catch (err) { next(err); }
  });

  return { admin, pub };
}
