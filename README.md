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

## Agri certificate API (`/api/agri-certificates`)
`GET /?page=&q=` (২০ টি করে) · `GET /lookup?q=` (সনদ নং/NID/মোবাইল) · `GET /:id` · `POST /` · `DELETE /:id` (soft delete)
Public: `GET /api/public/verify/agriculture/:certNo` (QR যাচাই; শুধু নাম/পিতার নাম/তারিখ)
**Notun table-er jonno `npm run db:init` abar chalao.**

## Warish certificate API (`/api/warish-certificates`)
Agri-r moto-i (`GET /`, `/lookup`, `/:id`, `POST /`, `DELETE /:id`). Common logic: `src/routes/certRouter.js`.
Public: `GET /api/public/verify/warish/:certNo`. **`npm run db:init` abar chalao** (notun table).

## Citizen certificate API (`/api/citizen-certificates`)
Agri-r moto-i; shared config `src/routes/personCert.js`. Public: `GET /api/public/verify/citizen/:certNo`.
**`npm run db:init` abar chalao** (notun table `citizen_certificates`).

## Trade license API (`/api/trade-licenses`)
Same CRUD (`certRouter.js`); `cert_no` = license no (hate dile oi no, fanka hole auto). Public: `GET /api/public/verify/trade/:no`.
**`npm run db:init` abar chalao** (notun table `trade_licenses`).

## Public apply API (`/api/apply/<agri|citizen|warish|trade>`)
`POST /` (আবেদন জমা, login লাগে না; IP প্রতি ঘণ্টায় ৬০) · `GET /view/:key` (নিজের সনদ) · `GET /lookup?q=<সনদ নং>` (trade-e nei)
Admin API (`/api/<type>`) ager moto — list/search/delete shudhu Super Admin & Admin.
Duplicate: `dupChecks` (NID/BRN/mobile) — 409 dey. **`npm run db:init` abar chalao** (public_key + unique index).

## Holdings API (`/api/holdings`)
`GET /?page=&q=` · `GET /:id` (সবাই যারা holdings page পায়) · `POST /`, `PUT /:id` (Super Admin, Admin, Moderator) · `DELETE /:id` (Super Admin, Admin; soft delete)
Holding no unique (active row-er moddhe). **`npm run db:init` abar chalao** (holdings table-e notun column).

## Dashboard API
`GET /api/dashboard/stats` (Super Admin, Admin, Accounting) · `/my-activity[?date=]` (Moderator) · `/team?from=&to=&sort=count|name|recent&order=asc|desc` (Super Admin, Admin) · `/printer` (Printer)
Holdings: Moderator shudhu `created_by = nijer id` row dekhe. Print/download count: `POST /api/holdings/:id/events` → `holding_events` table.
Din-er hishab Asia/Dhaka time-e. **`npm run db:init` abar chalao** (holding_events table).

## Payments API (`/api/payments`)
`GET/PUT /config` (চার্জ + বিকাশ/নগদ নম্বর; PUT: Accounting/Admin/Super Admin) · `GET /my`, `POST /` (Moderator) · `GET /?status=&q=&page=`, `PATCH /:id/review` (শুধু Accounting) · `GET /accounts`
Billing logic: `src/services/billing.js` (FIFO). Holding POST (moderator): `entry_fee` set hoy, ager din-er bokeya thakle 403 `PAYMENT_DUE`.
**`npm run db:init` abar chalao** (`moderator_payments` table + `holdings.entry_fee`). Prothome **পেমেন্ট সেটিংস**-e charge ar bKash/Nagad number set koro.

## Tax, Expenses
`/api/tax`: `GET /summary`, `/search?q=`, `/history?from&to&q&sort=date|holding&order&page`, `POST /collect {holdingId, paidOn}` · `/api/expenses`: `GET /` (+summary, daily, weekly), `POST /`, `DELETE /:id`, `GET /moderators`
Public: `GET /api/public/holding/:key` (QR → holding sonod). Admin dashboard stats ekhon `tax_collections` theke (dhoryo = annual_tax × bochor).
**`npm run db:init` abar chalao** (tax_collections, moderator_expenses, holdings.public_key).
