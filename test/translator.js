'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('big file', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/translator',
    locale: 'ja',
    dest: tempDir,
    statistics: true
  };
  t.plan(1);
  return new I18nPatch('./fixtures/translator', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'readme.md'), 'utf8').length,
      fs.readFileSync('./fixtures/translator/readme.md', 'utf8').length);
    });
});
