'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('insert at the begin/end of the file if matched', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/insert',
    locale: 'ja',
    dest: tempDir
  };
  return new I18nPatch('./fixtures/insert', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `/*
  bar
*/
// whatever
`);

    // Even when matched twice, snippets will be inserted only once
    t.is(
      fs.readFileSync(path.join(tempDir, 'test2.js'), 'utf8'),
      `// whatever
/*
  bar
  qux
*/
// whatever
`);
  });
});
