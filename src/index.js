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
      this.setConfigs(config, localeConfig);
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
  }

  readConfigFile(name) {
    let configPath = path.join(this.options.config, `${name}.yml`);
    if (pathExists.sync(configPath)) {
      try {
        return yaml.safeLoad(fs.readFileSync(configPath, ENCODING));
      } catch (err) {
        console.log(`Cannot read ${configPath}`);
        console.log(err.stack);
        process.exit(1);
      }
    } else {
      configPath = path.join(this.options.config, `${name}.json`);
      try {
        return JSON.parse(fs.readFileSync(configPath));
      } catch (err) {
        console.log(`Cannot read ${configPath}`);
        console.log(err.stack);
        process.exit(1);
      }
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
        async.each(files, (file, cb) => {
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
      let beginBuffer = [];
      let endBuffer = [];
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

          if (1 <= beginBuffer.length) {
            let value = '';
            for (let e of beginBuffer) {
              value += e;
              if (!e.endsWith(NEWLINE)) {
                value += NEWLINE;
              }
            }
            let content = fs.readFileSync(file, ENCODING);
            fs.writeFileSync(file, value + content, ENCODING);
          }
          if (1 <= endBuffer.length) {
            let value = '';
            for (let e of endBuffer) {
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
        let result = line;
        for (let p of t.patterns) {
          if (!p.resolved) {
            continue;
          }
          let before = result;
          result = this.applyToResolved(result, p, p.pattern);
          if (p.insert && p.insert.resolved) {
            if (p.insert.at === INSERT_AT_BEGIN) {
              if (beginBuffer.indexOf(p.insert.resolved) < 0) {
                beginBuffer.push(p.insert.resolved);
              }
            } else if (p.insert.at === INSERT_AT_END) {
              if (endBuffer.indexOf(p.insert.resolved) < 0) {
                endBuffer.push(p.insert.resolved);
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
                if (beginBuffer.indexOf(c.insert.resolved) < 0) {
                  beginBuffer.push(c.insert.resolved);
                }
              } else if (c.insert.at === INSERT_AT_END) {
                if (endBuffer.indexOf(c.insert.resolved) < 0) {
                  endBuffer.push(c.insert.resolved);
                }
              }
            }
          }
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

  applyToResolved(target, obj, pattern) {
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
    return target.replace(pattern, resolved);
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
