#!/bin/bash

set -e

if [ "$SOLIDITY_COVERAGE" = true ]; then
  npm run test && ./node_modules/coveralls/bin/coveralls.js
  # npm run test && cat coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js
else
  npm run test test/QiibeeCrowdsale.js test/QiibeeCrowdsaleGenTest.js
fi
