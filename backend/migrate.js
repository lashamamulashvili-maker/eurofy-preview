import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {assertLocalDatabaseUrl,runMigrations} from './migration-runner.js';
import {openLocalPglite} from './local-database.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory=path.resolve(here,'../database/migrations');
if(process.argv.includes('--pglite')){
  const pool=await openLocalPglite();
  try{
    const existing=await pool.query("SELECT to_regclass('public.users') AS users_table");
    if(!existing.rows[0].users_table){
      const bootstrap=await readFile(path.resolve(here,'../database/schema.sql'),'utf8');
      await pool.db.exec(bootstrap);
    }
    const result=await runMigrations(pool,migrationDirectory);
    console.log(JSON.stringify({database:'local PGlite',...result}));
  }finally{await pool.end();}
}else if(process.argv.includes('--local')){
  const databaseUrl=assertLocalDatabaseUrl(process.env.DATABASE_URL||'');
  const pool=new pg.Pool({connectionString:databaseUrl.toString()});
  try{const result=await runMigrations(pool,migrationDirectory);console.log(JSON.stringify(result));}
  finally{await pool.end();}
}else{
  throw new Error('Refusing to run migrations without explicit --pglite or loopback-only --local mode');
}
