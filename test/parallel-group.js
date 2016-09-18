'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('parallel-group', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/parallel-group',
    locale: 'ja',
    dest: tempDir
  };
  return new I18nPatch('./fixtures/parallel-group/src', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'a/x.js'), 'utf8'),
      `// FOO
// bar
// baz
`);
    t.is(
      fs.readFileSync(path.join(tempDir, 'a/y.js'), 'utf8'),
      `// FOO
// bar
// baz
`);
    t.is(
      fs.readFileSync(path.join(tempDir, 'a/test-x.js'), 'utf8'),
      `// FOO
// bar
// BAZ
`);
    t.is(
      fs.readFileSync(path.join(tempDir, 'a/test-y.js'), 'utf8'),
      `// FOO
// bar
// BAZ
`);
    t.is(
      fs.readFileSync(path.join(tempDir, 'b/p.js'), 'utf8'),
      `// foo
// BAR
// baz
`);
    t.is(
      fs.readFileSync(path.join(tempDir, 'b/q.js'), 'utf8'),
      `// foo
// BAR
// baz
`);
  });
});
