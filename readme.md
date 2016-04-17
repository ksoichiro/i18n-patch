# i18n-patch

> Replacing codes for i18n with patterns.

[![Travis master](https://img.shields.io/travis/ksoichiro/i18n-patch/master.svg?style=flat-square)](https://travis-ci.org/ksoichiro/i18n-patch)
[![Coveralls master](https://img.shields.io/coveralls/ksoichiro/i18n-patch/master.svg?style=flat-square&maxAge=2592000)](https://coveralls.io/github/ksoichiro/i18n-patch)
[![npm](https://img.shields.io/npm/v/i18n-patch.svg?style=flat-square)](https://www.npmjs.com/package/i18n-patch)
![npm](https://img.shields.io/npm/l/i18n-patch.svg?style=flat-square)

i18n-patch is a tool to translate source code into your language(locale) for any software that does not provide i18n mechanisms.

This tool enables you to follow the upgrades of the target software:
you write translation points using regular expressions, write translations for each points,
and execute this tool.
This method is better than modifying target source code directly.

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

You need 2 configuration files: `i18n.yml` and `<locale>.yml` like `ja.yml` for Japanese.

`i18n.yml` contains translation points that defines "what should be translated".

The tool reads the target source code and when the patterns in `i18n.yml` are found,
it will convert "keys" in translation points and replace them to translations that are provied by `<locale>.yml`.

Let's see a simple example below.

The following `example/i18n.yml` defines target source files and patterns to be translated.

```yaml
translations:
- src: '**/*.js'
  patterns:
  - pattern: preview.text("Nothing to preview.");
    replace: preview.text("${nothingToPreview}");
  - pattern: preview.text("Loading...");
    replace: preview.text("${loading}");
```

`example/ja.yml` provides translations for Japanese.  
You can see the keys (nothingToPreview, loading) in this file
are used in `i18n.yml`.

```yaml
nothingToPreview: プレビューする内容がありません
loading: 読み込み中...
```

And the target file `example/src/js/sample.js` is like this:

```javascript
preview.text("Nothing to preview.");
preview.text("Loading...");
console.log('other codes should be untouched.');
```

Then, by executing `i18n-patch ja src out` in `example` directory,  
`example/out/js/sample.js` will be generated:

```javascript
preview.text("プレビューする内容がありません");
preview.text("読み込み中...");
console.log('other codes should be untouched.');
```

This is a very simple example, but this tool can handle more complex expressions.  

Please check "Configuration details" section for further details.

If you want to try it by yourself, clone this repository and execute:

```console
$ npm run build
$ npm start
```

Then you can confirm the result in `example/out` directory.

## Why?

The main purpose of this project is to provide an external i18n system for any existent source code.

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

## Configuration details

### Basic

The main configuration file is `i18n.yml` and looks like this:

```yaml
translations:
- src: '**/*.coffee'
  patterns:
  - pattern: preview.text "Nothing to preview."
    replace: preview.text "${nothingToPreview}"
```

`translations.src` will be expanded using node-glob.

`translations.patterns` is an array that includes elements which define target pattern and replacement for it.
Each element of `patterns` that have `pattern` and `replace` will be used to replace source code.

`pattern` is usually just a string value, but you can use regular expressions by js-yaml feature: `!!js/regexp /foo/`.

`replace` defines the replacement for the `pattern`, and this can contain variable expression like `${nothingToPreview}`.

Your locale file (like `ja.yml`) should map this key to a translation.

```yaml
nothingToPreview: プレビューする内容がありません
```

With these configurations, the following code named `test.coffee`

```coffee
preview.text "Nothing to preview."
```

will be converted to this:

```coffee
preview.text "プレビューする内容がありません"
```

The following `test.js` will not be changed because it does not match to `translation.src`.

```javascript
// preview.text "Nothing to preview."
```

### Sequence

### Arguments for replace

### Code insertion

### Conditional insertion for all files

### Named patterns

## License

MIT
