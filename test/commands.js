let Vault = artifacts.require('./Vault.sol');
let BigNumber = web3.BigNumber;

require('chai').use(require('chai-bignumber')(BigNumber)).should();

let _ = require('lodash');
let jsc = require('jsverify');
let help = require('./helpers');
let gen = require('./generators');
let latestTime = require('./helpers/latestTime');
let {increaseTimeTestRPC, increaseTimeTestRPCTo, duration} = require('./helpers/increaseTime');
let colors = require('colors');

const isZeroAddress = (addr) => addr === help.zeroAddress;

let isCouldntUnlockAccount = (e) => e.message.search('could not unlock signer account') >= 0;

function assertExpectedException(e, shouldThrow, addressZero, state, command) {
  let isKnownException = help.isInvalidOpcodeEx(e) ||
    (isCouldntUnlockAccount(e) && addressZero);
  if (!shouldThrow || !isKnownException) {
    throw(new ExceptionRunningCommand(e, state, command));
  }
}

function increaseEthBalance(state, accountIndex, ethDelta) {
  if (accountIndex == 'zero' )
    return state;
  else {
    state.ethBalances[accountIndex] = state.ethBalances[accountIndex].plus(ethDelta);
    return state;
  }
}

function decreaseEthBalance(state, accountIndex, ethDelta) {
  return increaseEthBalance(state, accountIndex, - ethDelta);
}

function trackGasFromLastBlock(state, accountIndex) {
  if (accountIndex == 'zero')
    return state;
  else {
    const block = web3.eth.getBlock('latest');
    assert.equal(1, block.transactions.length, 'we track gas from last block only when it had 1 tx');
    const gasCost = help.gasPrice.mul(block.gasUsed);

    return decreaseEthBalance(state, accountIndex, gasCost);
  }
}

async function runWaitTimeCommand(command, state) {
  await increaseTimeTestRPC(command.seconds);
  return state;
}

function ExceptionRunningCommand(e, state, command) {
  this.error = e;
  this.state = state;
  this.command = command;
}

ExceptionRunningCommand.prototype = Object.create(Error.prototype);
ExceptionRunningCommand.prototype.constructor = ExceptionRunningCommand;

function getBalance(state, account) {
  return state.balances[account] || new BigNumber(0);
}

function getVaultBalance(state, account) {
  return state.vault[account] || new BigNumber(0);
}

function getTokenBalance(state, account) {
  return state.tokenBalances[account] || new BigNumber(0);
}

