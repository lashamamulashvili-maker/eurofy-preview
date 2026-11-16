import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {runMigrations} from './migration-runner.js';

const backend=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(backend,'..');

test('local HTTP storefront serves verified catalog and authenticated persistent cart', {timeout:60000}, async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'eurofy-api-'));
  const dataDir=path.join(temp,'db');
  let child;
  try{
    const db=new PGlite({dataDir,extensions:{pgcrypto}});
    await db.waitReady;
    await db.exec(await readFile(path.join(root,'database/schema.sql'),'utf8'));
    await runMigrations(db,path.join(root,'database/migrations'));
    const category=(await db.query("INSERT INTO categories(name_ka,slug) VALUES('ტესტი','integration-test') RETURNING id")).rows[0];
    const product=(await db.query("INSERT INTO products(category_id,title_ka,description_ka,price_gel_minor,image_url,is_active,publication_status) VALUES($1,'API ტესტ პროდუქტი','მომწოდებლის მიერ დადასტურებული',12500,'https://images.example.invalid/api-test.jpg',true,'published') RETURNING id",[category.id])).rows[0];
    const supplier=(await db.query("INSERT INTO eurofy_suppliers(supplier_code,display_name,provider_type,enabled,resale_authorized,resale_evidence_ref,terms_verified_at,direct_ship_countries) VALUES('API-MOCK','API Mock Supplier','mock',true,true,'contract:test',now(),ARRAY['GE']) RETURNING id")).rows[0];
    const offer=(await db.query("INSERT INTO eurofy_supplier_products(supplier_id,product_id,supplier_sku,currency_code,supplier_price_minor,authorized_for_resale,authorization_evidence_ref,direct_shipping_enabled,direct_ship_countries,terms_verified_at) VALUES($1,$2,'API-SKU','EUR',3000,true,'rights:test',true,ARRAY['GE'],now()) RETURNING id",[supplier.id,product.id])).rows[0];
    const now=new Date().toISOString(),expires=new Date(Date.now()+3600000).toISOString();
    await db.query("INSERT INTO eurofy_inventory_snapshots(supplier_product_id,availability,quantity,source,checked_at,stale_after) VALUES($1,'in_stock',3,'mock',$2,$3)",[offer.id,now,expires]);
    await db.query("INSERT INTO eurofy_supplier_price_history(supplier_product_id,price_minor,currency_code,source,observed_at) VALUES($1,3000,'EUR','mock',$2)",[offer.id,now]);
    await db.query("INSERT INTO eurofy_product_image_licenses(product_id,image_url,license_status,evidence_reference,allowed_countries,verified_at) VALUES($1,'https://images.example.invalid/api-test.jpg','verified','license:test',ARRAY['GE'],now())",[product.id]);
    await db.query("INSERT INTO products(title_ka,price_gel_minor,is_active,publication_status) VALUES('არაუფლებამოსილი დემო',1000,true,'demo')");
    await db.close();

    const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    child=spawn(process.execPath,['server.js'],{cwd:backend,env:{...process.env,PORT:String(port),EUROFY_DATABASE_MODE:'pglite',EUROFY_LOCAL_DB_DIR:dataDir,EUROFY_SERVE_STORE:'1',EUROFY_LOCAL_ONLY:'1',ALLOWED_ORIGINS:''},stdio:['ignore','pipe','pipe']});
    let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
    const base=`http://127.0.0.1:${port}`;
    let health;
    for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('API exited early: '+logs);try{health=await fetch(base+'/api/health');if(health.ok)break}catch{}await new Promise(r=>setTimeout(r,250));}
    assert.equal(health?.status,200,'API did not become ready: '+logs);
    const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/EUROFY/);
    assert.equal((await fetch(base+'/backend/server.js')).status,404);
    const catalog=await fetch(base+'/api/products?q=API');assert.equal(catalog.status,200);const listed=(await catalog.json()).products;assert.equal(listed.length,1);assert.equal(listed[0].id,product.id);assert.equal(listed[0].price_gel_minor,12500);
    const preflight=await fetch(base+'/api/cart/items/'+product.id,{method:'OPTIONS',headers:{Origin:base,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(preflight.status,204);
    const reg=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'cart-test@example.invalid',password:'development-password-123',fullName:'Cart Integration',phone:'+995555000000',address:'Test Street 1',city:'Tbilisi'})});assert.equal(reg.status,201);
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'cart-test@example.invalid',password:'development-password-123'})});assert.equal(login.status,200);const {token}=await login.json();
    const auth={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const saved=await fetch(base+'/api/cart/items/'+product.id,{method:'PUT',headers:auth,body:JSON.stringify({quantity:2})});assert.equal(saved.status,200);
    const cart=await fetch(base+'/api/cart',{headers:{Authorization:'Bearer '+token}});assert.equal(cart.status,200);const items=(await cart.json()).items;assert.equal(items.length,1);assert.equal(items[0].quantity,2);assert.equal(items[0].available,true);
    const reject=await fetch(base+'/api/cart/items/'+product.id,{method:'PUT',headers:auth,body:JSON.stringify({quantity:4})});assert.equal(reject.status,409);
    const orderBody={items:[{productId:product.id,quantity:2}],deliveryName:'Cart Integration',deliveryPhone:'+995555000000',deliveryAddress:'Test Street 1, Tbilisi'};
    const orderRequest=()=>fetch(base+'/api/orders',{method:'POST',headers:{...auth,'Idempotency-Key':'integration-order-0001'},body:JSON.stringify(orderBody)});
    const orderResponse=await orderRequest();assert.equal(orderResponse.status,201);const result=await orderResponse.json();assert.equal(result.order.payment_status,'unpaid');assert.equal(result.order.total_gel_minor,25000);assert.equal(result.duplicate,false);
    const emptied=await fetch(base+'/api/cart',{headers:{Authorization:'Bearer '+token}});assert.equal((await emptied.json()).items.length,0);
    const replay=await orderRequest();assert.equal(replay.status,200);const replayResult=await replay.json();assert.equal(replayResult.order.id,result.order.id);assert.equal(replayResult.duplicate,true);
    const altered=await fetch(base+'/api/orders',{method:'POST',headers:{...auth,'Idempotency-Key':'integration-order-0001'},body:JSON.stringify({...orderBody,deliveryAddress:'Different address 2'})});assert.equal(altered.status,409);
  }finally{
    if(child){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,3000))]);}
    await rm(temp,{recursive:true,force:true});
  }
});
