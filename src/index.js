'use strict';

import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import 'babel-polyfill';
import Config from './config';
import Translator from './translator';
const async = require('async');
const temp = require('temp').track();
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
        this.config = new Config(this.options, config, localeConfig);
      } catch (err) {
        reject(err);
      }
      this.buildPatterns();
      this.copySrc();
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

  buildPatterns() {
    for (let t of this.config.config.translations) {
      t.statistics = {files: 0, patterns: 0};
      this.buildConditionals(t);
      if (t.add) {
        t.add.resolved = this.config.localeConfig[t.add.value];
        continue;
      }
      this.buildPatternsForTranslation(t);
      t.statistics.patterns = t.patterns.length;
      this.resolvePatternsForTranslation(t);
    }
  }

  buildConditionals(t) {
    if (!t.conditionals) {
      return;
    }
    for (let c of t.conditionals) {
      if (!c.insert || !this.config.hasTranslationKey(c.insert.value)) {
        continue;
      }
      c.insert.resolved = this.config.localeConfig[c.insert.value];
      if (c.insert.resolved && !c.insert.resolved.endsWith(NEWLINE)) {
        c.insert.resolved += NEWLINE;
      }
    }
  }

  buildPatternsForTranslation(t) {
    let patterns = [];
    for (let p of t.patterns) {
      this.buildOnePatternForTranslation(t, p, patterns);
    }
    t.patterns = patterns;
  }

  buildOnePatternForTranslation(t, p, patterns) {
    if (!p.name || !t.namedPatterns) {
      patterns.push(p);
      return;
    }
    let added = false;
    let namedPattern = this.findNamedPattern(t, p);
    if (!namedPattern) {
      patterns.push(p);
      return;
    }
    let paramsSet = Array.isArray(p.params) ? p.params : [p.params];
    for (let params of paramsSet) {
      patterns.push(this.buildNamedPatternWithParams(namedPattern, params));
      added = true;
    }
    if (!added) {
      patterns.push(p);
    }
  }

  findNamedPattern(t, p) {
    for (let np of t.namedPatterns) {
      if (p.name === np.name) {
        return np;
      }
    }
    return null;
  }

  buildNamedPatternWithParams(namedPattern, params) {
    let np = this.resolveNamedPattern(namedPattern, params);
    let newPattern = {};
    newPattern.pattern = new RegExp(np.pattern);
    if (np.exclude) {
      if (namedPattern.flags) {
        newPattern.exclude = new RegExp(np.exclude, namedPattern.flags);
      } else {
        newPattern.exclude = new RegExp(np.exclude);
      }
    }
    newPattern.replace = np.replace;
    if (namedPattern.flags) {
      newPattern.flags = namedPattern.flags;
    }
    if (np.args) {
      newPattern.args = np.args;
    }
    return newPattern;
  }

  resolveNamedPattern(namedPattern, params) {
    let np = {
      pattern: namedPattern.pattern,
      exclude: namedPattern.exclude,
      replace: namedPattern.replace,
      args: clone(namedPattern.args)
    };
    for (let npp of namedPattern.params) {
      if (!params.hasOwnProperty(npp)) {
        continue;
      }
      let replaceParam = (target) => target.replace(new RegExp(`{${npp}}`, 'g'), params[npp]);
      np.pattern = replaceParam(np.pattern);
      if (np.exclude) {
        np.exclude = replaceParam(np.exclude);
      }
      np.replace = replaceParam(np.replace);
      if (np.args) {
        for (let a of np.args) {
          if (this.isString(a.replace)) {
            a.replace = replaceParam(a.replace);
          } else {
            a = replaceParam(a);
          }
        }
      }
    }
    return np;
  }

  isString(s) {
    return s && typeof s !== 'function' && s.replace;
  }

  resolvePatternsForTranslation(t) {
    for (let p of t.patterns) {
      this.resolvePattern(p);
    }
  }

  resolvePattern(p) {
    this.resolve(p);
    if (p.insert && this.config.hasTranslationKey(p.insert.value)) {
      p.insert.resolved = this.config.localeConfig[p.insert.value];
      if (p.insert.resolved && !p.insert.resolved.endsWith(NEWLINE)) {
        p.insert.resolved += NEWLINE;
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
    glob(path.join(this.options.dest, t.src || '**/*'), {nodir: true}, (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      async.eachLimit(files, 100, (file, cb) => {
        this.processFile(t, file)
        .catch((err) => cb(err))
        .then(() => cb());
      }, (err) => err ? reject(err) : resolve());
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
      let translator = new Translator(t);
      let out = temp.createWriteStream();
      fs.createReadStream(file)
      .pipe(translator)
      .on('error', reject)
      .pipe(out)
      .on('error', reject)
      .on('close', () => {
        this.postProcessOnClose(translator, out, file);
        resolve(file);
      });
    });
  }

  postProcessOnClose(translator, out, file) {
    if (!translator.matched) {
      // Nothing has been changed, so ignore the temporary file
      return;
    }
    // Overwrite the target file with the result
    fs.copySync(out.path, file);
    // TODO Preserve original file stats
    if (translator.hasBeginBuffer()) {
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
    if (translator.hasEndBuffer()) {
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

  resolveTranslationKey(target, returnOriginalIfTranslationMissing) {
    let resolved = false;
    let variableDefined = false;
    let result = target.replace(/\${([^}]*)}/g, (all, matched) => {
      variableDefined = true;
      if (this.config.hasTranslationKey(matched)) {
        resolved = true;
      }
      return this.config.localeConfig[matched];
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
    for (let i = 0; i < this.config.config.translations.length; i++) {
      done.push(false);
    }
    for (let i = 0; i < this.config.config.translations.length; i++) {
      if (done[i]) {
        continue;
      }
      if (this.config.config.translations[i].hasOwnProperty('parallelGroup')) {
        // Search the same translation in rest of the translations
        let parallelGroupId = this.config.config.translations[i].parallelGroup;
        let group = [this.config.config.translations[i]];
        for (let j = i + 1; j < this.config.config.translations.length; j++) {
          if (this.config.config.translations[j].hasOwnProperty('parallelGroup')) {
            let parallelGroupId2 = this.config.config.translations[j].parallelGroup;
            if (parallelGroupId === parallelGroupId2) {
              group.push(this.config.config.translations[j]);
              done[j] = true;
            }
          }
        }
        parallelGroups.push(group);
      } else {
        parallelGroups.push([this.config.config.translations[i]]);
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
