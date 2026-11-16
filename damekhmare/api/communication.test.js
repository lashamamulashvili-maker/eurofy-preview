import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from './server.js';
async function serve(fn){const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port)}finally{await new Promise(r=>server.close(r))}}
test('private messages require authentication',async()=>serve(async base=>{const id='00000000-0000-0000-0000-000000000000';for(const [route,method] of [['/api/bookings/'+id+'/messages','GET'],['/api/bookings/'+id+'/messages','POST'],['/api/bookings/'+id+'/review','POST']]){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});assert.equal(r.status,401,route)}}));
test('public review endpoint rejects malformed provider ids',async()=>serve(async base=>{const r=await fetch(base+'/api/providers/not-a-uuid/reviews');assert.ok([400,503].includes(r.status))}));
