import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const moduleDirectory=path.dirname(fileURLToPath(import.meta.url));

// Embedded PostgreSQL-compatible development store. A single serialized
// connection avoids interleaving transactions across PGlite requests.
export class LocalPglitePool{
  constructor(db){this.db=db;this.tail=Promise.resolve();}
  async acquire(){let release;const previous=this.tail;this.tail=new Promise(resolve=>{release=resolve;});await previous;return release;}
  async query(...args){const release=await this.acquire();try{return await this.db.query(...args);}finally{release();}}
  async connect(){const release=await this.acquire();let done=false;return {query:(...args)=>this.db.query(...args),exec:sql=>this.db.exec(sql),release:()=>{if(!done){done=true;release();}}};}
  async end(){await this.tail;await this.db.close();}
}

export async function openLocalPglite(directory=process.env.EUROFY_LOCAL_DB_DIR||path.resolve(moduleDirectory,'../.eurofy-data')){
  await mkdir(directory,{recursive:true});
  const [{PGlite},{pgcrypto}]=await Promise.all([import('@electric-sql/pglite'),import('@electric-sql/pglite/contrib/pgcrypto')]);
  const db=new PGlite({dataDir:directory,extensions:{pgcrypto}});
  await db.waitReady;
  return new LocalPglitePool(db);
}
