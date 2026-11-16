import test from 'node:test';
import assert from 'node:assert/strict';
import {localizeError,normalizeLocale} from './localized-errors.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('backend error locale is restricted to Georgian, English and Ukrainian',()=>{
  assert.equal(normalizeLocale('ka-GE, en;q=0.8'),'ka');
  assert.equal(normalizeLocale('en-US'),'en');
  assert.equal(normalizeLocale('uk-UA'),'uk');
  assert.equal(normalizeLocale('ru-RU'),'uk');
  assert.equal(normalizeLocale('de-DE'),'ka');
});

test('validation and permission errors are returned in the selected interface language',()=>{
  const source='Subcategory must belong to the selected category';
  assert.equal(localizeError(source,'en'),source);
  assert.equal(localizeError(source,'ka'),'ქვეკატეგორია არჩეულ კატეგორიას უნდა ეკუთვნოდეს');
  assert.equal(localizeError(source,'uk'),'Підкатегорія має належати вибраній категорії');
  assert.equal(localizeError('Invalid feed-specific data','ka'),'შეყვანილი მონაცემები შეამოწმეთ და ხელახლა სცადეთ.');
  assert.equal(localizeError('Unexpected internal detail','uk'),'Не вдалося виконати запит. Спробуйте ще раз.');
});

test('all fixed API error strings resolve to Georgian and Ukrainian messages or safe localized fallbacks',async()=>{
  const server=await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'server.js'),'utf8');
  const messages=new Set([...server.matchAll(/error:\s*'([^']+)'/g)].map(match=>match[1]));
  assert.ok(messages.size>=100,`only ${messages.size} fixed API error strings inspected`);
  for(const message of messages){assert.notEqual(localizeError(message,'ka'),message,`Georgian message missing for: ${message}`);assert.notEqual(localizeError(message,'uk'),message,`Ukrainian message missing for: ${message}`)}
});
