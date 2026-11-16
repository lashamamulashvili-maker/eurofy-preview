import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {runMigrations} from './migration-runner.js';
import {LocalPglitePool} from './local-database.js';
import {getPersistentCart,listStoreProducts,setPersistentCartItem} from './storefront-repository.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function fixture(){
  const db=new PGlite({extensions:{pgcrypto}});
  await db.exec(await readFile(path.join(root,'database/schema.sql'),'utf8'));
  await runMigrations(db,path.join(root,'database/migrations'));
  const user=(await db.query("INSERT INTO users(email,password_hash,full_name) VALUES('cart@example.invalid','hash','Cart Test') RETURNING id")).rows[0];
  const category=(await db.query("INSERT INTO categories(name_ka,slug) VALUES('ტესტი','test') RETURNING id")).rows[0];
  const product=(await db.query("INSERT INTO products(category_id,title_ka,description_ka,price_gel_minor,image_url,is_active,publication_status) VALUES($1,'უფლებამოსილი პროდუქტი','ტესტის აღწერა',12500,'https://images.example.invalid/test.jpg',true,'published') RETURNING id",[category.id])).rows[0];
  const supplier=(await db.query("INSERT INTO eurofy_suppliers(supplier_code,display_name,provider_type,enabled,resale_authorized,resale_evidence_ref,terms_verified_at,direct_ship_countries) VALUES('CART-MOCK','Cart Mock','mock',true,true,'contract:test',now(),ARRAY['GE']) RETURNING id")).rows[0];
  const offer=(await db.query("INSERT INTO eurofy_supplier_products(supplier_id,product_id,supplier_sku,currency_code,supplier_price_minor,authorized_for_resale,authorization_evidence_ref,direct_shipping_enabled,direct_ship_countries,terms_verified_at) VALUES($1,$2,'CART-SKU','EUR',3000,true,'rights:test',true,ARRAY['GE'],now()) RETURNING id",[supplier.id,product.id])).rows[0];
  const checked=new Date().toISOString();
  const stale=new Date(Date.now()+60*60*1000).toISOString();
  await db.query("INSERT INTO eurofy_inventory_snapshots(supplier_product_id,availability,quantity,source,checked_at,stale_after) VALUES($1,'in_stock',3,'mock',$2,$3)",[offer.id,checked,stale]);
  await db.query("INSERT INTO eurofy_supplier_price_history(supplier_product_id,price_minor,currency_code,source,observed_at) VALUES($1,3000,'EUR','mock',$2)",[offer.id,checked]);
  await db.query("INSERT INTO eurofy_product_image_licenses(product_id,image_url,license_status,evidence_reference,allowed_countries,verified_at) VALUES($1,'https://images.example.invalid/test.jpg','verified','license:test',ARRAY['GE'],now())",[product.id]);
  const unavailable=(await db.query("INSERT INTO products(title_ka,price_gel_minor,is_active,publication_status) VALUES('დემო ნივთი',1000,true,'demo') RETURNING id")).rows[0];
  return {db,pool:new LocalPglitePool(db),user,product,unavailable};
}

test('catalog only exposes currently authorized, stocked, licensed products and filters on the server',async()=>{
  const {db,pool,product,unavailable}=await fixture();
  try{
    const all=await listStoreProducts(pool);
    assert.deepEqual(all.map(p=>p.id),[product.id]);
    assert.equal((await listStoreProducts(pool,{search:'ტესტის აღწერა'})).length,1);
    assert.equal((await listStoreProducts(pool,{search:'no-match'})).length,0);
    assert.equal((await listStoreProducts(pool,{category:'not-a-category'})).length,0);
    assert.ok(!all.some(p=>p.id===unavailable.id));
  }finally{await db.close();}
});

test('persistent cart validates eligibility and stock, stores exact quantities, and supports removal',async()=>{
  const {db,pool,user,product,unavailable}=await fixture();
  try{
    const item=await setPersistentCartItem(pool,{userId:user.id,productId:product.id,quantity:2});
    assert.equal(item.quantity,2);
    const cart=await getPersistentCart(pool,user.id);
    assert.equal(cart.length,1);
    assert.equal(cart[0].available,true);
    await assert.rejects(setPersistentCartItem(pool,{userId:user.id,productId:product.id,quantity:4}),{code:'STOCK_UNAVAILABLE'});
    await assert.rejects(setPersistentCartItem(pool,{userId:user.id,productId:unavailable.id,quantity:1}),{code:'PRODUCT_UNAVAILABLE'});
    assert.deepEqual(await setPersistentCartItem(pool,{userId:user.id,productId:product.id,quantity:0}),{removed:true});
    assert.equal((await getPersistentCart(pool,user.id)).length,0);
  }finally{await db.close();}
});
