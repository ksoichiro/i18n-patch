'use strict';

import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import 'babel-polyfill';
import Translator from './translator';
const async = require('async');
const yaml = require('js-yaml');
const temp = require('temp').track();
const pathExists = require('path-exists');
const camelCase = require('camelcase');
const clone = require('clone');
const prettyHrtime = require('pretty-hrtime');

const NEWLINE = '\n';
const ENCODING = 'utf8';
const INSERT_AT_BEGIN = 'begin';
const INSERT_AT_END = 'end';

export default class I18nPatch {
  constructor(src, options) {
    if (!src) {
      throw new Error('src is required');
    }
    this.src = src;
    this.options = options || {};
    this.options.dest = this.options.dest || this.src;
    this.options.config = this.options.config || 'config';
    this.options.statistics = this.options.statistics || false;
  }

  generate(config, localeConfig) {
    return new Promise((resolve, reject) => {
      try {
        this.setConfigs(config, localeConfig);
      } catch (err) {
        reject(err);
      }
      this.buildPatterns();
      this.copySrc();
      this.setTranslationIds();
      async.series(this.processTranslations(), (err) => err ? reject(err) : resolve());
    });
  }

  copySrc() {
    if (this.hasDest()) {
      fs.copySync(this.src, this.options.dest);
    }
  }

  hasDest() {
    return this.src !== this.options.dest;
  }

  setTranslationIds() {
    for (let i = 0; i < this.config.translations.length; i++) {
      this.config.translations[i].id = i + 1;
    }
  }

  setConfigs(config, localeConfig) {
    this.config = config || this.readConfigFile('i18n');
    if (localeConfig) {
      this.localeConfig = localeConfig;
    } else {
      if (!this.options.locale) {
        throw new Error('Could not determine locale');
      }
      this.localeConfig = this.readConfigFile(this.options.locale);
    }

    this.camelize(this.config.translations);
  }

  camelize(config) {
    if (!config) {
      return;
    }
    if (typeof config === 'object') {
      this.camelizeObject(config);
    } else if (config instanceof Array) {
      for (let t of config) {
        this.camelizeObject(t);
      }
    }
  }

