import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertLocalDatabaseUrl,runMigrations} from './migration-runner.js';

if (!process.argv.includes('--local')) {
  throw new Error('Refusing to run migrations without the explicit --local flag');
}
const databaseUrl=assertLocalDatabaseUrl(process.env.DATABASE_URL||'');
const pool=new pg.Pool({connectionString:databaseUrl.toString()});
const here=path.dirname(fileURLToPath(import.meta.url));
try {
  const result=await runMigrations(pool,path.resolve(here,'../database/migrations'));
  console.log(JSON.stringify(result));
} finally {
  await pool.end();
}
