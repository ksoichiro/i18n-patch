'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('exception is thrown when the patterns are broken', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/broken',
    locale: 'ja',
    dest: tempDir
  };
  t.plan(1);
  return new I18nPatch('./fixtures/broken', opts)
  .generate()
  .catch((err) => {
    t.truthy(err);
  });
});
