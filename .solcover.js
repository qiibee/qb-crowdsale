module.exports = {
  port: 8555,
  norpc: true,
  // testCommand: 'GEN_TESTS_TIMEOUT=400 GEN_TESTS_QTY=40 truffle test --network coverage test/QiibeeCrowdsale.js test/QiibeePresale.js test/QiibeeToken.js test/WhitelistedCrowdsale.js test/QiibeePresaleGenTest.js test/QiibeeCrowdsaleGenTest.js',
  testCommand: '../node_modules/.bin/truffle test --network coverage test/QiibeeCrowdsale.js',
  // compileCommand: '../node_modules/.bin/truffle compile',
  // copyNodeModules: true,
  skipFiles: ['test-helpers/Migrations.sol'],
  copyPackages: ['openzeppelin-solidity', 'qb-token'],
}
