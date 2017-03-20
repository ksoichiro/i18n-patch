'use strict';

import test from 'ava';
import I18nPatch from '../src';
import fs from 'fs';
import path from 'path';
import temp from 'temp';

test.before(() => {
  temp.track();
});

test('evaluate-when: satisfies version', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/evaluate-when',
    locale: 'ja',
    dest: tempDir,
    condition: 'version=1.1.0'
  };
  return new I18nPatch('./fixtures/evaluate-when', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `/*
  FOO
  bar
*/
`);
  });
});

test('evaluate-when: not satisfies version', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/evaluate-when',
    locale: 'ja',
    dest: tempDir,
    condition: 'version=0.8.0'
  };
  return new I18nPatch('./fixtures/evaluate-when', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `/*
  foo
  bar
*/
`);
  });
});

test('evaluate-when: satisfies multiple conditions', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/evaluate-when',
    locale: 'ja',
    dest: tempDir,
    condition: 'version=0.9.1,something=bar'
  };
  return new I18nPatch('./fixtures/evaluate-when', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `/*
  FOO
  BAR
*/
`);
  });
});

test('evaluate-when: just version value', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/evaluate-when',
    locale: 'ja',
    dest: tempDir,
    statistics: true,
    condition: '0.9.1'
  };
  return new I18nPatch('./fixtures/evaluate-when', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `/*
  FOO
  bar
*/
`);
  });
});

test('evaluate-when: for pattern', t => {
  let tempDir = temp.mkdirSync('out');
  let opts = {
    config: './fixtures/evaluate-when',
    locale: 'ja',
    dest: tempDir,
    statistics: true,
    condition: 'version=2.0.0,something=bar'
  };
  return new I18nPatch('./fixtures/evaluate-when', opts)
  .generate()
  .catch((err) => {
    console.log(err.stack);
    t.fail(err);
  })
  .then(() => {
    t.is(
      fs.readFileSync(path.join(tempDir, 'test.js'), 'utf8'),
      `/*
  FOO
  BAZ
*/
`);
  });
});
