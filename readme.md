# i18n-patch

> Replacing codes for i18n with patterns.

[![Travis master](https://img.shields.io/travis/ksoichiro/i18n-patch/master.svg?style=flat-square)](https://travis-ci.org/ksoichiro/i18n-patch)
[![Coveralls master](https://img.shields.io/coveralls/ksoichiro/i18n-patch/master.svg?style=flat-square&maxAge=2592000)](https://coveralls.io/github/ksoichiro/i18n-patch)
[![npm](https://img.shields.io/npm/v/i18n-patch.svg?style=flat-square)](https://www.npmjs.com/package/i18n-patch)
![npm](https://img.shields.io/npm/l/i18n-patch.svg?style=flat-square)

## Install

```console
$ npm install -g i18n-patch
```

## Usage

```
  Usage
    $ i18n-patch <locale> <src> [<dest>]

  Options
    --config  Base path for config files.
              i18n.yml and <locale>.yml is required.
              json is also available instead of yaml.
              'config' by default.

  Examples
    $ i18n-patch --config example/config ja example/src example/out
```

## Example

example/i18n.yml:

```yaml
translations:
- src: '**/*.js'
  patterns:
  - pattern: preview.text("Nothing to preview.");
    replace: preview.text("${nothingToPreview}");
  - pattern: preview.text("Loading...");
    replace: preview.text("${loading}");
```

example/ja.yml:

```yaml
nothingToPreview: プレビューする内容がありません
loading: 読み込み中...
```

example/src/js/sample.js:

```javascript
preview.text("Nothing to preview.");
preview.text("Loading...");
console.log('other codes should be untouched.');
```

After executing `i18n-patch ja src out` in `example` dir...

example/out/js/sample.js:

```javascript
preview.text("プレビューする内容がありません");
preview.text("読み込み中...");
console.log('other codes should be untouched.');
```

If you want to try it by yourself, clone this repository and execute:

```console
$ npm run build
$ npm start
```

Then you can confirm the result in `example/out` directory.

## Configuration

This project is still frequently updated, so please refer the source code or ask me as an [issue](https://github.com/ksoichiro/i18n-patch/issues) if you need.

## Why?

The main purpose of this project is to provide an external i18n system for any existent source codes.

I'm maintaining [gitlab-i18n-patch](https://github.com/ksoichiro/gitlab-i18n-patch) project
to provide unofficial Japanese translation patch to GitLab.

In that project, when a new version of GitLab is released,
I'm trying to merge big branch(tag) to translated branch.

This method has many problems:

- Merge operation causes many many conflict files, which are hard to resolve.
- When merging, some translations are lost
  because some part of codes are moved into other files.
  It's so hard to keep tracing these design changes.
- It's very difficult to provide patches for other languages.
- It's very difficult to get someone's contribution.
- This method depends on `patch`, so one patch cannot be applied to any other versions.

Therefore, I thought it's better to create a new external translation system
for providing i18n patch GitLab project without Git branch management.

## License

MIT
