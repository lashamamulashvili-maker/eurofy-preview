import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {runMigrations,assertLocalDatabaseUrl} from './migration-runner.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const migrationDirectory=path.join(root,'database/migrations');

test('hybrid migration preserves existing demo data and creates route-specific storage',async()=>{
  const db=new PGlite({extensions:{pgcrypto}});
  try {
    await db.exec(await readFile(path.join(root,'database/schema.sql'),'utf8'));
    const inserted=await db.query("INSERT INTO products(title_ka,price_gel_minor,is_active) VALUES('Demo item',1250,true) RETURNING id");
    const productId=inserted.rows[0].id;
    const first=await runMigrations(db,migrationDirectory);
    const second=await runMigrations(db,migrationDirectory);
    assert.deepEqual(first.applied,['20261116_001_hybrid_fulfillment.sql','20261116_002_order_request_idempotency.sql','20261116_003_order_operations.sql','20261116_004_category_supplier_architecture.sql']);
    assert.deepEqual(second.skipped,['20261116_001_hybrid_fulfillment.sql','20261116_002_order_request_idempotency.sql','20261116_003_order_operations.sql','20261116_004_category_supplier_architecture.sql']);

    const product=await db.query('SELECT is_active,publication_status FROM products WHERE id=$1',[productId]);
    assert.equal(product.rows[0].is_active,true);
    assert.equal(product.rows[0].publication_status,'demo');
    const tables=await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'eurofy_%'");
    const names=new Set(tables.rows.map(row=>row.table_name));
    for(const name of ['eurofy_suppliers','eurofy_supplier_products','eurofy_inventory_snapshots','eurofy_inventory_reservations','eurofy_supplier_price_history','eurofy_product_image_licenses','eurofy_customer_addresses','eurofy_shopping_carts','eurofy_shopping_cart_items','eurofy_fulfillment_quotes','eurofy_order_fulfillments','eurofy_fulfillment_shipments','eurofy_shipment_events','eurofy_fulfillment_audit_events','eurofy_order_request_keys','eurofy_mock_payment_evidence','eurofy_forwarding_packages','eurofy_schema_migrations']) assert.ok(names.has(name),`missing table ${name}`);
    const categories=await db.query('SELECT slug,name_en,name_uk FROM categories ORDER BY display_order');
    assert.equal(categories.rows.length,15);
    assert.equal(categories.rows[0].slug,'fashion');
    assert.ok(categories.rows.every(row=>row.name_en&&row.name_uk));
    assert.ok(names.has('eurofy_subcategories'));
    assert.ok(names.has('eurofy_supplier_category_mappings'));
  } finally { await db.close(); }
});

test('migration runner rejects modified applied migration checksums',async()=>{
  const db=new PGlite({extensions:{pgcrypto}}),temp=await mkdtemp(path.join(os.tmpdir(),'eurofy-migration-'));
  try {
    await db.exec(await readFile(path.join(root,'database/schema.sql'),'utf8'));
    await runMigrations(db,migrationDirectory);
    await writeFile(path.join(temp,'20261116_001_hybrid_fulfillment.sql'),'SELECT 1;\n');
    await assert.rejects(runMigrations(db,temp),/Applied migration was modified/);
    const applied=await db.query('SELECT count(*)::int AS count FROM eurofy_schema_migrations');
    assert.equal(applied.rows[0].count,4);
  } finally { await db.close(); await rm(temp,{recursive:true,force:true}); }
});

test('migration runner rolls back failed SQL and does not mark it applied',async()=>{
  const db=new PGlite(),temp=await mkdtemp(path.join(os.tmpdir(),'eurofy-migration-'));
  try {
    await writeFile(path.join(temp,'20261116_001_broken_fixture.sql'),'CREATE TABLE should_rollback(id integer);\nTHIS IS NOT SQL;');
    await assert.rejects(runMigrations(db,temp));
    const table=await db.query("SELECT to_regclass('public.should_rollback') AS name");
    const applied=await db.query('SELECT count(*)::int AS count FROM eurofy_schema_migrations');
    assert.equal(table.rows[0].name,null);
    assert.equal(applied.rows[0].count,0);
  } finally { await db.close(); await rm(temp,{recursive:true,force:true}); }
});

test('migration CLI only accepts a loopback PostgreSQL URL',()=>{
  assert.equal(assertLocalDatabaseUrl('postgresql://localhost/eurofy_local').hostname,'localhost');
  assert.throws(()=>assertLocalDatabaseUrl('postgresql://remote.example/eurofy'),/loopback local/);
  assert.throws(()=>assertLocalDatabaseUrl('file:///tmp/db'),/PostgreSQL/);
});
