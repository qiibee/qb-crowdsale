var jsc = require('jsverify');

var help = require('./helpers');

// this is just to have web3 available and correctly initialized
artifacts.require('./QiibeeToken.sol');

const knownAccountGen = jsc.nat(web3.eth.accounts.length - 1);
const zeroAddressAccountGen = jsc.constant('zero');
const accountGen = jsc.oneof([zeroAddressAccountGen, knownAccountGen]);

let cap = jsc.integer(0, 100000),
  max = jsc.integer(0, 100000);

while (cap/max > 10) {
  max = jsc.integer(0, 100000);
}

let crowdsale = {
  rate: jsc.integer(0, 2000),
  cap: cap,
  minInvest: jsc.integer(0, 100000),
  maxCumulativeInvest: max,
  maxGasPrice: jsc.integer(0, 1000000000),
  owner: accountGen,
  foundationWallet: accountGen
};

function getAccount(account) {
  if (account == 'zero') {
    return help.zeroAddress;
  } else {
    return web3.eth.accounts[account];
  }
}

module.exports = {

  accountGen: accountGen,

  getAccount: getAccount,

  crowdsaleGen: jsc.record(crowdsale),

  waitTimeCommandGen: jsc.record({
    type: jsc.constant('waitTime'),
    seconds: jsc.nat
  }),

  buyTokensCommandGen: jsc.record({
    type: jsc.constant('buyTokens'),
    account: accountGen,
    eth: jsc.nat(0, 200)
  }),

  setWalletCommandGen: jsc.record({
    type: jsc.constant('setWallet'),
    newAccount: accountGen,
    fromAccount: knownAccountGen
  }),

  setTokenCommandGen: jsc.record({
    type: jsc.constant('setToken'),
    newToken: accountGen,
    fromAccount: knownAccountGen
  }),

  claimVaultFundsCommandGen: jsc.record({
    type: jsc.constant('claimVaultFunds'),
    fromAccount: knownAccountGen
  }),

  refundAllCommandGen: jsc.record({
    type: jsc.constant('refundAll'),
    fromAccount: knownAccountGen,
    indexes: jsc.array(jsc.nat)
  }),

  validatePurchaseCommandGen: jsc.record({
    type: jsc.constant('validatePurchase'),
    account: accountGen,
    beneficiary: accountGen,
  }),

  rejectPurchaseCommandGen: jsc.record({
    type: jsc.constant('rejectPurchase'),
    account: accountGen,
    beneficiary: accountGen,
  }),

  burnTokensCommandGen: jsc.record({
    type: jsc.constant('burnTokens'),
    account: accountGen,
    tokens: jsc.integer(0, 1000000000)
  }),

  pauseCrowdsaleCommandGen: jsc.record({
    type: jsc.constant('pauseCrowdsale'),
    pause: jsc.bool,
    fromAccount: accountGen
  }),

  pauseTokenCommandGen: jsc.record({
    type: jsc.constant('pauseToken'),
    pause: jsc.bool,
    fromAccount: accountGen
  }),

  finalizeCrowdsaleCommandGen: jsc.record({
    type: jsc.constant('finalizeCrowdsale'),
    fromAccount: accountGen,
    skipRefunds: jsc.bool,
  }),

  fundCrowdsaleToCapCommandGen: jsc.record({
    type: jsc.constant('fundCrowdsaleToCap'),
    account: knownAccountGen, // we don't want this one to fail with 0x0 addresses
    finalize: jsc.bool
  }),

};

