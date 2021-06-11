# SQWorkflowEngine

## Documentation

_TBD_

## Contributing

When you make changes to this repo, you must adhere to the [Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/#summary) standard.

If you are unfamiliar with writing [Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/#summary) style messages, you can use the [commitizen](https://commitizen.github.io/cz-cli/) to guide you through creating the commit message

```sh
git add .
npm run commit
```

The commit will be validated through a linter pre-commit hook and will reject any commit messages that do not properly adhere to the convention.

TBD _~~[Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/#summary) formatted messages are required for proper versioning and automatic generation of release notes / CHANGELOG. Currently, only `feat` and `fix` will bump the version.~~_

Your first commit should use the type relevant to what you're working on, e.g., `feat` or `fix`, then if you receive feedback in a PR requiring another commit, choose `chore`; this will prevent those extra commits cluttering the changelog.

For **BREAKING CHANGES** Type a brief description of the breaking change when asked if there is a breaking change. Otherwise, press the `ENTER` key to skip over the breaking change optional question.

-   A breaking change will cause a `MAJOR` SemVer bump. Ex: 3.0.5 -> 4.0.0

## Consuming

-   `> npm install @selectquotelabs/sqworkflowengine`

### Initial Setup

_Coming Soon..._

## Development

To get started first install the projects dependencies

```sh
$ npm install
```

It's recommended to use the Node version specified in the `.nvmrc` file. If you have [nvm](https://github.com/nvm-sh/nvm#about) installed execute the following terminal command:

```sh
$ nvm use
```

> Note: If you run `nvm use` and don't have that version of Node installed, `nvm` will tell you how to install it

## Versioning

TBD _~~We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://bitbucket.org/SelectQuote/scplus-shared-components/src/master/).~~_
