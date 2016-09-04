'use strict';

const camelCase = require('camelcase');

export default class Camelizer {
  camelize(obj) {
    if (!obj) {
      return;
    }
    if (typeof obj === 'object') {
      this._camelizeObject(obj);
    } else if (obj instanceof Array) {
      for (let elem of obj) {
        this._camelizeObject(elem);
      }
    }
  }

  _camelizeObject(obj) {
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
}
