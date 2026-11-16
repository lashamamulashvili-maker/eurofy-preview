import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from './server.js';
async function run(fn){const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await fn('http://127.0.0.1:'+server.address().port)}finally{await new Promise(resolve=>server.close(resolve))}}
test('booking listing requires authentication',async()=>run(async base=>{const r=await fetch(base+'/api/bookings');assert.equal(r.status,401)}));
test('offer acceptance requires authentication',async()=>run(async base=>{const r=await fetch(base+'/api/offers/00000000-0000-0000-0000-000000000000/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduledFor:'2030-01-01T12:00:00Z'})});assert.equal(r.status,401)}));
test('booking status changes require authentication',async()=>run(async base=>{const r=await fetch(base+'/api/bookings/00000000-0000-0000-0000-000000000000/status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'completed'})});assert.equal(r.status,401)}));
