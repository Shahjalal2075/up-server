import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { loadSite } from './site.js';
import { HOLDING_COLS, holdingShape } from './holdings.js';

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

// সনদের QR scan করলে homepage এই API দিয়ে যাচাই করে। শুধু নাম/তারিখ — NID, মোবাইল যায় না।
router.get('/verify/agriculture/:no', async (req, res, next) => {
  try {
    const no = String(req.params.no || '');
    if (!/^\d{17}$/.test(no)) return res.status(404).json({ valid: false });
    const { rows } = await pool.query(
      'SELECT applicant_name, father_name, created_at FROM agri_certificates WHERE cert_no = $1 AND deleted_at IS NULL', [no]
    );
    if (!rows[0]) return res.status(404).json({ valid: false });
    res.json({ valid: true, certNo: no, name: rows[0].applicant_name, fatherName: rows[0].father_name, issuedAt: rows[0].created_at });
  } catch (err) { next(err); }
});

router.get('/verify/citizen/:no', async (req, res, next) => {
  try {
    const no = String(req.params.no || '');
    if (!/^\d{17}$/.test(no)) return res.status(404).json({ valid: false });
    const { rows } = await pool.query(
      'SELECT applicant_name, father_name, created_at FROM citizen_certificates WHERE cert_no = $1 AND deleted_at IS NULL', [no]
    );
    if (!rows[0]) return res.status(404).json({ valid: false });
    res.json({ valid: true, certNo: no, name: rows[0].applicant_name, fatherName: rows[0].father_name, issuedAt: rows[0].created_at });
  } catch (err) { next(err); }
});

router.get('/verify/trade/:no', async (req, res, next) => {
  try {
    const no = String(req.params.no || '');
    if (!/^[A-Za-z0-9/-]{1,17}$/.test(no)) return res.status(404).json({ valid: false });
    const { rows } = await pool.query(
      `SELECT business_name, owner_name, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date,
              (expiry_date IS NOT NULL AND expiry_date < (NOW() AT TIME ZONE 'Asia/Dhaka')::date) AS expired
       FROM trade_licenses WHERE cert_no = $1 AND deleted_at IS NULL`, [no]
    );
    if (!rows[0]) return res.status(404).json({ valid: false });
    res.json({ valid: true, certNo: no, businessName: rows[0].business_name, ownerName: rows[0].owner_name,
      expiryDate: rows[0].expiry_date || '', expired: rows[0].expired });
  } catch (err) { next(err); }
});

router.get('/verify/warish/:no', async (req, res, next) => {
  try {
    const no = String(req.params.no || '');
    if (!/^\d{17}$/.test(no)) return res.status(404).json({ valid: false });
    const { rows } = await pool.query(
      'SELECT deceased_name, applicant_name, created_at FROM warish_certificates WHERE cert_no = $1 AND deleted_at IS NULL', [no]
    );
    if (!rows[0]) return res.status(404).json({ valid: false });
    res.json({ valid: true, certNo: no, deceasedName: rows[0].deceased_name, applicantName: rows[0].applicant_name, issuedAt: rows[0].created_at });
  } catch (err) { next(err); }
});

// হোল্ডিং সনদ/প্লেটের QR: অনুমান-অযোগ্য key দিয়ে হোল্ডিংয়ের সনদ (সনদে যা ছাপা হয় তা-ই) দেখা
router.get('/holding/:key', async (req, res, next) => {
  try {
    const key = String(req.params.key || '');
    if (!/^[a-f0-9]{32}$/.test(key)) return res.status(404).json({ message: 'হোল্ডিং খুঁজে পাওয়া যায়নি।' });
    const { rows } = await pool.query(`SELECT ${HOLDING_COLS()} FROM holdings WHERE public_key = $1 AND deleted_at IS NULL`, [key]);
    if (!rows[0]) return res.status(404).json({ message: 'হোল্ডিং খুঁজে পাওয়া যায়নি।' });
    res.json({ item: holdingShape(rows[0]) });
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
