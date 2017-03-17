#!/usr/bin/env node
'use strict';

import meow from 'meow';
import I18nPatch from './';
import { YAMLException } from 'js-yaml';

const cli = meow(`
    Usage
      $ i18n-patch <locale> <src> [<dest>]

    Options
      --config      Base path for config files.
                    i18n.yml and <locale>.yml is required.
                    json is also available instead of yaml.
                    'config' by default.
      --statistics  Show statistics.
      --condition   Condition value to limit patterns for specific versions.
      --unmatched   Show unmatched lines to stderr.
                    They are scanned and tried to be translated but
                    no suitable translation is found in the config files.
                    These lines indicates that they might
                    have to be translated or they should be skipped.
                    false by default.

    Examples
      $ i18n-patch --config example/config --statistics --condition "version=1.1.0" --unmatched -- ja example/src example/out 2> unmatched.log
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
