'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('match-once', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/match-once',
    locale: 'ja',
    dest: tempDir
  };
  return new I18nPatch('./fixtures/match-once', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `console.log('bar 1');
console.log('foo 2');
`);
    t.is(
      fs.readFileSync(path.join(tempDir, 'test2.js'), 'utf8'),
      `console.log('foo 1');
console.log('foo 2');
`);
  });
});
