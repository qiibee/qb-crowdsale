pragma solidity ^0.4.21;

import "openzeppelin-solidity/contracts/crowdsale/distribution/FinalizableCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/CappedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/TimedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "./Vault.sol";

contract QiibeeToken {
  function mintVestedTokens(address _to,
    uint256 _value,
    uint64 _start,
    uint64 _cliff,
    uint64 _vesting,
    bool _revokable,
    bool _burnsOnRevoke,
    address _wallet
  ) returns (bool);
  function mint(address _to, uint256 _amount) returns (bool);
  function transferOwnership(address _wallet);
  function pause();
  function unpause();
  function finishMinting() returns (bool);
  function totalSupply() returns (uint256);
}

/**
   @title Crowdsale for the QBX Token Generation Event
 */

contract QiibeeCrowdsale is TimedCrowdsale, CappedCrowdsale, FinalizableCrowdsale, Pausable {

    using SafeMath for uint256;

    QiibeeToken public token; // token being sold

    uint256 public tokensSold; // qbx minted (and sold)

    mapping (address => uint256) public balances; // balance of wei invested per contributor

    // spam prevention
    uint256 public maxGasPrice; // max gas price per transaction

    // bonus
    uint256 public bonusEndtime; // date where bonus is over
    mapping (address => bool) public bonus; // contributors who are entitled to the bonus
    mapping (address => bool) public existsBonus;

    // limits
    uint256 public minContrib; // minimum invest in wei an address can do
    uint256 public maxCumulativeContrib; // maximum cumulative invest an address can do


    Vault public vault; // vault used to hold funds while crowdsale is running
    // mapping (address => uint256) public deposited; //Money deposited per contributor
    mapping (address => bool) public rejected; // contributors that have been reject KYC
    mapping (address => bool) public accepted; // contributors that have been accepted KYC

    /*
     * @dev event for change wallet logging
     * @param wallet new wallet address
     */
    event WalletChange(address wallet);

    /* TODO: modify text
     * @dev event for contribution received
     * @param beneficiary contributor address
     * @param beneficiary amoount invested
     */
    event Released(address beneficiary, uint256 weiAmount);

    /*
     * @dev event for contribution refunded
     * @param beneficiary contributor address
     * @param beneficiary amoount invested
     */
    event PartialRefund(address beneficiary, uint256 amount);

    /*
     * @dev event for contribution whitelist
     * @param beneficiary contributor address
     */
    event Whitelisted(address beneficiary);

    /*
     * @dev event for contribution blacklist
     * @param beneficiary contributor address
     */
    event Blacklisted(address beneficiary);

    /*
     * @dev Constructor. Creates the token in a paused state
     * @param _openingTime see `openingTime`
     * @param _closingTime see `closingTime`
     * @param _rate see `rate` on Crowdsale.sol
     * @param _cap see `see cap`
     * @param _minContrib see `see minContrib`
     * @param _maxCumulativeContrib see `see maxCumulativeContrib`
     * @param _maxGasPrice see `see maxGasPrice`
     * @param _token see `token`
     * @param _wallet see `wallet`
     */
    function QiibeeCrowdsale (
        uint256 _openingTime,
        uint256 _closingTime,
        uint256 _rate,
        uint256 _cap,
        uint256 _minContrib,
        uint256 _maxCumulativeContrib,
        uint256 _maxGasPrice,
        address _token,
        address _wallet
    ) public
      Crowdsale(_rate, _wallet, ERC20(_token))
      TimedCrowdsale(_openingTime, _closingTime)
      CappedCrowdsale(_cap)
    {
        require(_minContrib > 0);
        require(_minContrib < cap);
        require(_minContrib <= _maxCumulativeContrib);
        require(_maxGasPrice > 0);

        bonusEndtime = _openingTime.add(7 days);
        minContrib = _minContrib;
        maxCumulativeContrib = _maxCumulativeContrib;
        maxGasPrice = _maxGasPrice;
        token = QiibeeToken(_token);
        vault = new Vault(wallet);
    }

    /**
     * @dev Throws if cap has been reached.
     */
    modifier capNotReached() {
      require(weiRaised < cap);
      _;
    }

    /**
     * @dev Throws if crowdsale has started.
     */
    modifier beforeOpen() {
      require(block.timestamp < openingTime);
      _;
    }

    /*
     * @dev Whenever buyTokens function is called there are 3 use cases that can take place:
     * 1). if contributor has already passed KYC (this means that accepted[msg.sender] is true),
     * a normal purchase is done (funds go to qiibee wallet and tokens are minted (see _mintTokens
     * function)
     * 2). if contributor has been REJECTED from KYC (this means that rejected[msg.sender] is true),
     * funds are immediately refunded to the user and NO minting is performed.
     * 3). if contributor has never gone through the KYC process (this means that both
     * accepted[msg.sender] and rejected[msg.sender] are false) the funds are deposited in a vault
     * until the contract knows whether the contributor has passed the KYC or not.
     */
    function buyTokens() public payable whenNotPaused capNotReached onlyWhileOpen {
        _preValidatePurchase(msg.sender, msg.value);

        if (accepted[msg.sender]) { // contributor has been accepted in the KYC process
            _mintTokens(msg.sender, msg.value);
        } else {
            if (rejected[msg.sender]) { // contributor has been rejected in the KYC process
                revert();
                // beneficiary.transfer(msg.value); // refund money to contributor
                // Refunded(beneficiary, msg.value);
            } else { // contributor has not gone through the KYC process yet
                bonus[msg.sender] = _checkBonus();
                vault.deposit.value(msg.value)(msg.sender);
            }
        }
    }

    /*
     * @dev this function is triggered by the owner to validate a contributor's purchase. There are 2 use cases 
     * that can take place:
     * 1). if contributor has previously tried contributing (so he has his funds in the vault), we add
     * him/her to the accepted array and call _mintTokens() function.
     * 2). if contributor has never tried contributing yet (so he has no funds in the vault), we just add
     * him/her to the accepted array.
     * @param beneficiary address where tokens are sent to
     */
    function validatePurchase(address beneficiary) onlyOwner external whenNotPaused {
        require(beneficiary != address(0));
        uint256 deposited = vault.deposited(beneficiary); // wei deposited by contributor
        accepted[beneficiary] = true; // Add contributor to KYC array so if he reinvests he automatically gets the tokens. //TODO: beneficiary or sender?
        rejected[beneficiary] = false; // Add contributor to KYC array so if he reinvests he automatically gets the tokens. //TODO: beneficiary or sender?
        if (deposited > 0) {
          _mintTokens(beneficiary, deposited);
        }
        Whitelisted(beneficiary);
    }

    /*
     * @dev this function is triggered by the owner to reject a contributor's purchase. There are 2 use cases 
     * that can take place:
     * 1). if contributor has previously tried contributing (so he has his funds in the vault), we add
     * him/her to the rejected array and refund him/her.
     * 2). if contributor has never tried contributing yet (so he has no funds in the vault), we just add
     * him/her to the rejected array.
     * @param beneficiary address where tokens are sent to
     */
    function rejectPurchase(address beneficiary) onlyOwner external whenNotPaused {
        require(beneficiary != address(0));
        uint256 deposited = vault.deposited(beneficiary); // wei deposited by contributor
        rejected[beneficiary] = true; // Add contributor to KYC array so if he reinvests he automatically gets the tokens. //TODO: beneficiary or sender?
        accepted[beneficiary] = false;
        if (deposited > 0) {
          vault.refund(beneficiary);
        }
        Blacklisted(beneficiary);
    }

    /**
      @dev Finalizes the crowdsale, calls finalization method (see `finalization()`),
      unpauses the token and transfers the token ownership to the foundation.
      This function can only be called once the crowdsale has ended.
    */
    function finalize() onlyOwner public {
        require(!isFinalized);
        require(hasClosed());

        finalization();
        Finalized();

        isFinalized = true;

        QiibeeToken(token).finishMinting(); //TODO: decide if we want to finish minting here
        QiibeeToken(token).unpause();
        QiibeeToken(token).transferOwnership(wallet);
    }

    /**
      @dev changes the token owner
      @param tokenAddress address address of the token contract
    */
    function setToken(address tokenAddress) onlyOwner beforeOpen external {
      require(tokenAddress != address(0));
      token = QiibeeToken(tokenAddress);
    }

    /*
     * @dev Changes the current wallet for a new one. Only the owner can call this function.
     * @param _wallet new wallet
     */
    function setWallet(address _wallet) onlyOwner external {
        require(_wallet != address(0));
        wallet = _wallet;
        WalletChange(_wallet);
    }

    /*
     * @dev Contributors can claim their contribution after crowdsale has been finalized.
     * This is a safe method in case refundAll() didn't work so each contributor can 
     * still claim their funds stored in the vault. 
     */
    function claimVaultFunds() whenNotPaused external {
        require(isFinalized);
        vault.refund(msg.sender);
    }

    /*
     * @dev Allows owner to refund all the contributors that have a reamining balance
     * on the vault. This call is only allowed after crowdsale is finished 
     */
    function refundAll(uint[] indexes) whenNotPaused onlyOwner external {
        require(isFinalized);
        vault.refundAll(indexes);
    }

    /*
     * @dev Pre validates a purchase. Note that the sender must be the beneficiary, 
     * this means that nobody can purchase on behalf of another one.
     * @param _beneficiary beneficiary
     * @param _weiAmount amount in wei
     */
    function _preValidatePurchase(address _beneficiary, uint256 _weiAmount) internal {
        require(_weiAmount != 0);
        uint256 deposited = vault.deposited(_beneficiary); // wei deposited by contributor
        uint256 newBalance = msg.value.add(deposited);
        _checkLimits(_beneficiary, newBalance);
    }

    /*
     * @dev checks whether corresponds to receive a bonus or not.
     */
    function _checkBonus() internal returns (bool) {
        return now <= bonusEndtime;
    }

    /*
     * @dev If user has passed KYC, release funds and mint QBX. Otherwise, send back money.
     * @param beneficiary address where tokens are sent to
     * @param acceptance whether the user has passed KYC or not
     */
    function _mintTokens(address beneficiary, uint256 weiAmount) internal {
        _checkLimits(beneficiary, weiAmount);

        uint256 overflow = _computeOverflow(weiAmount);
        weiAmount = weiAmount.sub(overflow);
        assert(weiAmount > 0);

        uint256 tokens = _computeTokens(beneficiary, weiAmount);

        assert(QiibeeToken(token).mint(beneficiary, tokens));

        balances[beneficiary] = balances[beneficiary].add(weiAmount);
        weiRaised = weiRaised.add(weiAmount);
        tokensSold = tokensSold.add(tokens);
        _processDeposit(beneficiary, weiAmount, overflow);

        TokenPurchase(msg.sender, beneficiary, weiAmount, tokens);
    }

    function _computeOverflow(uint256 weiAmount) internal returns (uint256) {
        uint256 newBalance = weiRaised.add(weiAmount);
        uint256 overflow;
        if (newBalance > cap) {
            overflow = newBalance.sub(cap);
        }
        return overflow;
    }

    function _computeTokens(address beneficiary, uint256 weiAmount) internal returns (uint256) {
        uint256 tokens = weiAmount.mul(rate);
        if (_checkBonus() || bonus[beneficiary]) {
            tokens = tokens.mul(105).div(100); // adds 5% on top
            bonus[beneficiary] = false; // reset bonus
        }
        return tokens;
    }

    function _processDeposit(address beneficiary, uint256 weiAmount, uint256 overflow) internal returns (uint256) {
        uint256 deposited = vault.deposited(beneficiary); // wei deposited by contributor
        if (deposited > 0) { // if contributor has his funds in the vault, release them to qiibee
            vault.release(beneficiary, overflow);
        } else {
            wallet.transfer(weiAmount); // forward funds to qiibee wallet
            Released(beneficiary, weiAmount);
        }
    }

    /*
     * Checks if the contribution made is within the allowed limits
     */
    function _checkLimits(address beneficiary, uint256 weiAmount) internal {
        uint256 newBalance = balances[beneficiary].add(weiAmount);
        require(newBalance <= maxCumulativeContrib && weiAmount >= minContrib);
        require(tx.gasprice <= maxGasPrice);
    }

    /*
     * @dev Overrides Crowdsale#finalization() and is in charge of minting 49% percent of
     * the tokens to the qiibee foundation wallet
     */
    function finalization() internal {
        uint256 totalSupply = QiibeeToken(token).totalSupply(); // 51%
        uint256 foundationSupply = totalSupply.mul(49).div(51); // 49%
        QiibeeToken(token).mint(wallet, foundationSupply);
        assert(QiibeeToken(token).totalSupply() == totalSupply.add(foundationSupply));
        super.finalization();
    }

}
