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

Please check the [Configuration details](#configuration-details) section for further details.

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

* [Basic](#basic)
* [Arguments](#arguments)
* [Sequence](#sequence)
* [Code insertion](#code-insertion)
* [Conditional insertion for all matching files](#conditional-insertion-for-all-matching-files)
* [Named patterns](#named-patterns)

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
For example, `src/a.coffee` and `src/b/c.coffee` will match this pattern,
but `src/d.js` will not match.

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

### Arguments

`replace` elements can have arguments.
If you want to aggregate similar patterns, consider using arguments.

For example, you can configure translations for `Edit issue` and `Edit project` like this:

```yaml
# i18n.yml
translations:
- src: '**/*'
  patterns:
  - pattern: 'Edit issue'
    replace: '${editIssue}'
  - pattern: 'Edit project'
    replace: '${editProject}'

# ja.yml
editIssue: 課題を編集
editProject: プロジェクトを編集
```

But you can also write them using arguments:

```yaml
# i18n.yml
translations:
- src: '**/*'
  patterns:
  - pattern: 'Edit issue'
    replace: '${editSomething}'
    args:
    - 'issue'
  - pattern: 'Edit project'
    replace: '${editSomething}'
    args:
    - 'project'
  - pattern: 'issue'
    replace: '${issue}'
  - pattern: 'project'
    replace: '${project}'

# en.yml
editSomething: {0}を編集
issue: 課題
project: プロジェクト
```

This will be processed like this:

1. When the expression `Edit issue` is found,
   it's replaced into `${editSomething}`.
1. `${NAME}` in the `replace` value is treated as a variable,
   and in this case, `editSomething` is resolved to
   `{0}を編集` using `ja.yml`.
1. `{N}` in the translation key is an argument
   and the values of `args` are passed to it.
1. As a result, `{0}を編集` will be converted to `issueを編集`.
1. Then the third pattern is applied; `issue` is translated to `課題` and the result will be `課題を編集`.

This is useful to write less translations and standardize the expressions.

### Exclusion

If you want to exclude some patterns, even when the line matches to a pattern, you can use `exclude` to skip it.

```yaml
# i18n.yml
translations:
- src: '**/*'
  patterns:
  - pattern: ' user$'
    replace: ' ${user}'
    exclude: '- if'
  - pattern: !!js/regexp /Edit (.*)/
    replace: '${editSomething}'
    args:
    - '$1'

# ja.yml
user: ユーザ
editSomething: '{0}を編集'
```

If the above configuration is given, then

```haml
- if user
    Edit user
```

will be translated into:

```haml
- if user
    ユーザを編集
```

### Sequence

Patterns are processed sequentially, so if you want to apply multiple translations to one line, please check the orders of the patterns are correct.

For example, if you want to translate `Edit issue` into `課題を編集` (Japanese), the following configurations won't work as expected.

```yaml
# i18n.yml
translations:
- src: '**/*'
  patterns:
  - pattern: 'issue'
    replace: '${issue}'
  - pattern: 'Edit issue'
    replace: '${editSomething}'
    args:
    - 'issue'

# ja.yml
editSomething: '{0}を編集'
issue: 課題
```

Because `Edit issue` is translated to `Edit 課題` by the first pattern, it won't match to the second expression.

To fix this problem, you could write like this:

```yaml
# i18n.yml
translations:
- src: '**/*'
  patterns:
  - pattern: 'Edit issue'
    replace: '${editSomething}'
    args:
    - 'issue'
  - pattern: 'issue'
    replace: '${issue}'

# ja.yml
editSomething: '{0}を編集'
issue: 課題
```

> Note: to tell you the truth, you can also solve this problem by using regular expressions (`!!js/regexp`):
> 
> ```yaml
> # i18n.yml
> translations:
> - src: '**/*'
>   patterns:
>   - pattern: 'issue'
>     replace: '${issue}'
>   - pattern: !!js/regexp /Edit (.*)/
>     replace: '${editSomething}'
>     args:
>     - '$1'
>
> # ja.yml
> editSomething: '{0}を編集'
> issue: 課題
> ```

### Code insertion

If you want to insert some code snippet into some files,
you can use `insert`.

For example, with the following config files

```yaml
# i18n.yml
- src: 'foo.js'
  patterns:
  - insert:
      at: end
      value: bar

# ja.yml
bar: |
     // baz
     // qux
```

the next source file will be like this:

```javascript
console.log('Hello, world');
```

```javascript
console.log('Hello, world');
// baz
// qux
```

If you want to insert code at the beginning of the file,
you should change the value of `insert.at` from `end` to `begin`.

As you can see, `insert.value` is treated as a translation key,
so you must define the value of `insert.value`
to your `<locale>.yml`.

### Conditional insertion for all matching files

If you want to insert some code snippet into some files
**only when they match some of the patterns**,
then you can use `conditionals` and `insert`.

```yaml
# i18n.yml
- src: '**/*.rb'
  conditionals:
  - insert:
      at: begin
      value: foo
  patterns:
  - pattern: bar
    replace: baz

# ja.yml
foo: '// This file is edited by i18n-patch'
baz: qux
```

In `i18n.yml`, you define what you want to insert when the files match some of the patterns.

`conditionals` is an array, and can have children that have `insert` element.

`insert` should have `at` and `value` children.
If you'd like to insert codes at the beginning of the file, set `begin` to `insert.at`, and set `end` if you want to insert them at the end of the file.

Suppose you have files like below,

a.js:

```javascript
console.log('bar');
```

b.js:

```javascript
console.log('hello');
```

then `a.js` matches `bar`, and `foo` will be inserted at the beginning of the file, and won't be inserted to `b.js`.

```javascript
// This file is edited by i18n-patch
console.log('qux');
```

### Named patterns

Even if you use arguments and regular expressions,  
there would be still many duplicate configurations.  
With named patterns, you can aggregate these configurations.

Let's see a more complex example.

```yaml
# i18n.yml
translations:
- src: '**/*'
  patterns:
  - pattern: "notice: 'Project was successfully created.'"
    replace: "notice: '${projectWasSuccessfullyCreated}'"
  - pattern: "notice: 'Project was successfully updated.'"
    replace: "notice: '${projectWasSuccessfullyUpdated}'"
  - pattern: "notice: 'Project was successfully deleted.'"
    replace: "notice: '${projectWasSuccessfullyDeleted}'"
  - pattern: "notice: 'Group was successfully created.'"
    replace: "notice: '${groupWasSuccessfullyCreated}'"
  - pattern: "notice: 'Group was successfully updated.'"
    replace: "notice: '${groupWasSuccessfullyUpdated}'"
  - pattern: "notice: 'Group was successfully deleted.'"
    replace: "notice: '${groupWasSuccessfullyDeleted}'"

# ja.yml
projectWasSuccessfullyCreated: 'プロジェクトが作成されました'
projectWasSuccessfullyUpdated: 'プロジェクトが更新されました'
projectWasSuccessfullyDeleted: 'プロジェクトが削除されました'
groupWasSuccessfullyCreated: 'グループが作成されました'
groupWasSuccessfullyUpdated: 'グループが更新されました'
groupWasSuccessfullyDeleted: 'グループが削除されました'
```

The above configurations have similar translations, so you could rewrite them using arguments like this:

```yaml
# i18n.yml
translations:
- src: '**/*'
  patterns:
  - pattern: "notice: 'Project was successfully created.'"
    replace: "notice: '${somethingWasSuccessfullyDone}'"
    args:
    - '${project}'
    - '${create}'
  - pattern: "notice: 'Project was successfully updated.'"
    replace: "notice: '${somethingWasSuccessfullyDone}'"
    args:
    - '${project}'
    - '${update}'
  - pattern: "notice: 'Project was successfully deleted.'"
    replace: "notice: '${somethingWasSuccessfullyDone}'"
    args:
    - '${project}'
    - '${delete}'
  - pattern: "notice: 'Group was successfully created.'"
    replace: "notice: '${somethingWasSuccessfullyDone}'"
    args:
    - '${group}'
    - '${create}'
  - pattern: "notice: 'Group was successfully updated.'"
    replace: "notice: '${somethingWasSuccessfullyDone}'"
    args:
    - '${group}'
    - '${update}'
  - pattern: "notice: 'Group was successfully deleted.'"
    replace: "notice: '${somethingWasSuccessfullyDone}'"
    args:
    - '${group}'
    - '${delete}'

# ja.yml
somethingWasSuccessfullyDone: '{0}が{1}されました'
project: プロジェクト
group: グループ
create: 作成
update: 更新
delete: 削除
```

`ja.yml` is much improved - it doesn't contain any duplicate translations.  
But as you can see, `i18n.yml` is much longer than before.

You can use `named-patterns` to improve this.

The `named-patterns` pre-define `pattern`, `replace` and `args`
like "function" and you can call it with `name` with `params`:

```yaml
# i18n.yml
translations:
- src: '**/*'
  named-patterns:
  - name: somethingWasSuccessfullyDone
    pattern: "notice: '{obj} was successfully {done}\\.'"
    replace: "notice: '${sthWasSuccessfullyDone}'"
    args:
    - '${{objKey}}'
    - '${{doneKey}}'
    params: ['obj', 'objKey', 'done', 'doneKey']
```

> Note: `pattern` in `named-patterns` are treated as regular expressions even if you don't write `!!js/regexp`.

The above configuration defines a pattern named `somethingWasSuccessfullyDone`.  
`{obj}`, `{done}`, `{objKey}` and `{doneKey}` are parameters,
and you can replace it to create a new concrete pattern.

In `patterns` section, you can write `name` to use this pattern instead of writing complex `pattern`, `replace` and `args`.  
You must also set `{obj}`, `{done}`, `{objKey}` and `{doneKey}` with `params` element.

```yaml
  patterns:
  - name: somethingWasSuccessfullyDone
    params:
    - {obj: Project, objKey: project, done: created, doneKey: create}
    - {obj: Project, objKey: project, done: updated, doneKey: update}
    - {obj: Project, objKey: project, done: deleted, doneKey: delete}
    - {obj: Project, objKey: project, done: created, doneKey: create}
    - {obj: Project, objKey: project, done: created, doneKey: create}
```

In the example above, this

```yaml
  patterns:
  - name: somethingWasSuccessfullyDone
    params:
    - {obj: Project, objKey: project, done: created, doneKey: create}
```

is equivalent to this:

```yaml
  patterns:
  - pattern: "notice: 'Project was successfully created.'"
    replace: "notice: '${somethingWasSuccessfullyDone}'"
    args:
    - '${project}'
    - '${create}'
```

### Multiline

If you want to use patterns that match two or more lines and change the order of the lines:

```haml
  %span.light History for
  = link_to foobar
```

```haml
  = link_to foobar
  %span.light <translation of history for>
```

then you can write like this:

```yaml
translations:
- src: 'test.js'
  patterns:
  - pattern: !!js/regexp /^(.*)History for\n([^\n]*)$/m
    replace: '${historyFor}'
```

```yaml
historyFor: "$2\n$1の更新履歴"
```

When `test.js` is like this,

```haml
  %span.light History for
  = link_to foobar
```

then the result will be:

```haml
  = link_to foobar
  %span.light の更新履歴
```

You must use `!!js/regexp` to pattern.  
To match a line, you must use `([^\n]*)`, otherwise the tool cannot calculate the required lines.

## License

MIT
