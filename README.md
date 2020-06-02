# serverless-alb-patch [![npm version](https://img.shields.io/npm/v/serverless-alb-patch.svg)](https://www.npmjs.com/package/serverless-alb-patch)
This package fixes the bug in serverless where multiple alb events dont attach onto the lambda function

## Getting Started
Just add the package to the top of the plugins list

serverless.yml
```yaml
plugins:
  - serverless-alb-patch
```