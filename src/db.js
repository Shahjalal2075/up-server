import 'dotenv/config';
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires SSL
  max: 5,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('PG pool error:', err.message));
