#!/usr/bin/env node
'use strict';

// Note for development:
// $ npm run watch
// $ node lib/cli.js --config example --src example/src --out example/out ja

import meow from 'meow';
import I18nPatch from './';

const cli = meow(`
    Usage
      $ i18n-patch <locale>

    Options
      --config  Base path for config files.
                i18n.json and <locale>.json is required.
      --src     Base path for source files.
                Current directory by default.
      --out     Base path for output files. 'out' by default.
                This directory should be clean,
                but this tool does not clean it.
                You must remove the directory by yourself.

    Examples
      $ i18n-patch --config example --src example/src --out example/out ja
`);

const locale = cli.input[0];
const opts = cli.flags;

if (!locale) {
  cli.showHelp();
  process.exit(0);
}

new I18nPatch(locale, opts)
.generate()
.catch((err) => {
  console.log(err);
});
