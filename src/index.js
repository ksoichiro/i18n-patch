'use strict';

import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import rl from 'readline';
const async = require('async');
const yaml = require('js-yaml');
const temp = require('temp').track();
const pathExists = require('path-exists');

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
        return yaml.safeLoad(fs.readFileSync(configPath, 'utf8'));
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
    this.config.translations.forEach((t) => {
      t.patterns.forEach((p) => {
        let resolved = false;
        if (p.replace) {
          p.resolved = p.replace.replace(/\${([^}]*)}/g, (all, matched) => {
            if (this.localeConfig.hasOwnProperty(matched)) {
              resolved = true;
            }
            return this.localeConfig[matched];
          });
          if (!resolved) {
            p.resolved = undefined;
          }
        }
        if (p.insert) {
          if (this.localeConfig.hasOwnProperty(p.insert.value)) {
            p.insert.resolved = this.localeConfig[p.insert.value];
          }
        }
      });
    });
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
            beginBuffer.forEach((e) => {
              value += `${e}\n`;
            });
            let content = fs.readFileSync(file, 'utf8');
            fs.writeFileSync(file, value + content, 'utf8');
          }
          if (1 <= endBuffer.length) {
            let value = '';
            endBuffer.forEach((e) => {
              value += `${e}\n`;
            });
            let content = fs.readFileSync(file, 'utf8');
            fs.writeFileSync(file, value + content, 'utf8');
          }
        }
        resolve(file);
      });
      lr.on('line', (line) => {
        let result = line;
        t.patterns.forEach((p) => {
          let before = result;
          if (p.resolved) {
            result = result.replace(p.pattern, p.resolved);
            if (p.insert && p.insert.resolved) {
              if (p.insert.at === 'begin') {
                if (beginBuffer.indexOf(p.insert.resolved) < 0) {
                  beginBuffer.push(p.insert.resolved);
                }
              } else if (p.insert.at === 'end') {
                if (endBuffer.indexOf(p.insert.resolved) < 0) {
                  endBuffer.push(p.insert.resolved);
                }
              }
            }
          }
          if (before !== result) {
            matched = true;
          }
        });
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
        t.patterns.forEach((p) => {
          if (!p.pattern && p.insert && p.insert.resolved) {
            let at = p.insert.at;
            let value = p.insert.resolved;
            if (at === 'begin') {
              let content = fs.readFileSync(file, 'utf8');
              fs.writeFileSync(file, value + content, 'utf8');
            } else if (at === 'end') {
              let content = fs.readFileSync(file, 'utf8');
              fs.writeFileSync(file, content + value, 'utf8');
            }
          }
        });
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  hasPerFilePattern(t) {
    let hasPerFilePattern = false;
    t.patterns.forEach((p) => {
      if (p.insert) {
        hasPerFilePattern = true;
      }
    });
    return hasPerFilePattern;
  }
}
