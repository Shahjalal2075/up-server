import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { authenticate, requirePage } from '../middleware/auth.js';
import { SITE_DEFAULTS, ICON_KEYS } from '../config/siteDefaults.js';
import { sanitizeSite, VErr } from '../utils/siteSchema.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// Object deep-merge; array hole puro replace hoy.
function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = isObj(base[k]) ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

// Default + admin-er save kora content. Public homepage ar admin settings duitai eta use kore.
export async function loadSite() {
  const { rows } = await pool.query("SELECT key, value FROM settings WHERE key IN ('site_content', 'union_name')");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let saved = {};
  try { saved = JSON.parse(m.site_content || '{}'); } catch { /* bhanga json hole default */ }
  const site = deepMerge(SITE_DEFAULTS, saved);
  // আগে save করা মেনুতে লিংক ফাঁকা থাকলে (পেজ তৈরির আগে) ডিফল্ট লিংক বসাই
  const defUrl = Object.fromEntries(SITE_DEFAULTS.serviceMenu.map((m) => [m.label, m.url]));
  site.serviceMenu = (site.serviceMenu || []).map((m) => (m.url ? m : { ...m, url: defUrl[m.label] || '' }));
  // আগে save করা পুরনো ওয়েবসাইট লেখা (digitalup / upsheba) থাকলে ফাঁকা ধরি, যাতে নিজের সাইটের ঠিকানা বসে
  const OLD = /digitalup\.online|upsheba\.com/i;
  if (OLD.test(site.certificate?.website || '')) site.certificate.website = '';
  if (OLD.test(site.certificate?.verifyUrl || '')) site.certificate.verifyUrl = '';
  if (OLD.test(site.plate?.website || '')) site.plate.website = '';
  if (m.union_name) site.unionName = m.union_name;
  if (site.contact?.email === 'bahirdiamansa.up@gmail.com') site.contact.email = '';
  // আগের নাম (বাহিরদিয়া মানসা) কোথাও থেকে গেলে নতুন নামে বদলে দিই
  return JSON.parse(JSON.stringify(site).replaceAll('৫নং বাহিরদিয়া মানসা ইউনিয়ন পরিষদ', '৩নং পিলজংগ ইউনিয়ন পরিষদ').replaceAll('বাহিরদিয়া-মানসা', 'পিলজংগ'));
}

const router = Router();
router.use(authenticate, requirePage('settings'));

router.get('/site', async (_req, res, next) => {
  try { res.json({ site: await loadSite(), iconKeys: ICON_KEYS }); } catch (err) { next(err); }
});

// ছবি আপলোড: browser-e chhoto kore (resize) base64 hisabe ashe, ekhan theke ImgBB-te jay.
// API key shudhu server-er env-e thake, frontend-e kokhono jay na.
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { message: 'অনেকগুলো ছবি আপলোড করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।' },
});

router.post('/upload-image', uploadLimiter, async (req, res) => {
  const key = process.env.IMGBB_API_KEY;
  if (!key) return res.status(503).json({ message: 'ছবি আপলোড চালু নেই (সার্ভারে IMGBB_API_KEY সেট করা হয়নি)। আপাতত ছবির লিংক বসাতে পারেন।' });

  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dataUrl || ''));
  if (!m) return res.status(400).json({ message: 'শুধু JPG, PNG বা WebP ছবি দেওয়া যাবে।' });
  if (m[2].length > 950_000) return res.status(413).json({ message: 'ছবির সাইজ অনেক বড়। ছোট ছবি দিন।' });

  try {
    const r = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      body: new URLSearchParams({ image: m[2] }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success || !j.data?.url) {
      console.error('ImgBB upload failed:', r.status, j?.error?.message || '');
      return res.status(502).json({ message: 'ছবি আপলোড করা যায়নি। একটু পরে আবার চেষ্টা করুন।' });
    }
    res.json({ url: j.data.url });
  } catch (err) {
    console.error('ImgBB error:', err.name);
    res.status(502).json({ message: 'ছবি আপলোড সার্ভারের সাথে সংযোগ হয়নি। আবার চেষ্টা করুন।' });
  }
});

router.put('/site', async (req, res, next) => {
  let value;
  try { value = sanitizeSite(req.body); } catch (err) {
    if (err instanceof VErr) return res.status(400).json({ message: err.message });
    return next(err);
  }
  const { unionName, ...content } = value;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const up = `INSERT INTO settings (key, value) VALUES ($1, $2)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    await client.query(up, ['union_name', unionName]);
    await client.query(up, ['site_content', JSON.stringify(content)]);
    await client.query('COMMIT');
    res.json({ site: await loadSite() });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

export default router;
