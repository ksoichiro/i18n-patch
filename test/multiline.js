'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('multiline', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/multiline',
    locale: 'ja',
    dest: tempDir
  };
  return new I18nPatch('./fixtures/multiline', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `/*
  アプリケーション
  = link_to foobar
  %span.light の更新履歴
*/
`);
  });
});
