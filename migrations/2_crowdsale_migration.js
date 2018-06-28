const QiibeeCrowdsale = artifacts.require("./QiibeeCrowdsale.sol");

module.exports = function (deployer) {
    deployer.deploy(QiibeeCrowdsale
        , 1534508477    // _openingTime - 28 June + 50 days
        , 1538828508    // _closingTime - 28 June + 100 days
        , 21
        , 150000000000
        , 50000
        , 800000
        , 22000000000
        , '0x9d9e14cc4915520abab7af8bb82226943f26d4fa'  // QiibeeToken address
        , '0x82f42dc102f0d957053b2c8dbd8516f3d796279f');
};


