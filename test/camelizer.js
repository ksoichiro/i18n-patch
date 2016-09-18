'use strict';

import test from 'ava';
import Camelizer from '../src/camelizer';

test('object', t => {
  let map = {
    'this_should_be_camelized': 'value1',
    'thisWillNotBeChanged': 'value2'
  };
  new Camelizer().camelize(map);
  t.is(
    JSON.stringify(map),
    JSON.stringify({
      'thisWillNotBeChanged': 'value2',
      'thisShouldBeCamelized': 'value1'
      }));
});

test('array', t => {
  let array = [
    {
      'this_should_be_camelized': 'value1',
      'thisWillNotBeChanged': 'value2'
    },
    {
      'this_should_be_camelized2': 'value3'
    }
  ];
  new Camelizer().camelize(array);
  t.is(
    JSON.stringify(array),
    JSON.stringify([
      {
        'thisWillNotBeChanged': 'value2',
        'thisShouldBeCamelized': 'value1'
      },
      {
        'thisShouldBeCamelized2': 'value3'
      }]));
});

test('null', t => {
  let value = null;
  let camelizer = new Camelizer();
  t.is(camelizer.acceptable(value), false);
  camelizer.camelize(value);
  t.pass();
});

test('undefined', t => {
  let value = undefined;
  let camelizer = new Camelizer();
  t.is(camelizer.acceptable(value), false);
  camelizer.camelize(value);
  t.pass();
});

test('string', t => {
  let value = 'foo';
  let camelizer = new Camelizer();
  t.is(camelizer.acceptable(value), false);
  camelizer.camelize(value);
  t.is(value, 'foo');
});

test('String', t => {
  let value = new String('foo');
  let camelizer = new Camelizer();
  t.is(camelizer.acceptable(value), false);
  camelizer.camelize(value);
  t.is(value.toString(), 'foo');
});

test('int', t => {
  let value = 100;
  let camelizer = new Camelizer();
  t.is(camelizer.acceptable(value), false);
  camelizer.camelize(value);
  t.is(value, 100);
});

test('0', t => {
  let value = 0;
  let camelizer = new Camelizer();
  t.is(camelizer.acceptable(value), false);
  camelizer.camelize(value);
  t.is(value, 0);
});

test('true', t => {
  let value = true;
  let camelizer = new Camelizer();
  t.is(camelizer.acceptable(value), false);
  camelizer.camelize(value);
  t.is(value, true);
});

test('false', t => {
  let value = false;
  let camelizer = new Camelizer();
  t.is(camelizer.acceptable(value), false);
  camelizer.camelize(value);
  t.is(value, false);
});
