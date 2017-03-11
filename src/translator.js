'use strict';

import 'babel-polyfill';
import { Transform } from 'stream';

const NEWLINE = '\n';
const INSERT_AT_BEGIN = 'begin';
const INSERT_AT_END = 'end';

export default class Translator extends Transform {
  constructor(translation) {
    super({ objectMode: true });
    this.t = translation;
    this.matched = false;
    this.buffer = [];
    this.beginBuffer = [];
    this.endBuffer = [];
    this.pendingPatterns = [];
    this.inputEnd = false;
    this.file = undefined;
    this.shouldShowUnmatchedLines = false;
    this.numOfProcessedLines = 0;
    this.numOfUnmatchedLines = 0;

    for (let p of this.t.resolvedPatterns) {
      if (p.hasOwnProperty('resolved') && p.resolved) {
        p.resolvedExpression = p.flags ? new RegExp(p.pattern, p.flags) : p.pattern;
      }
    }
  }

  hasBeginBuffer() {
    return 1 <= this.beginBuffer.length;
  }

  hasEndBuffer() {
    return 1 <= this.endBuffer.length;
  }

  _transform(chunk, encoding, done) {
    let data = chunk.toString();
    if (this.lastLineData) {
      data = this.lastLineData + data;
    }

    let lines = data.split(NEWLINE);
    this.lastLineData = lines.splice(lines.length - 1, 1)[0];
    Array.prototype.push.apply(this.buffer, lines);
    this._process();
    done();
  }

  _flush(done) {
    for (let p of this.t.resolvedPatterns) {
      this._insertExpressionAtBeginOrEnd(p);
    }
    if (this.matched && this.t.conditionals) {
      for (let c of this.t.conditionals) {
        this._insertExpressionAtBeginOrEnd(c);
      }
    }
    if (this.lastLineData) {
      this.buffer.push(this.lastLineData);
    }
    this.inputEnd = true;
    this._process();
    this.lastLineData = null;
    this.buffer = null;
    done();
  }

  _process() {
    while (this.buffer.length) {
      if (!this._processLine(this.t, this.buffer.shift())) {
        // Need to wait next data
        break;
      }
    }
  }

  _processLine(t, line) {
    this.numOfProcessedLines++;
    if (this._shouldSkipLine(t, line)) {
      return true;
    }
    Array.prototype.push.apply(this.pendingPatterns, t.resolvedPatterns);
    let result = this._consumePendingPatterns(line);
    if (result === null) {
      return false;
    }
    this._pushLines(result);
    return true;
  }

  _consumePendingPatterns(line) {
    let result = line;
    while (this.pendingPatterns.length) {
      let p = this.pendingPatterns.shift();
      if (p.matchOnce && p.matched) {
        continue;
      }
      let before = result;
      let beforeMultiline = before;
      let patternLines = this._getNumOfLinesInPattern(p.pattern);
      let consumedBuffers = 0;
      if (1 < patternLines) {
        let requiredLines = patternLines - result.split(NEWLINE).length;
        if (requiredLines <= this.buffer.length) {
          let i;
          for (i = 0; i < requiredLines; i++) {
            result += NEWLINE + this.buffer[i];
          }
          beforeMultiline = result;
          consumedBuffers = i;
        } else if (this.inputEnd) {
          // We should give up this pattern to be matched
          // because there's no more data to read.
          continue;
        } else {
          // If the input is not ended,
          // put the current pattern and result back to the buffer
          // and wait next data to be arrived.
          this.pendingPatterns.unshift(p);
          this.buffer.unshift(result);
          return null;
        }
      }
      result = this._applyToResolved(result, p, p.resolvedExpression, p.exclude);
      if (beforeMultiline === result) {
        // result might include the next lines to look-ahead,
        // but the next pattern should process the first line of the result.
        // So result should be reverted to the value
        // of the beginning of the current loop.
        result = before;
        continue;
      }
      this._consumeLookedAheadBuffers(consumedBuffers);
      this.matched = true;
      if (p.matchOnce) {
        // Mark as matched to skip this pattern next time
        p.matched = true;
      }
      if (p.completePattern) {
        this.pendingPatterns = [];
        break;
      }
    }
    if (this.file && result === line) {
      this.numOfUnmatchedLines++;
      if (this.shouldShowUnmatchedLines) {
        console.warn(`${this.file}:${this.numOfProcessedLines}:${line}`);
      }
    }
    return result;
  }

  _pushLines(result) {
    // TODO Preserve original newline if possible
    this.push(result + NEWLINE);
  }

  _shouldSkipLine(t, result) {
    // If pendingPatterns are not empty,
    // it means that the first pattern need more lines.
    if (0 !== this.pendingPatterns.length) {
      return false;
    }
    if (t.skipPatterns) {
      for (let skipPattern of t.skipPatterns) {
        if (result.match(skipPattern)) {
          // This line should be skipped:
          // no need to check if it matches t.patterns.
          this._pushLines(result);
          return true;
        }
      }
    }
    return false;
  }

  _getNumOfLinesInPattern(pattern) {
    if (pattern instanceof RegExp) {
      // Usually the pattern includes ([^\n]*) to express a line
      // in multiline expression, so this should be removed
      // to know how many lines this pattern requires.
      return pattern.source.replace('[^\\n]', '').split('\\n').length;
    } else {
      return 1;
    }
  }

  _insertExpressionAtBeginOrEnd(c) {
    if (!c.hasOwnProperty('insert') || !c.insert || !c.insert.hasOwnProperty('resolved') || !c.insert.resolved) {
      return;
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

  _consumeLookedAheadBuffers(consumedBuffers) {
    // We should consume looked-ahead buffers only when they match the pattern.
    if (0 < consumedBuffers) {
      for (let i = consumedBuffers; 0 < i; i--) {
        this.buffer.shift();
      }
    }
  }

  _applyToResolved(target, obj, exp, exclude) {
    // Quit resolving and replacing if it doesn't match pattern
    if (exp instanceof RegExp) {
      if (!exp.test(target)) {
        return target;
      }
    } else {
      if (target.indexOf(exp) < 0) {
        return target;
      }
    }

    if (exclude && target.match(exclude)) {
      return target;
    }

    let resolved = obj.resolved;
    if (obj.hasOwnProperty('args')) {
      for (let i = 0; i < obj.args.length; i++) {
        let argResolved = obj.argsResolved[i];
        if (argResolved) {
          if (argResolved.replace && typeof argResolved.replace !== 'function') {
            if (argResolved.resolved) {
              resolved = this._applyToArgResolved(resolved, argResolved, `{${i}}`);
            } else {
              resolved = resolved.replace(new RegExp(`\\{${i}\\}`, 'g'), argResolved.replace);
            }
          } else {
            resolved = resolved.replace(new RegExp(`\\{${i}\\}`, 'g'), argResolved);
          }
        } else {
          resolved = resolved.replace(new RegExp(`\\{${i}\\}`, 'g'), obj.args[i]);
        }
      }
    }
    return target.replace(exp, resolved);
  }

  _applyToArgResolved(target, obj, pattern) {
    if (obj.hasOwnProperty('args')) {
      for (let i = 0; i < obj.args.length; i++) {
        let argResolved = obj.argsResolved[i];
        if (argResolved) {
          obj.resolved = this._applyToArgResolved(obj.resolved, argResolved, `{${i}}`);
        } else {
          obj.resolved = obj.resolved.replace(`{${i}}`, obj.args[i]);
        }
      }
    }
    return target.replace(pattern, obj.resolved);
  }
}
