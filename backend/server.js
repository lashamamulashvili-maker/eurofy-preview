import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({limit:'32kb'}));
app.use('/api',rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
const pool = process.env.DATABASE_URL ? new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='require'?{rejectUnauthorized:true}:undefined}) : null;
app.get('/api/health',(_req,res)=>res.json({ok:true,databaseConfigured:Boolean(pool)}));
app.get('/api/products',async(_req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 try{
  const {rows}=await pool.query('SELECT p.id,p.title_ka,p.description_ka,p.price_gel_minor,p.image_url,c.name_ka AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.is_active=true ORDER BY p.created_at DESC LIMIT 100');
  res.json({products:rows});
 }catch{res.status(500).json({error:'Unable to load products'});}
});
app.post('/api/register',async(req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 const {email,password,fullName}=req.body||{};
 if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128||typeof fullName!=='string'||fullName.length>120)return res.status(400).json({error:'Invalid registration fields'});
 try{
  const hash=await bcrypt.hash(password,12);
  const {rows}=await pool.query('INSERT INTO users(email,password_hash,full_name) VALUES($1,$2,$3) RETURNING id,email,full_name',[email.trim().toLowerCase(),hash,fullName.trim()]);
  res.status(201).json({user:rows[0]});
 }catch(e){res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'Email already registered':'Registration failed'});}
});
app.use('/api',(_req,res)=>res.status(404).json({error:'Not found'}));
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log('EUROFY API listening on '+port));
