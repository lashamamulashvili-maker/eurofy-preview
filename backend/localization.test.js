import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('storefront offers Georgian, English and Ukrainian; legacy Russian preference migrates without clearing other browser data',async()=>{
  const html=await readFile(path.join(root,'index.html'),'utf8');
  assert.match(html,/<option value="ka">ქართული<\/option>/);
  assert.match(html,/<option value="en">English<\/option>/);
  assert.match(html,/<option value="uk">Українська<\/option>/);
  assert.doesNotMatch(html,/<option value="ru">/);
  assert.match(html,/saved==='ru'\?'uk':saved/);
  assert.match(html,/localStorage\.setItem\('eurofy_language','uk'\)/);
  assert.doesNotMatch(html,/localStorage\.clear\(/);
});

test('Ukrainian storefront has translated core checkout, account, order and status labels',async()=>{
  const html=await readFile(path.join(root,'index.html'),'utf8');
  for(const phrase of ['Шукайте товар, категорію або бренд...','Додати до кошика','Створити обліковий запис','Номер замовлення','Вартість доставки включена у ціну.','Перевірка маршруту','Підтверджено','Сплачено','Вибір мови'])assert.ok(html.includes(phrase),`missing Ukrainian text: ${phrase}`);
  assert.match(html,/document\.documentElement\.lang=currentLanguage/);
});
