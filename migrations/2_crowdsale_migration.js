const QiibeeCrowdsale = artifacts.require("./QiibeeCrowdsale.sol");
const Web3 = require('web3');
const web3 = new Web3();

module.exports = function (deployer) {
    deployer.deploy(QiibeeCrowdsale
        , 1530878570                                        // _openingTime - 6 July 
        , 1538828508                                        // _closingTime - 28 June + 100 days
        , 21                                                // _rate
        , web3.utils.toWei('100', 'ether')                  // _cap
        , web3.utils.toWei('0.0000002', 'ether')            // _minContrib
        , web3.utils.toWei('50', 'ether')                   // _maxCumulativeContrib
        , web3.utils.toWei('1', 'ether')                    // _maxGasPrice
        , '0x32905da9a790a641a83bd73f89455f89cbe6f551'      // QiibeeToken address
        , '0x82f42dc102f0d957053b2c8dbd8516f3d796279f');    // _wallet address
};