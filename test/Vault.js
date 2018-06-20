const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

let help = require('./helpers');
const Vault = artifacts.require('Vault');

contract('Vault', function ([owner, wallet, investor, investor2, investor3, investor4]) {

  const value = help.toWei(42);

  beforeEach(async function () {
    this.vault = await Vault.new(wallet, {from: owner});
  });

  it('should accept contributions', async function () {
    await this.vault.deposit(investor, {value, from: owner}).should.be.fulfilled;
    const post = await this.vault.deposited(investor);
    post.should.be.bignumber.equal(value);
  });

  it('should not accept contributions that are not from owner', async function () {
    await this.vault.deposit(investor, {value, from: investor}).should.be.rejectedWith(help.EVMThrow);
  });

  it('should release investor\'s contribution to wallet', async function () {
    const pre = web3.eth.getBalance(wallet);
    await this.vault.deposit(investor, {value, from: owner});
    await this.vault.release(investor, 0, {from: owner}).should.be.fulfilled;
    const post = web3.eth.getBalance(wallet);
    post.should.be.bignumber.equal(pre.plus(value));
  });

  it('should release investor\'s contribution to wallet and overflow to investor', async function () {
    const overflow = help.toWei(10);
    const pre = web3.eth.getBalance(wallet);
    const preI = web3.eth.getBalance(investor);
    await this.vault.deposit(investor, {value, from: owner});
    await this.vault.release(investor, overflow, {from: owner}).should.be.fulfilled;

    const post = web3.eth.getBalance(wallet);
    post.should.be.bignumber.equal(pre.plus(value).sub(overflow));
    const postI = web3.eth.getBalance(investor);
    postI.should.be.bignumber.equal(preI.plus(overflow));
  });

  it('should refund contribution', async function () {
    const pre = web3.eth.getBalance(investor);
    await this.vault.deposit(investor, {value, from: owner});
    await this.vault.refund(investor, {from: owner}).should.be.fulfilled;
    const post = web3.eth.getBalance(investor);
    post.should.be.bignumber.equal(pre.plus(value));
  });

  it('should not refund if not owner', async function () {
    await this.vault.deposit(investor, {value, from: owner});
    await this.vault.refund(investor, {from: investor}).should.be.rejectedWith(help.EVMThrow);
  });

  it('should refund all', async function () {
    const pre = web3.eth.getBalance(investor);
    const pre2 = web3.eth.getBalance(investor2);
    const pre3 = web3.eth.getBalance(investor3);
    const pre4 = web3.eth.getBalance(investor4);
    await this.vault.deposit(investor, {value, from: owner});
    await this.vault.deposit(investor2, {value, from: owner});
    await this.vault.deposit(investor3, {value, from: owner});
    await this.vault.deposit(investor4, {value, from: owner});
    await this.vault.refundAll({from: owner}).should.be.fulfilled;
    const post = web3.eth.getBalance(investor);
    const post2 = web3.eth.getBalance(investor2);
    const post3 = web3.eth.getBalance(investor3);
    const post4 = web3.eth.getBalance(investor4);
    post.should.be.bignumber.equal(pre.plus(value));
    post2.should.be.bignumber.equal(pre2.plus(value));
    post3.should.be.bignumber.equal(pre3.plus(value));
    post4.should.be.bignumber.equal(pre4.plus(value));
  });

  it('should not refund all if not owner', async function () {
    await this.vault.deposit(investor, {value, from: owner});
    await this.vault.deposit(investor2, {value, from: owner});
    await this.vault.deposit(investor3, {value, from: owner});
    await this.vault.deposit(investor4, {value, from: owner});
    await this.vault.refundAll({from: investor}).should.be.rejectedWith(help.EVMThrow);
  });

});
