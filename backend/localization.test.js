import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('storefront offers Georgian, English and Ukrainian; legacy Russian preference migrates without clearing other browser data',async()=>{
  const html=await readFile(path.join(root,'index.html'),'utf8');
  const selector=html.match(/<select id="languageSelect"[^>]*>(.*?)<\/select>/)?.[1]||'';
  assert.deepEqual([...selector.matchAll(/<option value="([a-z]{2})">/g)].map(x=>x[1]),['ka','en','uk']);
  assert.match(html,/<option value="ka">ქართული<\/option>/);
  assert.match(html,/<option value="en">English<\/option>/);
  assert.match(html,/<option value="uk">Українська<\/option>/);
  assert.doesNotMatch(html,/<option value="ru">/);
  assert.match(html,/saved==='ru'\?'uk':saved/);
  assert.match(html,/localStorage\.setItem\('eurofy_language','uk'\)/);
  assert.doesNotMatch(html,/localStorage\.clear\(/);
  assert.match(html,/document\.documentElement\.lang=currentLanguage/);
});

test('Ukrainian storefront has translated core checkout, account, order and status labels',async()=>{
  const html=await readFile(path.join(root,'index.html'),'utf8');
  for(const phrase of ['Шукайте товар, категорію або бренд...','Додати до кошика','Створити обліковий запис','Номер замовлення','Вартість доставки включена у ціну.','Перевірка маршруту','Підтверджено','Сплачено','Вибір мови','Загальні умови продажу (AGB)'])assert.ok(html.includes(phrase),`missing Ukrainian text: ${phrase}`);
});

test('active translation resources contain no Russian locale fields and provide Ukrainian values',async()=>{
  const html=await readFile(path.join(root,'index.html'),'utf8');
  const dictionary=html.slice(html.indexOf('const localeDictionary='),html.indexOf('const ukrainianStrings='));
  assert.doesNotMatch(dictionary,/"ru"\s*:|\bru\s*:/);
  const ukrainianFields=[...dictionary.matchAll(/"uk"\s*:\s*"(?:\\.|[^"\\])*"/g)];
  assert.ok(ukrainianFields.length>=134,`only ${ukrainianFields.length} Ukrainian dictionary values`);
  assert.doesNotMatch(dictionary,/"uk"\s*:\s*"[^"]*(?:Ё|Ы|Ъ)[^"]*"/);
  const legal=html.slice(html.indexOf('const eurofyLegalContent='),html.indexOf(';\nfunction eurofyLegalPage'));
  assert.doesNotMatch(legal,/"ru"\s*:/);
  assert.match(legal,/"uk"\s*:/);
});

test('storefront category navigation contains all stable categories with ka/en/uk labels and paged UI',async()=>{
  const html=await readFile(path.join(root,'index.html'),'utf8');
  const section=html.slice(html.indexOf('const categoryLabels='),html.indexOf(';const categories='));
  const ids=['fashion','home-garden','health-beauty','toys-hobbies','mother-kids','eco-friendly','furniture','pet-supplies','food-drink','gifts-gadgets','sports-entertainment','mobile-accessories','electronics','computer-office','automotive-motorcycles'];
  assert.deepEqual([...section.matchAll(/slug:"([a-z-]+)"/g)].map(x=>x[1]),ids);
  assert.equal((section.match(/ka:/g)||[]).length,15);assert.equal((section.match(/en:/g)||[]).length,15);assert.equal((section.match(/uk:/g)||[]).length,15);
  for(const marker of ['categoryBreadcrumb','subcategoryNav','catalogPagination','changeCatalogPage','price_asc'])assert.ok(html.includes(marker),`missing category UI control ${marker}`);
});

test('pre-launch information pages provide all required routes and three language content without invented company data',async()=>{
  const html=await readFile(path.join(root,'info.html'),'utf8');
  for(const id of ['about','contact','faq','shipping','returns','payment','cookies','privacy','terms','imprint','suppliers'])assert.ok(html.includes(id),`missing information page ${id}`);
  assert.match(html,/<option value="ka">ქართული/);assert.match(html,/<option value="en">English/);assert.match(html,/<option value="uk">Українська/);assert.doesNotMatch(html,/<option value="ru">/);
  assert.match(html,/not yet a registered business/);assert.match(html,/legal review required/);assert.match(html,/local development database/);assert.match(html,/It was not emailed/);
});

test('admin and product-preparation static UI text is translated in ka, en and uk with no Russian selector',async()=>{
  const [admin,prep,locales]=await Promise.all(['admin.html','product-prep.html','assets/eurofy-admin-locales.js'].map(file=>readFile(path.join(root,file),'utf8')));
  assert.match(admin,/assets\/eurofy-admin-locales\.js/);assert.match(prep,/assets\/eurofy-admin-locales\.js/);
  assert.match(locales,/option value="ka">ქართული/);assert.match(locales,/option value="en">English/);assert.match(locales,/option value="uk">Українська/);assert.doesNotMatch(locales,/option value="ru"/);
  const keys=new Set();for(const m of locales.matchAll(/\[`([^`]*)`,`([^`]*)`,`([^`]*)`\]|\['((?:\\.|[^'])*)','((?:\\.|[^']*)*)','((?:\\.|[^']*)*)'\]/g)){keys.add(m[1]??m[4]);}
  for(const [file,html] of [['admin.html',admin],['product-prep.html',prep]]){
    const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
    const texts=[...visible.matchAll(/>([^<>]+)</g)].map(x=>x[1].replace(/&amp;/g,'&').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/\s+/g,' ').trim()).filter(Boolean);
    for(const text of texts.filter(x=>/[\u10A0-\u10FF]/.test(x)))assert.ok(keys.has(text),`${file} untranslated static text: ${text}`);
  }
  assert.match(locales,/value==='ru'.*value='uk'/);assert.match(locales,/document\.documentElement\.lang=locale/);
});
