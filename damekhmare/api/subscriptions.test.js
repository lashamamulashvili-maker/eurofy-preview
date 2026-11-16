import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from './server.js';
async function serve(fn){const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port)}finally{await new Promise(r=>server.close(r))}}
test('subscription status is private',async()=>serve(async base=>{const r=await fetch(base+'/api/subscription');assert.equal(r.status,401)}));
test('test subscription activation requires login',async()=>serve(async base=>{const r=await fetch(base+'/api/subscription/test-activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmTestOnly:true})});assert.equal(r.status,401)}));
