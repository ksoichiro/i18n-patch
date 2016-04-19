'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('named-pattern', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/named-pattern',
    locale: 'ja',
    dest: tempDir
  };
  return new I18nPatch('./fixtures/named-pattern', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `/*
  "アプリケーション"
  アプリケーション
  課題を編集
  title: 'ラベル'
  課題が作成されました
  プロジェクトが更新されました
  - if issues
*/
`);
  });
});
