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
