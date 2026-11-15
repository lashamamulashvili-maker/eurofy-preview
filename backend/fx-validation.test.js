import test from 'node:test';
import assert from 'node:assert/strict';
import {validRateDate} from './fx-validation.js';

test('accepts real ISO calendar dates',()=>{
 for(const date of ['2026-11-15','2024-02-29','2026-01-01'])assert.equal(validRateDate(date),true);
});
test('rejects malformed, impossible, and non-string dates',()=>{
 for(const date of ['2026-02-29','2026-13-01','2026-00-10','2026-11-31','2026-1-01','2026-11-15T00:00:00Z','\\d{4}-\\d{2}-\\d{2}',null,undefined,42])assert.equal(validRateDate(date),false,String(date));
});
