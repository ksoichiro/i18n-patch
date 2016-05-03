'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('add', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/add',
    locale: 'ja',
    dest: tempDir
  };
  return new I18nPatch('./fixtures/add', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'a', 'b', 'test.js'), 'utf8'),
      `// foo
// bar
`);
  });
});
