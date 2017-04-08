/* @flow */

'use strict';

export type Statistics = {
  files: any,
  patterns: any,
  time: [number, number],
  unmatched: number,
};

export type Translation = {
  id: number,
  locale: any,
  src: string,
  name: string,
  patterns: any,
  namedPatterns: any,
  conditionals: any,
  resolvedPatterns: any,
  statistics: Statistics,
  add: any,
  shouldEvaluate: boolean,
  evaluateWhen: string,
  parallelGroup: any,
  skipPatterns: any,
};

export type Pattern = {
};
