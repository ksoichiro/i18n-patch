# i18n-replace

> Replacing codes for i18n with patterns.

[![Travis master](https://img.shields.io/travis/ksoichiro/i18n-patch/master.svg?style=flat-square)](https://travis-ci.org/ksoichiro/i18n-patch)

## Install

```console
$ npm install -g i18n-replace
```

## Usage

```
  Usage
    $ i18n-patch <locale>

  Options
    --config  Base path for config files.
              i18n.json and <locale>.json is required.
    --src     Base path for source files.
              Current directory by default.
    --out     Base path for output files.
              'out' by default.

  Examples
    $ i18n-patch --config config --src src --out dist ja
```

## Example

```console
$ cd example
$ cat i18n.json
{
  "translations": [
    {
      "src": "**/*.js",
      "patterns": [
        {
          "pattern": "preview.text(\"Nothing to preview.\");",
          "replace": "preview.text(\"${nothingToPreview}\");"
        },
        {
          "pattern": "preview.text(\"Loading...\");",
          "replace": "preview.text(\"${loading}\");"
        }
      ]
    }
  ]
}

$ cat ja.json
{
  "nothingToPreview": "プレビューする内容がありません",
  "loading": "読み込み中..."
}

$ cat src/js/sample.js
preview.text("Nothing to preview.");
preview.text("Loading...");

$ i18n-patch ja

$ cat out/js/sample.js
preview.text("プレビューする内容がありません");
preview.text("読み込み中...");
```

If you want to try, clone this repository and execute:

```console
$ npm run build
$ node lib/cli.js --config example --src example/src --out example/out ja
```

Then you can confirm the result in `example/out` directory.

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
