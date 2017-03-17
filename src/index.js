'use strict';

import path from 'path';
import fs from 'fs-extra';
import vm from 'vm';
import glob from 'glob';
import 'babel-polyfill';
import Config from './config';
import Translator from './translator';
const semver = require('semver');
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
    this.options.unmatched = this.options.unmatched || false;
    this._initConditions();
  }

  _initConditions() {
    // condition might be specified multiple time; CSV
    let conditions = this.options.condition ? this.options.condition.split(',') : [];
    this.options.conditions = {};
    for (let c of conditions) {
      let idx = c.indexOf('=');
      if (0 < idx) {
        let key = c.substring(0, idx);
        let value = c.substring(idx + 1, c.length);
        this.options.conditions[key] = value;
      } else {
        // if the value is not key=value format, then treat it as a variable named 'version'
        this.options.conditions['version'] = c;
      }
    }
  }

  generate(config, localeConfig) {
    return new Promise((resolve, reject) => {
      try {
        this.config = new Config(this.options, config, localeConfig);
      } catch (err) {
        reject(err);
      }
      this._buildPatterns();
      this._copySrc();
      async.series(this._processTranslations(), (err) => err ? reject(err) : resolve());
    });
  }

  _copySrc() {
    if (this._hasDest()) {
      fs.copySync(this.src, this.options.dest);
    }
  }

  _hasDest() {
    return this.src !== this.options.dest;
  }

  _buildPatterns() {
    for (let t of this.config.config.translations) {
      t.statistics = {files: 0, patterns: 0};
      this._buildConditionals(t);
      if (t.add) {
        t.add.resolved = this.config.localeConfig[t.add.value];
        continue;
      }
      this._buildPatternsForTranslation(t);
      t.statistics.patterns = t.patterns.length;
      this._resolvePatternsForTranslation(t);
    }
  }

  _buildConditionals(t) {
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

  _buildPatternsForTranslation(t) {
    let patterns = [];
    for (let p of t.patterns) {
      this._buildOnePatternForTranslation(t, p, patterns);
    }
    t.patterns = patterns;
  }

  _buildOnePatternForTranslation(t, p, patterns) {
    if (!p.name || !t.namedPatterns) {
      patterns.push(p);
      return;
    }
    let namedPattern = this._findNamedPattern(t, p);
    if (!namedPattern) {
      patterns.push(p);
      return;
    }
    if (p.hasOwnProperty('params')) {
      let paramsSet = Array.isArray(p.params) ? p.params : [p.params];
      for (let params of paramsSet) {
        patterns.push(this._buildNamedPatternWithParams(namedPattern, params));
      }
    } else {
      patterns.push(p);
    }
  }

  _findNamedPattern(t, p) {
    for (let np of t.namedPatterns) {
      if (p.name === np.name) {
        return np;
      }
    }
    return null;
  }

  _buildNamedPatternWithParams(namedPattern, params) {
    let np = this._resolveNamedPattern(namedPattern, params);
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

  _resolveNamedPattern(namedPattern, params) {
    let np = {
      pattern: namedPattern.pattern,
      exclude: namedPattern.exclude,
      replace: namedPattern.replace,
      args: clone(namedPattern.args)
    };
    if (!namedPattern.hasOwnProperty('params')) {
      return np;
    }
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
          if (this._isString(a.replace)) {
            a.replace = replaceParam(a.replace);
          } else {
            a = replaceParam(a);
          }
        }
      }
    }
    return np;
  }

  _isString(s) {
    return s && typeof s !== 'function' && s.replace;
  }

  _resolvePatternsForTranslation(t) {
    t.resolvedPatterns = [];
    for (let p of t.patterns) {
      this._resolvePattern(t, p);
    }
  }

  _resolvePattern(t, p) {
    this._resolve(p);
    if (p.insert && this.config.hasTranslationKey(p.insert.value)) {
      p.insert.resolved = this.config.localeConfig[p.insert.value];
      if (p.insert.resolved && !p.insert.resolved.endsWith(NEWLINE)) {
        p.insert.resolved += NEWLINE;
      }
    }
    if (p.hasOwnProperty('resolved') && p.resolved) {
      t.resolvedPatterns.push(p);
    }
  }

  _processTranslation(t) {
    return new Promise((resolve, reject) => {
      t.shouldEvaluate = this._shouldEvaluate(t);
      if (!t.shouldEvaluate) {
        resolve();
        return;
      }
      if (this._shouldQuitForThisLocale(t)) {
        resolve();
        return;
      }
      if (this._shouldJustAddFile(t)) {
        resolve();
        return;
      }
      this._processTranslationsForMatchingFiles(t, resolve, reject);
    });
  }

  _shouldEvaluate(t) {
    if (!t.hasOwnProperty('evaluateWhen')) {
      return true;
    }
    let sandbox = {
      semver: semver
    };
    Object.assign(sandbox, this.options.conditions);
    vm.createContext(sandbox);
    let conditionSatisfied;
    try {
      conditionSatisfied = vm.runInContext(t.evaluateWhen, sandbox);
    } catch (e) {
      console.log(`${t.name}: warning: could not evaluate 'evaluate-when' property: ${t.evaluateWhen}: ${e.message}`);
      conditionSatisfied = false;
    }
    return conditionSatisfied;
  }

  _shouldQuitForThisLocale(t) {
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

  _shouldJustAddFile(t) {
    if (!t.add) {
      return false;
    }
    let filePath = path.join(this.options.dest, t.add.path);
    fs.mkdirsSync(path.dirname(filePath));
    fs.writeFileSync(filePath, t.add.resolved, 'utf8');
    return true;
  }

  _processTranslationsForMatchingFiles(t, resolve, reject) {
    let src = t.src || '**/*';
    if (!this._isString(src)) {
      reject(`translation.src must be a string: ${JSON.stringify(t.src)}`);
      return;
    }
    glob(path.join(this.options.dest, src), {nodir: true}, (err, files) => {
      async.eachLimit(files, 100, (file, cb) => {
        this._processFile(t, file)
        .then(() => cb(), (err) => cb(err));
      }, (err) => err ? reject(err) : resolve());
    });
  }

  _processFile(t, file) {
    return new Promise((resolve, reject) => {
      t.statistics.files++;
      this._processFilePerLine(t, file)
      .then((file) => {
        if (this._hasPerFilePattern(t)) {
          this._processFilePerFile(t, file);
          resolve(file);
        } else {
          resolve(file);
        }
      }, (err) => reject(err));
    });
  }

  _processFilePerLine(t, file) {
    return new Promise((resolve, reject) => {
      let translator = new Translator(t);
      translator.file = file;
      translator.shouldShowUnmatchedLines = this.options.unmatched;
      let out = temp.createWriteStream();
      fs.createReadStream(file)
      .pipe(translator)
      .on('error', reject)
      .pipe(out)
      .on('error', reject)
      .on('close', () => {
        this._postProcessOnClose(translator, out, file);
        if (!t.statistics.hasOwnProperty('unmatched')) {
          t.statistics.unmatched = 0;
        }
        t.statistics.unmatched += translator.numOfUnmatchedLines;
        resolve(file);
      });
    });
  }

  _postProcessOnClose(translator, out, file) {
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
        value = this._appendNewlineWithExpression(value, e);
      }
      let content = fs.readFileSync(file, ENCODING);
      fs.writeFileSync(file, value + content, ENCODING);
    }
    if (translator.hasEndBuffer()) {
      let value = '';
      for (let e of translator.endBuffer) {
        value += e;
        value = this._appendNewlineWithExpression(value, e);
      }
      let content = fs.readFileSync(file, ENCODING);
      content = this._appendNewline(content);
      fs.writeFileSync(file, content + value, ENCODING);
    }
  }

  _processFilePerFile(t, file) {
    for (let p of t.patterns) {
      if (p.pattern || !p.insert || !p.insert.resolved) {
        continue;
      }
      let at = p.insert.at;
      let value = p.insert.resolved;
      value = this._appendNewline(value);
      if (at === INSERT_AT_BEGIN) {
        let content = fs.readFileSync(file, ENCODING);
        fs.writeFileSync(file, value + content, ENCODING);
      } else if (at === INSERT_AT_END) {
        let content = fs.readFileSync(file, ENCODING);
        content = this._appendNewline(content);
        fs.writeFileSync(file, content + value, ENCODING);
      }
    }
  }

  _hasPerFilePattern(t) {
    return !!t.patterns.find(p => p.insert);
  }

  _resolve(obj) {
    if (!obj.replace) {
      return;
    }

    obj.resolved = this._resolveTranslationKey(obj.replace, true);
    if (obj.args) {
      obj.argsResolved = [];
      for (let i = 0; i < obj.args.length; i++) {
        let a = obj.args[i];
        if (a.replace && typeof a.replace !== 'function') {
          this._resolve(a);
          obj.argsResolved.push(a);
        } else if (a) {
          obj.argsResolved.push(this._resolveTranslationKey(a, false));
        }
      }
    }
  }

  _resolveTranslationKey(target, returnOriginalIfTranslationMissing) {
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

  _processTranslations() {
    return this._createParallelGroups().map((parallelGroup) => {
      return (cb) => {
        if (parallelGroup.length < 2) {
          this._processTranslationForGroup(parallelGroup[0], cb);
        } else {
          this._processTranslationForGroupsInParallel(parallelGroup, cb);
        }
      };
    });
  }

  _createParallelGroups() {
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

  _processTranslationForGroup(t, cb) {
    let startTime = process.hrtime();
    this._processTranslation(t)
    .then(() => {
      t.statistics.time = process.hrtime(startTime);
      this._showStatistics(t);
      cb();
    }, (err) => cb(err));
  }

  _processTranslationForGroupsInParallel(parallelGroup, cb) {
    async.parallel(parallelGroup.map((t) => {
      return (cb2) => this._processTranslationForGroup(t, cb2);
    }), (err) => {
      cb(err);
    });
  }

  _appendNewline(value) {
    return this._appendNewlineWithExpression(value, value);
  }

  _appendNewlineWithExpression(value, e) {
    if (!e.endsWith(NEWLINE)) {
      value += NEWLINE;
    }
    return value;
  }

  _showStatistics(t) {
    if (this.options.statistics) {
      let name = t.name || t.src || '';
      if (name !== '') {
        name = ` (${name})`;
      }
      let message = `[${t.id}]${name}: `;
      if (t.shouldEvaluate) {
        message += `processed ${t.statistics.files} files for ${t.statistics.patterns} patterns in ${prettyHrtime(t.statistics.time)}`;
        if (0 < t.statistics.unmatched) {
          message += `, ${t.statistics.unmatched} unmatched lines`;
        }
      } else {
        message += 'skipped';
      }
      console.log(message);
    }
  }
}