  camelizeObject(obj) {
    if (!obj) {
      return;
    }
    Object.keys(obj).forEach((key) => {
      let converted = camelCase(key);
      if (key !== converted) {
        obj[converted] = obj[key];
        delete obj[key];
      }
      this.camelize(obj[converted]);
    });
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

  buildPatterns() {
    for (let t of this.config.translations) {
      t.statistics = {};
      t.statistics.files = 0;
      t.statistics.patterns = 0;
      if (t.conditionals) {
        for (let c of t.conditionals) {
          if (!c.insert || !this.hasTranslationKey(c.insert.value)) {
            continue;
          }
          c.insert.resolved = this.localeConfig[c.insert.value];
          if (c.insert.resolved && !c.insert.resolved.endsWith(NEWLINE)) {
            c.insert.resolved += NEWLINE;
          }
        }
      }
      if (t.add) {
        t.add.resolved = this.localeConfig[t.add.value];
        continue;
      }
      let patterns = [];
      for (let p of t.patterns) {
        let added = false;
        if (p.name) {
          if (t.namedPatterns) {
            let namedPattern;
            for (let np of t.namedPatterns) {
              if (p.name === np.name) {
                namedPattern = np;
                break;
              }
            }
            if (namedPattern) {
              let paramsSet = [];
              if (Array.isArray(p.params)) {
                paramsSet = p.params;
              } else {
                paramsSet = [p.params];
              }
              for (let params of paramsSet) {
                let npPattern = namedPattern.pattern;
                let npExclude = namedPattern.exclude;
                let npReplace = namedPattern.replace;
                let npArgs = clone(namedPattern.args);
                let npFlags = 'g';
                for (let npp of namedPattern.params) {
                  if (params.hasOwnProperty(npp)) {
                    npPattern = npPattern.replace(new RegExp(`{${npp}}`, npFlags), params[npp]);
                    if (npExclude) {
                      npExclude = npExclude.replace(new RegExp(`{${npp}}`, npFlags), params[npp]);
                    }
                    npReplace = npReplace.replace(new RegExp(`{${npp}}`, npFlags), params[npp]);
                    if (npArgs) {
                      for (let a of npArgs) {
                        if (a.replace && typeof a.replace !== 'function' && a.replace.replace) {
                          a.replace = a.replace.replace(new RegExp(`{${npp}}`, npFlags), params[npp]);
                        } else if (a) {
                          a = a.replace(new RegExp(`{${npp}}`, npFlags), params[npp]);
                        }
                      }
                    }
                  }
                }
                let newPattern = {};
                newPattern.pattern = new RegExp(npPattern);
                if (namedPattern.exclude) {
                  if (namedPattern.flags) {
                    newPattern.exclude = new RegExp(npExclude, namedPattern.flags);
                  } else {
                    newPattern.exclude = new RegExp(npExclude);
                  }
                }
                newPattern.replace = npReplace;
                if (namedPattern.flags) {
                  newPattern.flags = namedPattern.flags;
                }
                if (namedPattern.args) {
                  newPattern.args = npArgs;
                }
                patterns.push(newPattern);
                added = true;
              }
            }
          }
        }
        if (!added) {
          patterns.push(p);
        }
      }
      t.patterns = patterns;
      t.statistics.patterns = patterns.length;
      for (let p of t.patterns) {
        this.resolve(p);
        if (p.insert && this.hasTranslationKey(p.insert.value)) {
          p.insert.resolved = this.localeConfig[p.insert.value];
          if (p.insert.resolved && !p.insert.resolved.endsWith(NEWLINE)) {
            p.insert.resolved += NEWLINE;
          }
        }
      }
    }
  }

  processTranslation(t) {
    return new Promise((resolve, reject) => {
      if (this.shouldQuitForThisLocale(t)) {
        resolve();
        return;
      }
      if (this.shouldJustAddFile(t)) {
        resolve();
        return;
      }
      this.processTranslationsForMatchingFiles(t, resolve, reject);
    });
  }

  shouldQuitForThisLocale(t) {
    if (!t.locale) {
      return false;
    }
    let shouldContinue = true;
    if (t.locale.include) {
      shouldContinue = false;
      for (let l of t.locale.include) {
        if (l === this.options.locale) {
          shouldContinue = true;
          break;
        }
      }
    } else if (t.locale.exclude) {
      shouldContinue = true;
      for (let l of t.locale.exclude) {
        if (l === this.options.locale) {
          shouldContinue = false;
          break;
        }
      }
    }
    return !shouldContinue;
  }

  shouldJustAddFile(t) {
    if (!t.add) {
      return false;
    }
    let filePath = path.join(this.options.dest, t.add.path);
    fs.mkdirsSync(path.dirname(filePath));
    fs.writeFileSync(filePath, t.add.resolved, 'utf8');
    return true;
  }

  processTranslationsForMatchingFiles(t, resolve, reject) {
    let srcGlob = t.src || '**/*';
    let srcPaths = path.join(this.options.dest, srcGlob);
    glob(srcPaths, {nodir: true}, (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      async.eachLimit(files, 100, (file, cb) => {
        this.processFile(t, file)
        .catch((err) => cb(err))
        .then(() => cb());
      }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  processFile(t, file) {
    return new Promise((resolve, reject) => {
      t.statistics.files++;
      this.processFilePerLine(t, file)
      .catch((err) => reject(err))
      .then((file) => {
        if (this.hasPerFilePattern(t)) {
          this.processFilePerFile(t, file)
          .catch((err) => reject(err))
          .then((file) => resolve(file));
        } else {
          resolve(file);
        }
      });
    });
  }

  processFilePerLine(t, file) {
    return new Promise((resolve, reject) => {
      // Per-line processing
      let translator = new Translator(t);
      let out = temp.createWriteStream();
      fs.createReadStream(file)
      .pipe(translator)
      .on('error', reject)
      .pipe(out)
      .on('error', reject)
      .on('close', () => {
        if (translator.matched) {
          // TODO Preserve original file stats
          fs.copySync(out.path, file);

          if (1 <= translator.beginBuffer.length) {
            let value = '';
            for (let e of translator.beginBuffer) {
              value += e;
              if (!e.endsWith(NEWLINE)) {
                value += NEWLINE;
              }
            }
            let content = fs.readFileSync(file, ENCODING);
            fs.writeFileSync(file, value + content, ENCODING);
          }
          if (1 <= translator.endBuffer.length) {
            let value = '';
            for (let e of translator.endBuffer) {
              value += e;
              if (!e.endsWith(NEWLINE)) {
                value += NEWLINE;
              }
            }
            let content = fs.readFileSync(file, ENCODING);
            if (!content.endsWith(NEWLINE)) {
              content += NEWLINE;
            }
            fs.writeFileSync(file, content + value, ENCODING);
          }
        }
        resolve(file);
      });
    });
  }

  processFilePerFile(t, file) {
    return new Promise((resolve, reject) => {
      try {
        for (let p of t.patterns) {
          if (p.pattern || !p.insert || !p.insert.resolved) {
            continue;
          }
          let at = p.insert.at;
          let value = p.insert.resolved;
          if (!value.endsWith(NEWLINE)) {
            value += NEWLINE;
          }
          if (at === INSERT_AT_BEGIN) {
            let content = fs.readFileSync(file, ENCODING);
            fs.writeFileSync(file, value + content, ENCODING);
          } else if (at === INSERT_AT_END) {
            let content = fs.readFileSync(file, ENCODING);
            if (!content.endsWith(NEWLINE)) {
              content += NEWLINE;
            }
            fs.writeFileSync(file, content + value, ENCODING);
          }
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  hasPerFilePattern(t) {
    return !!t.patterns.find(p => p.insert);
  }

  resolve(obj) {
    if (!obj.replace) {
      return;
    }

    obj.resolved = this.resolveTranslationKey(obj.replace, true);
    if (obj.args) {
      obj.argsResolved = [];
      for (let i = 0; i < obj.args.length; i++) {
        let a = obj.args[i];
        if (a.replace && typeof a.replace !== 'function') {
          this.resolve(a);
          obj.argsResolved.push(a);
        } else if (a) {
          obj.argsResolved.push(this.resolveTranslationKey(a, false));
        }
      }
    }
  }

  hasTranslationKey(key) {
    return this.localeConfig.hasOwnProperty(key);
  }

  resolveTranslationKey(target, returnOriginalIfTranslationMissing) {
    let resolved = false;
    let variableDefined = false;
    let result = target.replace(/\${([^}]*)}/g, (all, matched) => {
      variableDefined = true;
      if (this.hasTranslationKey(matched)) {
        resolved = true;
      }
      return this.localeConfig[matched];
    });
    if (!resolved) {
      if (returnOriginalIfTranslationMissing && !variableDefined) {
        return target;
      }
      result = undefined;
    }
    return result;
  }

  processTranslations() {
    return this.createParallelGroups().map((parallelGroup) => {
      return (cb) => {
        if (parallelGroup.length < 2) {
          this.processTranslationForGroup(parallelGroup[0], cb);
        } else {
          this.processTranslationForGroupsInParallel(parallelGroup, cb);
        }
      };
    });
  }

  createParallelGroups() {
    let parallelGroups = [];
    let done = [];
    for (let i = 0; i < this.config.translations.length; i++) {
      done.push(false);
    }
    for (let i = 0; i < this.config.translations.length; i++) {
      if (done[i]) {
        continue;
      }
      if (this.config.translations[i].hasOwnProperty('parallelGroup')) {
        // Search the same translation in rest of the translations
        let parallelGroupId = this.config.translations[i].parallelGroup;
        let group = [this.config.translations[i]];
        for (let j = i + 1; j < this.config.translations.length; j++) {
          if (this.config.translations[j].hasOwnProperty('parallelGroup')) {
            let parallelGroupId2 = this.config.translations[j].parallelGroup;
            if (parallelGroupId === parallelGroupId2) {
              group.push(this.config.translations[j]);
              done[j] = true;
            }
          }
        }
        parallelGroups.push(group);
      } else {
        parallelGroups.push([this.config.translations[i]]);
      }
      done[i] = true;
    }
    return parallelGroups;
  }

  processTranslationForGroup(t, cb) {
    let startTime = process.hrtime();
    this.processTranslation(t)
    .catch((err) => cb(err))
    .then(() => {
      t.statistics.time = process.hrtime(startTime);
      this.showStatistics(t);
      cb();
    });
  }

  processTranslationForGroupsInParallel(parallelGroup, cb) {
    async.parallel(parallelGroup.map((t) => {
      return (cb2) => this.processTranslationForGroup(t, cb2);
    }), (err) => {
      cb(err);
    });
  }

  showStatistics(t) {
    if (this.options.statistics) {
      let name = t.name || t.src || '';
      if (name !== '') {
        name = ` (${name})`;
      }
      console.log(`[${t.id}]${name}: processed ${t.statistics.files} files for ${t.statistics.patterns} patterns in ${prettyHrtime(t.statistics.time)}`);
    }
  }
}
