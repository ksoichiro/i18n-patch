'use strict';

import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import rl from 'readline';
const temp = require('temp').track();

export default class I18nPatch {
  constructor(locale, options) {
    this.locale = locale;
    this.options = options || {};
    this.options.out = this.options.out || 'out';
  }

  generate(config, localeConfig) {
    this.setConfigs(config, localeConfig);
    this.buildPatterns();
    return new Promise((resolve, reject) => {
      fs.copySync(this.options.src, this.options.out);

      Promise.all(this.config.translations.map((t) => {
        return this.processTranslation(t);
      }))
      .catch((err) => {
        reject(err);
      })
      .then(() => {
        resolve();
      });
    });
  }

  setConfigs(config, localeConfig) {
    this.config = config || this.readConfigFile('i18n.json');
    this.localeConfig = localeConfig || this.readConfigFile(`${this.locale}.json`);
  }

  readConfigFile(name) {
    const basePath = this.options.config || '.';
    let configPath  = path.join(basePath, name);
    let configFile;
    try {
      configFile = fs.readFileSync(configPath);
    } catch (err) {
      console.log(`Cannot read ${configPath}`);
      process.exit(1);
    }
    return JSON.parse(configFile);
  }

  buildPatterns() {
    this.config.translations.forEach((t) => {
      t.patterns.forEach((p) => {
        let resolved = false;
        p.resolved = p.replace.replace(/\${([^}]*)}/g, (all, matched) => {
          if (this.localeConfig.hasOwnProperty(matched)) {
            resolved = true;
          }
          return this.localeConfig[matched];
        });
        if (!resolved) {
          p.resolved = undefined;
        }
      });
    });
  }

  processTranslation(t) {
    return new Promise((resolve, reject) => {
      let srcGlob = t.src || '**/*';
      let srcPaths = path.join(this.options.out, srcGlob);
      glob(srcPaths, null, (err, files) => {
        if (err) {
          reject(err);
          return;
        }
        Promise.all(files.map((file) => {
          return this.processFile(t, file);
        }))
        .catch((err) => {
          reject(err);
        })
        .then((file) => {
          resolve(file);
        });
      });
    });
  }

  processFile(t, file) {
    return new Promise((resolve, reject) => {
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
        }
        resolve(file);
      });
      lr.on('line', (line) => {
        let result = line;
        t.patterns.forEach((p) => {
          let before = result;
          if (p.resolved) {
            result = result.replace(p.pattern, p.resolved);
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
}
