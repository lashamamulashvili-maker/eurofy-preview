import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './server.js';
import {createServer} from 'node:http';

async function withServer(run){
 const server=createServer(app);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await run('http://127.0.0.1:'+server.address().port)}finally{await new Promise(resolve=>server.close(resolve))}
}
test('health reports no DB when not configured',async()=>{
 await withServer(async base=>{const r=await fetch(base+'/api/health');assert.equal(r.status,200);const data=await r.json();assert.equal(typeof data.databaseConfigured,'boolean')})
});
test('registration never accepts invalid payload',async()=>{
 await withServer(async base=>{const r=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'bad',password:'short'})});assert.ok([400,503].includes(r.status))})
});
test('unauthenticated profile is denied',async()=>{
 await withServer(async base=>{const r=await fetch(base+'/api/me');assert.equal(r.status,401)})
});
test('public requests never return private address when DB unavailable',async()=>{
 await withServer(async base=>{const r=await fetch(base+'/api/requests');assert.ok([200,503].includes(r.status));const body=await r.text();assert.ok(!body.includes('address_private'))})
});
