'use strict';

import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import rl from 'readline';
import 'babel-polyfill';
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
    this.beginBuffer = [];
    this.endBuffer = [];
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
      return yaml.load(fs.readFileSync(configPath, ENCODING));
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
      let srcGlob = t.src || '**/*';
      let srcPaths = path.join(this.options.dest, srcGlob);
      glob(srcPaths, null, (err, files) => {
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
      let matched = false;
      let error;
      let lr = rl.createInterface({
        input: fs.createReadStream(file)
      });
      let out = temp.createWriteStream()
      .on('error', (err) => {
        reject(err);
      })
      .on('close', () => {
        if (error) {
          // This can be set in 'error' callback of lr
          return;
        }
        if (matched) {
          // TODO Preserve original file stats
          fs.copySync(out.path, file);

          if (1 <= this.beginBuffer.length) {
            let value = '';
            for (let e of this.beginBuffer) {
              value += e;
              if (!e.endsWith(NEWLINE)) {
                value += NEWLINE;
              }
            }
            let content = fs.readFileSync(file, ENCODING);
            fs.writeFileSync(file, value + content, ENCODING);
          }
          if (1 <= this.endBuffer.length) {
            let value = '';
            for (let e of this.endBuffer) {
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
      lr.on('line', (line) => {
        let [m, result] = this.processLine(t, line);
        if (m) {
          matched = true;
        }
        // TODO Preserve original newline if possible
        out.write(`${result}\n`);
      })
      .on('error', (err) => {
        error = err;
        out.end();
        reject(err);
      })
      .on('close', () => {
        out.end();
      });
    });
  }

  processLine(t, line) {
    let matched = false;
    let result = line;
    for (let p of t.patterns) {
      if (!p.resolved) {
        continue;
      }
      let before = result;
      result = this.applyToResolved(result, p, p.pattern, p.exclude, p.flags);
      if (p.insert && p.insert.resolved) {
        if (p.insert.at === INSERT_AT_BEGIN) {
          if (this.beginBuffer.indexOf(p.insert.resolved) < 0) {
            this.beginBuffer.push(p.insert.resolved);
          }
        } else if (p.insert.at === INSERT_AT_END) {
          if (this.endBuffer.indexOf(p.insert.resolved) < 0) {
            this.endBuffer.push(p.insert.resolved);
          }
        }
      }
      if (before === result) {
        continue;
      }
      matched = true;
      if (t.conditionals) {
        for (let c of t.conditionals) {
          if (!c.insert || !c.insert.resolved) {
            continue;
          }
          if (c.insert.at === INSERT_AT_BEGIN) {
            if (this.beginBuffer.indexOf(c.insert.resolved) < 0) {
              this.beginBuffer.push(c.insert.resolved);
            }
          } else if (c.insert.at === INSERT_AT_END) {
            if (this.endBuffer.indexOf(c.insert.resolved) < 0) {
              this.endBuffer.push(c.insert.resolved);
            }
          }
        }
      }
    }
    return [matched, result];
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

  applyToResolved(target, obj, pattern, exclude, flags) {
    let resolved = obj.resolved;
    if (obj.args) {
      for (let i = 0; i < obj.args.length; i++) {
        let argResolved = obj.argsResolved[i];
        if (argResolved) {
          if (argResolved.replace && typeof argResolved.replace !== 'function') {
            if (argResolved.resolved) {
              resolved = this.applyToArgResolved(resolved, argResolved, `{${i}}`);
            } else {
              resolved = resolved.replace(`{${i}}`, argResolved.replace);
            }
          } else {
            resolved = resolved.replace(`{${i}}`, argResolved);
          }
        } else {
          resolved = resolved.replace(`{${i}}`, obj.args[i]);
        }
      }
    }
    let exp = flags ? new RegExp(pattern, flags) : pattern;
    let result = target.replace(exp, resolved);
    if (exclude && result !== target && target.match(exclude)) {
      return target;
    }
    return result;
  }

  applyToArgResolved(target, obj, pattern) {
    if (obj.args) {
      for (let i = 0; i < obj.args.length; i++) {
        let argResolved = obj.argsResolved[i];
        if (argResolved) {
          obj.resolved = this.applyToArgResolved(obj.resolved, argResolved, `{${i}}`);
        } else {
          obj.resolved = obj.resolved.replace(`{${i}}`, obj.args[i]);
        }
      }
    }
    return target.replace(pattern, obj.resolved);
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
