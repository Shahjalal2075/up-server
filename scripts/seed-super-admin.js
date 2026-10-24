// Usage: npm run seed -- <username> <password> "<Full Name>"
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const [username, password, fullName = 'Super Admin'] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Usage: npm run seed -- <username> <password(min 8)> "<Full Name>"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const { rowCount } = await pool.query(
  `INSERT INTO users (username, full_name, password_hash, role)
   VALUES ($1, $2, $3, 'super_admin') ON CONFLICT (username) WHERE deleted_at IS NULL DO NOTHING`,
  [username.toLowerCase(), fullName, hash]
);
console.log(rowCount ? `✔ Super Admin "${username}" created` : `Username "${username}" already exists`);
await pool.end();
