import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_NAME=/^\d{8}_\d{3}_[a-z0-9_-]+\.sql$/;
const LOCK_ID=734921641;

async function execute(client,sql) {
  if (typeof client.exec==='function') return client.exec(sql);
  return client.query(sql);
}

export async function runMigrations(database,directory) {
  await database.query(`CREATE TABLE IF NOT EXISTS eurofy_schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files=(await readdir(directory)).filter(name=>MIGRATION_NAME.test(name)).sort();
  const result={applied:[],skipped:[]};
  for (const version of files) {
    const sql=await readFile(path.join(directory,version),'utf8');
    const checksum=createHash('sha256').update(sql).digest('hex');
    const client=typeof database.connect==='function'?await database.connect():database;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)',[LOCK_ID]);
      const prior=await client.query('SELECT checksum FROM eurofy_schema_migrations WHERE version=$1',[version]);
      if (prior.rows.length) {
        if (prior.rows[0].checksum!==checksum) throw new Error(`Applied migration was modified: ${version}`);
        await client.query('COMMIT');
        result.skipped.push(version);
        continue;
      }
      await execute(client,sql);
      await client.query('INSERT INTO eurofy_schema_migrations(version,checksum) VALUES($1,$2)',[version,checksum]);
      await client.query('COMMIT');
      result.applied.push(version);
    } catch (error) {
      await client.query('ROLLBACK').catch(()=>{});
      throw error;
    } finally {
      if (client!==database) client.release();
    }
  }
  return result;
}

export function assertLocalDatabaseUrl(value) {
  let url;
  try { url=new URL(value); } catch { throw new Error('Set a valid local DATABASE_URL before migrating'); }
  if (!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL');
  if (!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)) {
    throw new Error('Migrations are restricted to a loopback local PostgreSQL database');
  }
  if (!url.pathname || url.pathname==='/') throw new Error('DATABASE_URL must name a local database');
  return url;
}
