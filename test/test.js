'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('normal patterns', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: '../example',
    locale: 'ja',
    dest: tempDir
  };
  return new I18nPatch('../example/src', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
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
    // Codes are inserted at the begining of the file
    t.is(
      fs.readFileSync(path.join(tempDir, 'js/bar1.js'), 'utf8'),
      `appended.code(1);
console.log('ok');
console.log('bar');
`);
    // Codes are inserted at the end of the file
    t.is(
      fs.readFileSync(path.join(tempDir, 'js/bar2.js'), 'utf8'),
      `console.log('bar');
appended.code(2);
console.log('ok');
`);
    // Codes are inserted at the beginning of the file, when matched to the pattern
    t.is(
      fs.readFileSync(path.join(tempDir, 'app/foo.rb'), 'utf8'),
      `# encoding: utf-8
class Foo
  def create
    redirect_to foo_path, notice: '正常に作成されました'
  end
end
`);
    // Variables in translation is replaced
    t.is(
      fs.readFileSync(path.join(tempDir, 'app/bar.rb'), 'utf8'),
      `# encoding: utf-8
class Bar
  def delete_message(bar)
    "本当に\\"#{bar}\\"を削除しますか？"
  end
end
`);
    // Files that are not included are also copied
    t.is(
      fs.readFileSync(path.join(tempDir, 'html/hello.html'), 'utf8'),
      `<html>
<body>
Hello world!
</body>
</html>
`);
    t.pass();
  });
});

test('not translate if translation is undefined', t => {
  let tempDir = temp.mkdirSync('out');
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
  return new I18nPatch('../example/src', { dest: tempDir })
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
