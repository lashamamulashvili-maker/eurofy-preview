import express from 'express';
import {mountMarketplace} from './marketplace.js';
import {mountBookings} from './bookings.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const app=express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({limit:'24kb'}));
app.use('/api',rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
const pool=process.env.DAMEKHMARE_DATABASE_URL?new pg.Pool({connectionString:process.env.DAMEKHMARE_DATABASE_URL}):null;
const fail=(res)=>res.status(503).json({error:'Local database is not configured'});
const validEmail=(x)=>typeof x==='string'&&x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
const hash=(token)=>createHash('sha256').update(token).digest('hex');
const sessions=new Map(); // local development only: process restart invalidates sessions
const publicUser=u=>({id:u.id,email:u.email,displayName:u.display_name,customer:u.role_customer,provider:u.role_provider,locale:u.locale});
async function auth(req,res,next){
 const token=/^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization')||'')?.[1];
 const session=token&&sessions.get(hash(token));
 if(!session||session.expires<Date.now())return res.status(401).json({error:'Authentication required'});
 try{const {rows}=await pool.query('SELECT id,email,display_name,role_customer,role_provider,locale,is_admin FROM dm_accounts WHERE id=$1',[session.userId]);if(!rows.length)return res.status(401).json({error:'Account not found'});req.account=rows[0];next()}catch{res.status(503).json({error:'Authentication unavailable'})}
}
app.get('/api/health',async(_req,res)=>{
 if(!pool)return res.json({ok:true,databaseConfigured:false});
 try{await pool.query('SELECT 1');res.json({ok:true,databaseConfigured:true,databaseConnected:true})}catch{res.status(503).json({ok:false,databaseConnected:false})}
});
app.get('/api/categories',async(_req,res)=>{
 if(!pool)return fail(res);
 try{const {rows}=await pool.query('SELECT id,slug,title_ka,title_en,title_ru FROM dm_categories WHERE enabled=true ORDER BY slug');res.json({categories:rows})}catch{res.status(503).json({error:'Categories unavailable'})}
});
app.post('/api/register',rateLimit({windowMs:3600000,limit:5}),async(req,res)=>{
 if(!pool)return fail(res);
 const {email,password,displayName,locale='ka'}=req.body||{};
 if(!validEmail(email)||typeof password!=='string'||password.length<12||password.length>128||typeof displayName!=='string'||displayName.trim().length<2||displayName.length>120||!['ka','en','ru'].includes(locale))return res.status(400).json({error:'Invalid registration fields'});
 try{const passwordHash=await bcrypt.hash(password,12);const {rows}=await pool.query('INSERT INTO dm_accounts(email,password_hash,display_name,locale) VALUES($1,$2,$3,$4) RETURNING id,email,display_name,role_customer,role_provider,locale',[email.trim().toLowerCase(),passwordHash,displayName.trim(),locale]);res.status(201).json({user:publicUser(rows[0])})}catch(e){res.status(e.code==='23505'?409:503).json({error:e.code==='23505'?'Email already registered':'Registration unavailable'})}
});
app.post('/api/login',rateLimit({windowMs:900000,limit:10}),async(req,res)=>{
 if(!pool)return fail(res);
 const {email,password}=req.body||{};
 if(!validEmail(email)||typeof password!=='string'||password.length>128)return res.status(400).json({error:'Invalid credentials'});
 try{const {rows}=await pool.query('SELECT * FROM dm_accounts WHERE email=$1',[email.trim().toLowerCase()]);if(!rows.length||!await bcrypt.compare(password,rows[0].password_hash))return res.status(401).json({error:'Invalid credentials'});const token=randomBytes(32).toString('hex');sessions.set(hash(token),{userId:rows[0].id,expires:Date.now()+86400000});res.set('Cache-Control','no-store').json({token,user:publicUser(rows[0]),expiresInSeconds:86400})}catch{res.status(503).json({error:'Login unavailable'})}
});
app.get('/api/me',auth,(req,res)=>res.set('Cache-Control','no-store').json({user:publicUser(req.account)}));
app.post('/api/logout',auth,(req,res)=>{const token=req.get('authorization').slice(7);sessions.delete(hash(token));res.status(204).end()});
app.get('/api/requests',async(req,res)=>{
 if(!pool)return fail(res);
 const city=typeof req.query.city==='string'?req.query.city.trim().slice(0,100):'';
 try{const {rows}=await pool.query("SELECT r.id,r.title,r.description,r.city,r.remote_allowed,r.created_at,c.slug AS category FROM dm_requests r JOIN dm_categories c ON c.id=r.category_id WHERE r.status='open' AND ($1='' OR lower(r.city)=lower($1)) ORDER BY r.created_at DESC LIMIT 50",[city]);res.json({requests:rows})}catch{res.status(503).json({error:'Requests unavailable'})}
});
app.post('/api/requests',auth,async(req,res)=>{
 const {categoryId,title,description,city,remoteAllowed=false}=req.body||{};
 if(typeof categoryId!=='string'||!/^[-a-f0-9]{36}$/i.test(categoryId)||typeof title!=='string'||title.trim().length<5||title.length>160||typeof description!=='string'||description.trim().length<10||description.length>4000||typeof city!=='string'||city.trim().length<2||city.length>100||typeof remoteAllowed!=='boolean')return res.status(400).json({error:'Invalid request'});
 try{const {rows}=await pool.query('INSERT INTO dm_requests(customer_id,category_id,title,description,city,remote_allowed) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,title,description,city,status,created_at',[req.account.id,categoryId,title.trim(),description.trim(),city.trim(),remoteAllowed]);res.status(201).json({request:rows[0]})}catch(e){res.status(e.code==='23503'?400:503).json({error:'Unable to create request'})}
});
mountMarketplace(app,{pool,auth});
mountBookings(app,{pool,auth});
const root=path.dirname(fileURLToPath(import.meta.url));
app.use('/preview',express.static(path.resolve(root,'..'),{index:false}));
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||8002);app.listen(port,'127.0.0.1',()=>console.log('DAMEKHMARE local API on http://127.0.0.1:'+port))}
