#!/usr/bin/env node
'use strict';

import meow from 'meow';
import I18nPatch from './';
import { YAMLException } from 'js-yaml';

const cli = meow(`
    Usage
      $ i18n-patch <locale> <src> [<dest>]

    Options
      --config  Base path for config files.
                i18n.yml and <locale>.yml is required.
                json is also available instead of yaml.
                'config' by default.

    Examples
      $ i18n-patch --config example/config ja example/src example/out
`);

const opts = cli.flags;
opts.locale = cli.input[0];
opts.dest = cli.input[2];
const src = cli.input[1];

if (!opts.locale || !src) {
  cli.showHelp();
  process.exit(0);
}

new I18nPatch(src, opts)
.generate()
.catch((err) => {
  if (err instanceof YAMLException) {
    console.log(`Invalid YAML format: ${err.message}`);
  } else {
    console.log(err);
  }
});
