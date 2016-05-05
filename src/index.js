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
  }

  generate(config, localeConfig) {
    return new Promise((resolve, reject) => {
      try {
        this.setConfigs(config, localeConfig);
      } catch (err) {
        reject(err);
      }
      this.buildPatterns();
      if (this.hasDest()) {
        fs.copySync(this.src, this.options.dest);
      }

      async.waterfall(this.config.translations.map((t) => {
        return (cb) => {
          this.processTranslation(t)
          .catch((err) => cb(err))
          .then(() => cb());
        };
      }), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  hasDest() {
    return this.src !== this.options.dest;
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

    for (let t of this.config.translations) {
      Object.keys(t).forEach((key) => {
        let converted = camelCase(key);
        if (key !== converted) {
          t[camelCase(key)] = t[key];
          delete t[key];
        }
      });
    }
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
      if (t.locale) {
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
        if (!shouldContinue) {
          resolve();
          return;
        }
      }
      if (t.add) {
        let filePath = path.join(this.options.dest, t.add.path);
        fs.mkdirsSync(path.dirname(filePath));
        fs.writeFileSync(filePath, t.add.resolved, 'utf8');
        resolve();
        return;
      }
      let srcGlob = t.src || '**/*';
      let srcPaths = path.join(this.options.dest, srcGlob);
      glob(srcPaths, null, (err, files) => {
        if (err) {
          reject(err);
          return;
        }
        async.eachLimit(files, 100, (file, cb) => {
          if (fs.statSync(file).isDirectory()) {
            cb();
            return;
          }
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
    });
  }

  processFile(t, file) {
    return new Promise((resolve, reject) => {
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

    obj.resolved = this.resolveTranslationKey(obj.replace);
    if (obj.args) {
      obj.argsResolved = [];
      for (let i = 0; i < obj.args.length; i++) {
        let a = obj.args[i];
        if (a.replace && typeof a.replace !== 'function') {
          this.resolve(a);
          obj.argsResolved.push(a);
        } else if (a) {
          obj.argsResolved.push(this.resolveTranslationKey(a));
        }
      }
    }
  }

  hasTranslationKey(key) {
    return this.localeConfig.hasOwnProperty(key);
  }

  resolveTranslationKey(target) {
    let resolved = false;
    let result = target.replace(/\${([^}]*)}/g, (all, matched) => {
      if (this.hasTranslationKey(matched)) {
        resolved = true;
      }
      return this.localeConfig[matched];
    });
    if (!resolved) {
      result = undefined;
    }
    return result;
  }
}
