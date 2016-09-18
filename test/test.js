'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';
import sinon from 'sinon';

test.before(() => {
  temp.track();
});

test('normal patterns', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: '../example',
    locale: 'ja',
    dest: tempDir,
    statistics: true
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
          },
          // "replace" without variables can be also replaced.
          {
            "pattern": /preview\."/,
            "replace": "preview!\""
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
      `preview.text("Nothing to preview!");
preview.text("読み込み中...");
console.log('other codes should be untouched.');
`);
    t.pass();
  });
});

test('exception is thrown when src is not given', t => {
  try {
    new I18nPatch(null, null);
    t.fail();
  } catch (err) {
    t.is(err.message, 'src is required');
    t.pass();
  }
});

test('empty option is set when option is not given', t => {
  try {
    let i18nPatch = new I18nPatch('../example/src', null);
    t.ok(i18nPatch.options);
    t.pass();
  } catch (err) {
    t.fail();
  }
});

test('exception is thrown when config not found', t => {
  let tempDir = temp.mkdirSync('foo');
  let opts = {
    config: path.join(tempDir, 'does_not_exist'),
    locale: 'ja',
    dest: tempDir
  };
  t.plan(1);
  return new I18nPatch('../example/src', opts)
  .generate()
  .catch((err) => {
    t.ok(err);
  });
});

test('exception is thrown when locale is not specified', t => {
  let tempDir = temp.mkdirSync('foo');
  let opts = {
    config: '../example',
    dest: tempDir
  };
  t.plan(1);
  return new I18nPatch('../example/src', opts)
  .generate()
  .catch((err) => {
    t.ok(err);
  });
});

test('copy src only when it has destination', t => {
  let tempDir = temp.mkdirSync('foo');
  let opts = {
    config: '../example',
    dest: tempDir
  };
  let i = new I18nPatch(tempDir, opts);
  t.is(i._hasDest(), false);
  i._copySrc();
  t.pass();
});

test('exception is thrown when an object is specified to src in translation', t => {
  let tempDir = temp.mkdirSync('foo');
  let config = {
    "translations": [
      {
        "src": {},
        "patterns": []
      }
    ]
  };
  let localeConfig = {};
  t.plan(1);
  return new I18nPatch('../example/src', { dest: tempDir })
  .generate(config, localeConfig)
  .catch((err) => {
    t.ok(err);
  });
});

test('_findPatterns return null when the named pattern is not found', t => {
  let i = new I18nPatch('../example/src');
  let result = i._findNamedPattern({namedPatterns: [{name: 'foo'}]}, {name: 'bar'});
  t.is(result, null);
});

test('_buildNamedPatternWithParams handles RegExp without flags when namedPattern does not have flags', t => {
  let i = new I18nPatch('../example/src');
  let result = i._buildNamedPatternWithParams(
    {pattern: '"foo"', exclude: '^#', replace: '"{foo}"', params: [], args: []},
    {foo: 'bar'});
  t.is(result.exclude.global, false);
  t.is(result.exclude.ignoreCase, false);
  t.is(result.exclude.multiline, false);
});

test('_resolveNamedPattern with namedPattern without params', t => {
  let i = new I18nPatch('../example/src');
  let result = i._resolveNamedPattern(
    {pattern: '"foo"', exclude: '^#', replace: '"{foo}"', args: []},
    {foo: 'bar'});
  t.is(JSON.stringify(result), JSON.stringify({pattern: '"foo"', exclude: '^#', replace: '"{foo}"', args: []}));
});

test('_resolveNamedPattern with namedPattern that one of the params is not given', t => {
  let i = new I18nPatch('../example/src');
  let result = i._resolveNamedPattern(
    {pattern: '"foo"', exclude: '^#', replace: '"{foo} {bar}"', params: ['foo', 'bar'], args: []},
    {foo: 'baz'});
  t.is(JSON.stringify(result), JSON.stringify({pattern: '"foo"', exclude: '^#', replace: '"baz {bar}"', args: []}));
});

test.cb('_processFilePerLine throws an error', t => {
  let tempDir = temp.mkdirSync('foo');
  let config = {
    "translations": [
      {
        "patterns": []
      }
    ]
  };
  let localeConfig = {};
  let i = new I18nPatch('../example/src', { dest: tempDir })
  sinon.stub(i, '_processFilePerLine', function(tr, file) {
    return new Promise((resolve, reject) => {
      reject('This is a stub');
    });
  });
  t.plan(1);
  i.generate(config, localeConfig)
  .catch((err) => {
    t.ok(err);
  }).then(() => {
    i._processFilePerLine.restore();
    t.end();
  });
});

test('append newline', t => {
  let tempDir = temp.mkdirSync('foo');
  let i = new I18nPatch('../example/src', { dest: tempDir })
  let value;

  value = 'foo';
  value = i._appendNewlineWithExpression(value, 'bar');
  t.is(value, 'foo\n');

  value = 'foo';
  value = i._appendNewlineWithExpression(value, 'bar\n');
  t.is(value, 'foo');

  value = 'foo';
  value = i._appendNewline(value);
  t.is(value, 'foo\n');
  // Newline won't be appended twice
  value = i._appendNewline(value);
  t.is(value, 'foo\n');
});
