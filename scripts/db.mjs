import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ref = process.env.CR_REF ?? 'edxsfekxnkhhugejfoqi';
const home = os.homedir().replace(/\\/g, '/');
const pass = fs.readFileSync(path.join(home, '.secrets/counterrx-db-password.txt'), 'utf8').trim();

const client = new pg.Client({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(pass)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});

const arg = process.argv[2];
await client.connect();
try {
  const isFile = arg.endsWith('.sql');
  const text = isFile ? fs.readFileSync(arg, 'utf8') : arg;
  const r = await client.query(text);
  console.log(JSON.stringify(r.rows ?? [], null, 0));
  console.log('ROWCOUNT', r.rowCount ?? 0);
} catch (e) {
  console.error('SQL ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}