import fs from 'node:fs';
import { pool } from '../src/db.js';

const sql = fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('✔ Database tables ready');
await pool.end();
