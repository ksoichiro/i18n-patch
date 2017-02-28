'use strict';

import fs from 'fs-extra';
import path from 'path';
import glob from 'glob';
import _ from 'lodash';
import Camelizer from './camelizer';
const yaml = require('js-yaml');
const pathExists = require('path-exists');

const ENCODING = 'utf8';

export default class Config {
  constructor(options, config, localeConfig) {
    this.options = options;
    this.config = config || this._readConfigFile('i18n');
    if (localeConfig) {
      this.localeConfig = localeConfig;
    } else {
      if (!this.options.locale) {
        throw new Error('Could not determine locale');
      }
      this.localeConfig = this._readConfigFile(this.options.locale);
    }
    this._setTranslationIds();

    new Camelizer().camelize(this.config.translations);
  }

  hasTranslationKey(key) {
    return this.localeConfig.hasOwnProperty(key);
  }

  _readConfigFile(name) {
    let configPath = path.join(this.options.config, `${name}.yml`);
    let result;
    if (pathExists.sync(configPath)) {
      result = yaml.load(fs.readFileSync(configPath, ENCODING), {filename: configPath});
    } else {
      configPath = path.join(this.options.config, `${name}.json`);
      if (pathExists.sync(configPath)) {
        result = JSON.parse(fs.readFileSync(configPath));
      } else {
        result = {};
      }
    }
    let filenames = glob.sync(`${name}-*.@(yml|json)`, { cwd: this.options.config });
    if (filenames) {
      filenames = filenames.sort();
    }
    for (let filename of filenames) {
      let filePath = path.join(this.options.config, filename);
      let obj;
      if (filename.match(/.*\.yml/)) {
        obj = yaml.load(fs.readFileSync(filePath, ENCODING), {filename: filePath});
      } else if (filename.match(/.*\.json/)) {
        obj = JSON.parse(fs.readFileSync(filePath));
      }
      _.mergeWith(result, obj, (objValue, srcValue) => {
        if (_.isArray(objValue)) {
          return objValue.concat(srcValue);
        }
      });
    }
    return result;
  }

  _setTranslationIds() {
    for (let i = 0; i < this.config.translations.length; i++) {
      this.config.translations[i].id = i + 1;
    }
  }
}
