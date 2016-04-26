'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('locale', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/locale',
    locale: 'ja',
    dest: tempDir
  };
  return new I18nPatch('./fixtures/locale', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `/*
  hoge
  bar
  piyo
*/
`);
  });
});
