'use strict';

const camelCase = require('camelcase');

export default class Camelizer {
  camelize(obj) {
    if (!this.acceptable(obj)) {
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
  acceptable(obj) {
    if (obj === undefined || obj === null) {
      return false;
    }
    let clas = Object.prototype.toString.call(obj).slice(8, -1);
    return clas === 'Object' || clas === 'Array';
  }
}
