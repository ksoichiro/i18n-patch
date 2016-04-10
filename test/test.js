'use strict';

import test from 'ava';
import I18nPatch from '../lib';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test.afterEach(() => {
  temp.cleanupSync();
});

test('single pattern', t => {
  let tempDir = temp.mkdirSync('out');
  let locale = 'ja';
  let opts = {
    config: '../example',
    src: '../example/src',
    out: tempDir
  };
  return new I18nPatch(locale, opts)
  .generate()
  .catch((err) => {
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'js/sample.js'), 'utf8'),
      `preview.text("プレビューする内容がありません");
preview.text("読み込み中...");
console.log('other codes should be untouched.');
`);
    t.is(
      fs.readFileSync(path.join(tempDir, 'js/foo.js'), 'utf8'),
      `console.log('example');
`);
    t.pass();
  });
});

test('not translate if translation is undefined', t => {
  let tempDir = temp.mkdirSync('out');
  let locale = 'ja';
  let config = {
    "translations": [
      {
        "src": "**/*.js",
        "patterns": [
          {
            "pattern": "preview.text(\"Nothing to preview.\");",
            "replace": "preview.text(\"${nothingToPreview}\");"
          },
          {
            "pattern": "preview.text(\"Loading...\");",
            "replace": "preview.text(\"${loading}\");"
          }
        ]
      }
    ]
  };
  let localeConfig = {
    "loading": "読み込み中..."
  }
  let opts = {
    src: '../example/src',
    out: tempDir
  };
  return new I18nPatch(locale, opts)
  .generate(config, localeConfig)
  .catch((err) => {
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'js/sample.js'), 'utf8'),
      `preview.text("Nothing to preview.");
preview.text("読み込み中...");
console.log('other codes should be untouched.');
`);
    t.pass();
  });
});
