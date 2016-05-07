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
  }

  _transform(chunk, encoding, done) {
    var data = chunk.toString();
    if (this.lastLineData) {
      data = this.lastLineData + data;
    }

    var lines = data.split(NEWLINE);
    this.lastLineData = lines.splice(lines.length - 1, 1)[0];
    lines.forEach(function(line) {
      this.buffer.push(line);
    }.bind(this));
    this.process();
    done();
  }

  _flush(done) {
    if (this.lastLineData) {
      this.buffer.push(this.lastLineData);
    }
    this.inputEnd = true;
    this.process();
    this.lastLineData = null;
    this.buffer = null;
    done();
  }

  process() {
    while (this.buffer.length) {
      if (!this.processLine(this.t, this.buffer.shift())) {
        // Need to wait next data
        break;
      }
    }
  }

  processLine(t, line) {
    let result = line;
    // If pendingPatterns are not empty,
    // it means that the first pattern need more lines.
    if (0 === this.pendingPatterns.length) {
      if (t.skipPatterns) {
        // This line should be skipped:
        // no need to check if it matches t.patterns.
        for (let skipPattern of t.skipPatterns) {
          if (result.match(skipPattern)) {
            this.push(result + NEWLINE);
            return true;
          }
        }
      }
      t.patterns.forEach((p) => {
        this.pendingPatterns.push(p);
      });
    }
    while (this.pendingPatterns.length) {
      let p = this.pendingPatterns.shift();
      if (!p.resolved) {
        continue;
      }
      let before = result;
      let beforeMultiline = before;
      let patternSource = p.pattern instanceof RegExp ? p.pattern.source : p.pattern;
      let patternLines = patternSource
        // Usually the pattern includes ([^\n]*) to express a line
        // in multiline expression, so this should be removed
        // to know how many lines this pattern requires.
        .replace('[^\\n]', '')
        .split('\\n').length;
      let consumedBuffers = 0;
      if (1 < patternLines) {
        let currentLines = result.split(NEWLINE).length;
        if (patternLines - currentLines <= this.buffer.length) {
          for (let i = 0; i < patternLines - currentLines; i++) {
            result += NEWLINE + this.buffer[i];
            beforeMultiline = result;
            consumedBuffers++;
          }
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
          return false;
        }
      }
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
      if (beforeMultiline === result) {
        // result might include the next lines to look-ahead,
        // but the next pattern should process the first line of the result.
        // So result should be reverted to the value
        // of the beginning of the current loop.
        result = before;
        continue;
      }
      // We should consume looked-ahead buffers only when they match the pattern.
      if (0 < consumedBuffers) {
        for (let i = consumedBuffers; 0 < i; i--) {
          this.buffer.shift();
        }
      }
      this.matched = true;
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
    // TODO Preserve original newline if possible
    this.push(result + NEWLINE);
    return true;
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
}