async function runSetWalletCommand(command, state) {
  let from = gen.getAccount(command.fromAccount),
    newAccount = gen.getAccount(command.newAccount),
    hasZeroAddress = _.some([from, newAccount], isZeroAddress);

  let shouldThrow = hasZeroAddress ||
    command.fromAccount != state.owner;

  try {
    await state.crowdsaleContract.setWallet(newAccount, {from: from});
    assert.equal(false, shouldThrow, 'setWallet should have thrown but it didn\'t');
    help.debug(colors.green('SUCCESS setting wallet fromAccount:', from, 'newAccount:', newAccount));
    state.wallet = command.newAccount;
  } catch(e) {
    help.debug(colors.yellow('FAILED setting wallet fromAccount:', from, 'newAccount:', newAccount));
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runBuyTokensCommand(command, state) {
  let crowdsale = state.crowdsaleData,
    { startTime, endTime} = crowdsale,
    weiCost = web3.toWei(command.eth, 'ether'),
    nextTime = latestTime(),
    account = gen.getAccount(command.account),
    beneficiaryAccount = gen.getAccount(command.beneficiary),
    rate = state.crowdsaleData.rate,
    hasZeroAddress = _.some([account, beneficiaryAccount], isZeroAddress),
    newBalance = getBalance(state, command.beneficiary).plus(weiCost);

  let inTGE = nextTime >= startTime && nextTime <= endTime,
    capReached = state.weiRaised.eq(crowdsale.cap),
    capExceeded = state.weiRaised.plus(new BigNumber(help.toAtto(command.eth))).gt(crowdsale.cap),
    gasExceeded = (command.gasPrice > state.crowdsaleData.maxGasPrice) && inTGE,
    maxExceeded = newBalance.gt(state.crowdsaleData.maxCumulativeInvest),
    minNotReached = new BigNumber(help.toAtto(command.eth)).lt(state.crowdsaleData.minInvest);

  let shouldThrow = (!inTGE) ||
    state.crowdsalePaused ||
    crowdsale.rate == 0 ||
    crowdsale.cap == 0 ||
    crowdsale.maxGasPrice == 0 ||
    crowdsale.minInvest == 0 ||
    crowdsale.maxCumulativeInvest == 0 ||
    crowdsale.minInvest.gt(crowdsale.maxCumulativeInvest) ||
    state.crowdsaleFinalized ||
    hasZeroAddress ||
    weiCost == 0 ||
    maxExceeded ||
    minNotReached ||
    gasExceeded ||
    capReached;

  let bonusTime = nextTime <= startTime + duration.days(7);

  try {
    const tx = await state.crowdsaleContract.buyTokens(beneficiaryAccount, {value: weiCost, from: account, gasPrice: (command.gasPrice ? command.gasPrice : state.crowdsaleData.maxGasPrice)});
    assert.equal(false, shouldThrow, 'buyTokens should have thrown but it didn\'t');

    if (state.passedKYC[command.beneficiary]) { //investor has already passed the KYC
      let balanceOverflowed = state.weiRaised.plus(new BigNumber(help.toAtto(command.eth)));
      if (capExceeded) {
        let overflow = balanceOverflowed.sub(crowdsale.cap);
        let available = balanceOverflowed.sub(state.weiRaised.add(overflow));
        weiCost = available;
      }

      let tokens = new BigNumber(web3.fromWei(weiCost, 'ether')).mul(rate);
      if (bonusTime) {
        state.bonus[command.beneficiary] = true;
        tokens = tokens.mul(105).div(100);
      }

      state.balances[command.beneficiary] = getBalance(state, command.beneficiary).plus(weiCost);
      state.tokenBalances[command.beneficiary] = getTokenBalance(state, command.beneficiary).plus(tokens);
      state.weiRaised = state.weiRaised.plus(weiCost);
      state.tokensSold = state.tokensSold.plus(new BigNumber(help.toAtto(tokens)));
      state.crowdsaleSupply = state.crowdsaleSupply.plus(new BigNumber(help.toAtto(tokens)));
      state.bonus[command.beneficiary] = false;
      state.purchases = _.concat(state.purchases,
        {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.beneficiary, account: command.account}
      );
      state = decreaseEthBalance(state, command.account, weiCost); //TODO: chekc if this has to go outside the if else
    } else {
      if (state.passedKYC[command.beneficiary] == false) { // KYC rejected --> refund
        //TODO: refund money
      } else { //never gone through KYC, deposit in vault
        if (bonusTime) {
          state.bonus[command.beneficiary] = true;
        }
        state.vault[command.beneficiary] = getVaultBalance(state, command.beneficiary).plus(weiCost);
        state = decreaseEthBalance(state, command.account, weiCost); //TODO: chekc if this has to go outside the if else
      }
    }
    state = decreaseEthBalance(state, command.account, help.txGasCost(tx)); //TODO: chekc if this has to go outside the if else

    help.debug(colors.green('SUCCESS buying tokens, eth:', web3.fromWei(weiCost, 'ether'), 'endBlocks:', crowdsale.endTime, 'blockTimestamp:', nextTime));

  } catch(e) {
    help.debug(colors.yellow('FAILURE buying tokens, gasExceeded:', gasExceeded, ', minNotReached:', minNotReached, ', maxExceeded:', maxExceeded, ', capExceeded: ', capExceeded));
    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runValidatePurchaseCommand(command, state) {

  let crowdsale = state.crowdsaleData,
    { startTime, endTime} = crowdsale,
    deposited = state.vault[command.beneficiary] || 0,
    nextTime = latestTime(),
    account = gen.getAccount(command.account),
    beneficiaryAccount = gen.getAccount(command.beneficiary),
    acceptance = command.acceptance,
    rate = state.crowdsaleData.rate,
    hasZeroAddress = _.some([account, beneficiaryAccount], isZeroAddress),
    newBalance = getBalance(state, command.beneficiary).plus(deposited);

  let inTGE = nextTime >= startTime && nextTime <= endTime,
    capExceeded = state.weiRaised.plus(new BigNumber(deposited)).gt(crowdsale.cap),
    gasExceeded = (command.gasPrice > state.crowdsaleData.maxGasPrice) && inTGE,
    maxExceeded = newBalance.gt(state.crowdsaleData.maxCumulativeInvest),
    minNotReached = (deposited > 0) ? new BigNumber(deposited).lt(state.crowdsaleData.minInvest) : false;

  let shouldThrow =
    state.crowdsalePaused ||
    crowdsale.rate == 0 ||
    crowdsale.cap == 0 ||
    crowdsale.maxGasPrice == 0 ||
    crowdsale.minBuyingRequestInterval == 0 ||
    crowdsale.minInvest == 0 ||
    crowdsale.maxCumulativeInvest == 0 ||
    crowdsale.minInvest.gt(crowdsale.maxCumulativeInvest) ||
    state.crowdsaleFinalized ||
    hasZeroAddress ||
    maxExceeded ||
    minNotReached ||
    gasExceeded ||
    acceptance == null ||
    command.account != state.owner;

  let balanceOverflowed = state.weiRaised.plus(deposited);
  if (capExceeded) {
    let overflow = balanceOverflowed.sub(crowdsale.cap);
    let available = balanceOverflowed.sub(state.weiRaised.add(overflow));
    deposited = available;
  }

  try {
    let tx = await state.crowdsaleContract.validatePurchase(beneficiaryAccount, acceptance, {from: account, gasPrice: (command.gasPrice ? command.gasPrice : state.crowdsaleData.maxGasPrice)});
    assert.equal(false, shouldThrow, 'validatePurchase should have thrown but it didn\'t');

    let tokens = new BigNumber(0);

    if (acceptance) { //investor has already passed the KYC
      let tokens = new BigNumber(web3.fromWei(deposited, 'ether')).mul(rate);
      state.passedKYC[command.beneficiary] = true;
      if (state.vault[command.beneficiary] > 0) { //if investor has money in the vault, refund
        if (state.bonus[command.beneficiary]) {
          tokens = tokens.mul(105).div(100);
          state.bonus[command.beneficiary] = false;
        }
        state.purchases = _.concat(state.purchases,
          {tokens: tokens, rate: rate, wei: deposited, beneficiary: command.beneficiary, account: command.account}
        );
        state.balances[command.beneficiary] = getBalance(state, command.beneficiary).sub(deposited);
        state.tokenBalances[command.beneficiary] = getTokenBalance(state, command.beneficiary).plus(tokens);
        state.weiRaised = state.weiRaised.plus(deposited);
        state.tokensSold = state.tokensSold.plus(new BigNumber(help.toAtto(tokens)));
        state.crowdsaleSupply = state.crowdsaleSupply.plus(new BigNumber(help.toAtto(tokens)));
        state.vault[command.beneficiary] = 0;
      }
    } else {
      state.passedKYC[command.beneficiary] = false;
      if (state.vault[command.beneficiary] > 0) { //if investor has money in the vault, refund
        state.vault[command.beneficiary] = getVaultBalance(state, command.beneficiary).sub(deposited);
        state.balances[command.beneficiary] = getBalance(state, command.beneficiary).plus(deposited);
      }
    }
    state = decreaseEthBalance(state, command.account, deposited);
    state = decreaseEthBalance(state, command.account, help.txGasCost(tx));
    help.debug(colors.green('SUCCESS validating purchase, tokens minted: ', tokens, ', rate:', rate, 'eth:', web3.fromWei(deposited, 'ether'), 'endBlocks:', crowdsale.endTime, 'blockTimestamp:', nextTime));
  } catch(e) {
    help.debug(colors.yellow('FAILURE validating purchase, out of TGE time: ', !inTGE, ', gasExceeded:', gasExceeded, ', minNotReached:', minNotReached, ', maxExceeded:', maxExceeded, ', capExceeded: ', capExceeded));
    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runPauseCrowdsaleCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = (state.crowdsalePaused == command.pause) ||
    (command.fromAccount != state.owner) ||
    hasZeroAddress;

  help.debug(colors.green('pausing crowdsale, previous state:', state.crowdsalePaused, 'new state:', command.pause));
  try {
    let tx;
    if (command.pause) {
      tx = await state.crowdsaleContract.pause({from: account});
    } else {
      tx = await state.crowdsaleContract.unpause({from: account});
    }
    assert.equal(false, shouldThrow);
    state.crowdsalePaused = command.pause;
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
  } catch(e) {
    state = trackGasFromLastBlock(state, command.fromAccount);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runPauseTokenCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = (state.tokenPaused == command.pause) ||
    !state.crowdsaleFinalized ||
    command.fromAccount != state.tokenOwner ||
    hasZeroAddress;

  try {
    let tx;
    if (command.pause) {
      tx = await state.token.pause({from: account});
    } else {
      tx = await state.token.unpause({from: account});
    }
    assert.equal(false, shouldThrow);
    help.debug(colors.green('SUCCESS pausing token, previous state:', state.tokenPaused, 'new state:', command.pause));

    state.tokenPaused = command.pause;
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
  } catch(e) {
    help.debug(colors.yellow('FAILURE pausing token, previous state:', state.tokenPaused, 'new state:', command.pause));
    state = trackGasFromLastBlock(state, command.fromAccount);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runFinalizeCrowdsaleCommand(command, state) {
  let nextTimestamp = latestTime(),
    account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account),
    capReached = state.weiRaised.gte(state.crowdsaleData.cap);

  let shouldThrow = state.crowdsaleFinalized ||
    state.crowdsalePaused ||
    hasZeroAddress ||
    (nextTimestamp < state.crowdsaleData.endTime && !capReached) ||
    command.fromAccount != state.owner;

  try {
    let supplyBeforeFinalize = await state.token.totalSupply(),
      tokenOwnerBeforeFinalize = await state.token.owner(),
      tx = await state.crowdsaleContract.finalize({from: account});

    assert.equal(false, shouldThrow, 'finalizeCrowdsale should have thrown but it did not');

    if (!help.inCoverage()) { // gas cannot be measuyellow correctly when running coverage
      assert(tx.receipt.gasUsed < 6700000,
        'gas used in finalize (' + tx.receipt.gasUsed + ') should be less than gas limit in mainnet');
    }
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
    state = increaseEthBalance(state, state.wallet, state.weiRaised); //TODO: check this call

    // mint 49% tokens
    let toMint = supplyBeforeFinalize.mul(49).div(51),
      newSupply = supplyBeforeFinalize.plus(toMint);
    state.tokenBalances[command.account] = getTokenBalance(state, command.account).plus(toMint);
    state.tokenSupply = newSupply;

    // empty vaults
    let vault = Vault.at(await state.crowdsaleContract.vault());
    for (var i = 0; i < state.vault.length; i++) {
      state.vault[i] = 0;
      new BigNumber(state.vault[i]).should.be.bignumber.equal(await vault.deposited(gen.getAccount(i)));
      // TODO: increase ETH to account
    }

    //check token ownership change
    let tokenOwnerAfterFinalize = await state.token.owner();
    assert.notEqual(tokenOwnerBeforeFinalize, tokenOwnerAfterFinalize);
    assert.equal(gen.getAccount(state.wallet), tokenOwnerAfterFinalize);

    state.crowdsaleFinalized = true;
    state.tokenPaused = false;
    state.tokenOwner = state.wallet; //TODO: change state.owner or token owner??

    help.debug(colors.green('SUCCESS: finishing crowdsale on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount), 'gas used: ', tx.receipt.gasUsed));

  } catch(e) {
    help.debug(colors.yellow('FAILURE finishing crowdsale, finalized: ', state.crowdsaleFinalized, ', paused: ', state.crowdsalePaused, ', current time less than endTime: ', (nextTimestamp < state.crowdsaleData.endTime), ', cap reached: ', capReached, ', on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount)));
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runBurnTokensCommand(command, state) {
  let account = gen.getAccount(command.account),
    balance = getTokenBalance(state, command.account),
    hasZeroAddress = isZeroAddress(account),
    tokens = new BigNumber(help.toAtto(command.tokens));

  let shouldThrow = state.tokenPaused ||
    (balance < command.tokens) ||
    command.tokens == 0 ||
    hasZeroAddress;

  try {
    const tx = await state.token.burn(tokens, {from: account});
    assert.equal(false, shouldThrow, 'burn should have thrown but it did not');
    help.debug(colors.green('SUCCESS burning tokens, balance:', balance, 'tokens: ', command.tokens));

    state.tokenBalances[account] = balance.minus(tokens);
    state.crowdsaleSupply = state.crowdsaleSupply.minus(tokens);

    state = decreaseEthBalance(state, command.account, help.txGasCost(tx));
  } catch(e) {
    help.debug(colors.yellow('FAILURE burning tokens, balance:', balance, 'tokens: ', command.tokens));
    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runFundCrowdsaleToCap(command, state) {

  if (!state.crowdsaleFinalized) {
    // unpause the crowdsale if needed
    if (state.crowdsalePaused) {
      state = await runPauseCrowdsaleCommand({pause: false, fromAccount: state.owner}, state);
    }
    let cap = state.crowdsaleData.cap,
      weiRaised = state.weiRaised;

    if (weiRaised < cap) {
      // wait for crowdsale startTime
      if (latestTime() < state.crowdsaleData.startTime) {
        await increaseTimeTestRPCTo(state.crowdsaleData.startTime);
      }
      // reach the cap
      let ethToCap = web3.fromWei(cap.minus(weiRaised), 'ether'),
        maxInvest = web3.fromWei(state.crowdsaleData.maxCumulativeInvest, 'ether'),
        purchasesNeeded = ethToCap.div(maxInvest).ceil().toNumber();
      for (var i = 1; i <= purchasesNeeded; i++) {
        let buyTokensCommand = {account: i, eth: maxInvest, beneficiary: i};
        state = await runBuyTokensCommand(buyTokensCommand, state);
        let validatePurchaseCommand = {account: state.owner, beneficiary: i, acceptance: true};
        state = await runValidatePurchaseCommand(validatePurchaseCommand, state);

        new BigNumber(state.weiRaised).should.be.bignumber.equal(await state.crowdsaleContract.weiRaised());
        let vault = Vault.at(await state.crowdsaleContract.vault());
        new BigNumber(state.vault[i]).should.be.bignumber.equal(await vault.deposited(gen.getAccount(i)));
      }

      new BigNumber(state.weiRaised).should.be.bignumber.equal(cap);
      new BigNumber(state.weiRaised).should.be.bignumber.equal(await state.crowdsaleContract.weiRaised());
    }

    if (command.finalize) {
      // wait for crowdsale endTime
      if (latestTime() < state.crowdsaleData.endTime) {
        await increaseTimeTestRPCTo(state.crowdsaleData.endTime + 1);
      }
      state = await runFinalizeCrowdsaleCommand({fromAccount: state.owner}, state);
      // verify that the crowdsale is finalized
      assert.equal(await state.crowdsaleContract.isFinalized(), state.crowdsaleFinalized);

    }
  }

  return state;
}

const commands = {
  waitTime: {gen: gen.waitTimeCommandGen, run: runWaitTimeCommand},
  buyTokens: {gen: gen.buyTokensCommandGen, run: runBuyTokensCommand},
  validatePurchase: {gen: gen.validatePurchaseCommandGen, run: runValidatePurchaseCommand},
  burnTokens: {gen: gen.burnTokensCommandGen, run: runBurnTokensCommand},
  setWallet: {gen: gen.setWalletCommandGen, run: runSetWalletCommand},
  // sendTransaction: {gen: gen.sendTransactionCommandGen, run: runSendTransactionCommand},
  pauseCrowdsale: {gen: gen.pauseCrowdsaleCommandGen, run: runPauseCrowdsaleCommand},
  pauseToken: {gen: gen.pauseTokenCommandGen, run: runPauseTokenCommand},
  finalizeCrowdsale: {gen: gen.finalizeCrowdsaleCommandGen, run: runFinalizeCrowdsaleCommand},
  fundCrowdsaleToCap: {gen: gen.fundCrowdsaleToCapCommandGen, run: runFundCrowdsaleToCap},
};

module.exports = {

  commandsGen: jsc.oneof(_.map(commands, (c) => c.gen)),

  findCommand: (type) => {
    let command = commands[type];
    if (command === undefined)
      throw(new Error('unknown command ' + type));
    return command;
  },

  ExceptionRunningCommand: ExceptionRunningCommand
};
