# Up Server (Backend)

Node.js + Express + PostgreSQL (Neon). Hosting: **Render**.
Admin site er jonno alada project: `up-admin`.

## API ekhon
- `GET  /api/health`
- `GET  /api/public/branding`
- `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout`
- `GET  /api/dashboard/stats`

## Role access (`src/config/roles.js`)
| Role | Access |
|---|---|
| Super Admin / Admin | Sob page |
| Moderator / Printer | Dashboard + ডিজিটাল হোল্ডিং নম্বর |
| Accounting | Dashboard only |

Notun page-er access thik korte `PAGE_ACCESS`-e ekta line add koro, tarpor route-e `requirePage('page-key')` dao.
Frontend-er `up-admin/src/config/menu.js`-eo same rule rakhte hobe.

## 1. Neon
1. https://neon.tech -e project khulo, **Connect** theke connection string copy koro.

## 2. Local run
```bash
npm install
cp .env.example .env            # DATABASE_URL, JWT_SECRET boshao
npm run db:init                 # table toiri
npm run seed -- moni "YourStrongPass123" "Moni"   # prothom Super Admin
npm run dev                     # http://localhost:5000
```

## 3. Render deploy
1. Ei folder GitHub-e alada repo hisabe push koro.
2. Render → **New → Web Service** → repo select.
3. **Build Command:** `npm install` · **Start Command:** `npm start`
4. Environment Variables:
   - `DATABASE_URL` = Neon string
   - `JWT_SECRET` = lomba random string
   - `JWT_EXPIRES_IN` = `12h`
   - `CLIENT_URL` = Vercel-er admin site URL (ekadhik hole comma diye)
5. `https://<name>.onrender.com/api/health` e `{"ok":true}` ashle thik ache.

> Render free plan-e kichukkhon use na korle ghumiye jay; prothom request-e 30-50 sec lagte pare.
> Admin site Vercel-e deploy korar por oi URL `CLIENT_URL`-e boshiye redeploy korte hobe (CORS).

## Security
- Password bcrypt hash; `JWT_SECRET` GitHub-e dio na (`.env` ignored).
- Protti request-e DB theke role/status check hoy, inactive account sathe sathe lock.
- Login-e 15 minute-e max 10 bar try.

## Users API (`/api/users`) – Super Admin ও Admin
`GET /` · `POST /` · `PATCH /:id` · `PATCH /:id/status` · `DELETE /:id`

- Delete = **soft delete** (`deleted_at` set hoy). User row thake, tai pore onno table-e `created_by` ba history thakle seta nosto hoy na.
- Active/Inactive ar Delete shudhu `users` table-e kaj kore; holding/tax data-te hat pore na.
- Super Admin account keu delete/inactive korte pare na; nijeke-o na. Admin, Super Admin-ke chuite pare na.
- **Age-r database thakle** ekbar `npm run db:init` chalao (soft delete column add kore).

## Villages & Mosques API
`/api/villages` ar `/api/mosques` — `GET /` · `POST /` · `PUT /:id` · `DELETE /:id` (shudhu Super Admin ও Admin).
Generic logic `src/routes/crud.js`-e. Ward songkha `src/config/constants.js`-e (ekhon 9).
**Notun table-er jonno `npm run db:init` abar chalao.**

## Public API (login lage na)
`GET /api/public/overview` — homepage-er jonno গ্রাম ও মসজিদ-er list + total. Mobile number, budget, notes ekhane **pathano hoy na**.

## Site content API
- `GET /api/public/site` — homepage content (public)
- `GET/PUT /api/settings/site` — admin (ইউপি সেটিংস). Link shudhu `https://…` ba `/path` hote parbe; shob field-er length check kora.
Notun icon: `src/config/siteDefaults.js`-er `ICON_KEYS`-e add koro.

## ছবি আপলোড (ImgBB)
`POST /api/settings/upload-image` — admin ইউপি সেটিংস-e chairman-er chobi upload-er jonno.
1. https://imgbb.com -e account khulo → https://api.imgbb.com/ theke **Get API key**.
2. Local `.env` ar Render Environment Variables-e `IMGBB_API_KEY` boshao.
Key na thakle upload button error dey; tokhon chobir link bosiye kaj chalano jay.
