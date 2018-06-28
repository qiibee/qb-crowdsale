![](https://avatars3.githubusercontent.com/u/31820267?v=4&s=100)

QBX Crowdsale
=======================

[![Build Status](https://travis-ci.org/qiibee/qb-contracts.svg?branch=master)](https://travis-ci.org/qiibee/qb-crowdsale)
[![Coverage Status](https://coveralls.io/repos/github/qiibee/qb-contracts/badge.svg?branch=master)](https://coveralls.io/github/qiibee/qb-contracts?branch=master)

## Requirements

Node v8 or higher

## Install

```sh
npm install
```

## Main Contracts

- [QiibeeCrowdsale](contracts/QiibeeCrowdsale.sol)
- [Vault](contracts/Vault.sol)

## Test

* To run all tests: `npm test`

* To enable verbose mode: `npm test --v` OR `npm test --verbose`

* To run a specific test: `npm test -- test/QiibeeCrowdsale.js`

There are also two environment variables (`GEN_TESTS_QTY` and `GEN_TESTS_TIMEOUT`) that regulate the duration/depth of the property-based tests, so for example:

```sh
GEN_TESTS_QTY=50 GEN_TESTS_TIMEOUT=300 npm test
```

will make the property-based tests in `test/QiibeeCrowdsaleGenTest.js` to run 50 examples in a maximum of 5 minutes


## Coverage
Coverage has been disable because of conflicts with the different solidity versions of the contracts.

## Deploy to Ropsten
* Deploy [qb-token](https://github.com/qiibee/qb-token/) contract and get the address
* Set environment variables:
    * `ROPSTEN_PRIVATE_KEY` - private key of account you want to use to deploy with (omit `0x`)
    * `INFURA_API_TOKEN` - your Infura API token
* Update values in `migrations/2_crowdsale_migration.js` 
    * update token address with the address of the deployed `QiibeeToken` (in step 1)
    * update `_openingTime`
    * update `_closingTime`

## License

qiibee Token is open source and distributed under the Apache License v2.0
