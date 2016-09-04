'use strict';

import fs from 'fs-extra';
import path from 'path';
import Camelizer from './camelizer';
const yaml = require('js-yaml');
const pathExists = require('path-exists');

const ENCODING = 'utf8';

export default class Config {
  constructor(options, config, localeConfig) {
    this.options = options;
    this.config = config || this.readConfigFile('i18n');
    if (localeConfig) {
      this.localeConfig = localeConfig;
    } else {
      if (!this.options.locale) {
        throw new Error('Could not determine locale');
      }
      this.localeConfig = this.readConfigFile(this.options.locale);
    }
    this.setTranslationIds();

    new Camelizer().camelize(this.config.translations);
  }

  readConfigFile(name) {
    let configPath = path.join(this.options.config, `${name}.yml`);
    if (pathExists.sync(configPath)) {
      return yaml.load(fs.readFileSync(configPath, ENCODING), {filename: configPath});
    } else {
      configPath = path.join(this.options.config, `${name}.json`);
      return JSON.parse(fs.readFileSync(configPath));
    }
  }

  setTranslationIds() {
    for (let i = 0; i < this.config.translations.length; i++) {
      this.config.translations[i].id = i + 1;
    }
  }

  hasTranslationKey(key) {
    return this.localeConfig.hasOwnProperty(key);
  }
}
