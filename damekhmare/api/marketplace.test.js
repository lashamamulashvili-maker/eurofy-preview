import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from './server.js';
async function serve(fn){const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await fn('http://127.0.0.1:'+server.address().port)}finally{await new Promise(resolve=>server.close(resolve))}}
test('provider endpoints deny unauthenticated writes',async()=>serve(async base=>{for(const url of ['/api/provider/profile','/api/provider/services','/api/offers']){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401,url)}}));
test('admin queue and moderation deny unauthenticated access',async()=>serve(async base=>{const queue=await fetch(base+'/api/admin/pending-providers');assert.equal(queue.status,401);const update=await fetch(base+'/api/admin/providers/00000000-0000-0000-0000-000000000000/verification',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'approved'})});assert.equal(update.status,401)}));
test('public providers endpoint does not claim a configured database',async()=>serve(async base=>{const r=await fetch(base+'/api/providers');assert.ok([200,503].includes(r.status));assert.ok(!r.headers.get('set-cookie'))}));
