'use strict';

import test from 'ava';
import Config from '../src/config';

test('multiple YAML files', t => {
  let config = new Config({ config: 'fixtures/config/multi', locale: 'ja' });
  t.is(config.config.translations.length, 3);
  t.is(JSON.stringify(config.config),
    JSON.stringify({
      translations: [
        { src: '*.md', patterns: [{ pattern: 'baz', replace: '${baz}' }], id: 1 },
        { src: '*.js', patterns: [{ pattern: 'foo', replace: '${foo}' }], id: 2 },
        { src: '*.html', patterns: [{ pattern: 'bar', replace: '${bar}' }], id: 3 }
      ]
    }));
});

test('multiple YAML files only with suffixed files', t => {
  let config = new Config({ config: 'fixtures/config/multi-suffix-only', locale: 'ja' });
  t.is(config.config.translations.length, 2);
  t.is(JSON.stringify(config.config),
    JSON.stringify({
      translations: [
        { src: '*.js', patterns: [{ pattern: 'foo', replace: '${foo}' }], id: 1 },
        { src: '*.html', patterns: [{ pattern: 'bar', replace: '${bar}' }], id: 2 }
      ]
    }));
});

test('multiple JSON files', t => {
  let config = new Config({ config: 'fixtures/config/multi-json', locale: 'ja' });
  t.is(config.config.translations.length, 3);
  t.is(JSON.stringify(config.config),
    JSON.stringify({
      translations: [
        { src: '*.md', patterns: [{ pattern: 'baz', replace: '${baz}' }], id: 1 },
        { src: '*.js', patterns: [{ pattern: 'foo', replace: '${foo}' }], id: 2 },
        { src: '*.html', patterns: [{ pattern: 'bar', replace: '${bar}' }], id: 3 }
      ]
    }));
});

test('multiple JSON files only with suffixed files', t => {
  let config = new Config({ config: 'fixtures/config/multi-json-suffix-only', locale: 'ja' });
  t.is(config.config.translations.length, 2);
  t.is(JSON.stringify(config.config),
    JSON.stringify({
      translations: [
        { src: '*.js', patterns: [{ pattern: 'foo', replace: '${foo}' }], id: 1 },
        { src: '*.html', patterns: [{ pattern: 'bar', replace: '${bar}' }], id: 2 }
      ]
    }));
});
