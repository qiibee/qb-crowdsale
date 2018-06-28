pragma solidity ^0.4.21;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

/**
 * @title RefundVault
 * @dev This contract is used for storing funds while a crowdsale
 * is in progress.
 */
contract Vault is Ownable {
  using SafeMath for uint256;

  mapping (address => uint256) public deposited;
  address[] fundsOwners;
  address public wallet;

  event Refunded(address beneficiary, uint256 weiAmount); //TODO: add indexed?
  event Deposited(address beneficiary, uint256 weiAmount);
  event Released(address beneficiary, uint256 weiAmount);
  event PartialRefund(address beneficiary, uint256 weiAmount);

  /**
   * @param _wallet Vault address
   */
  function Vault(address _wallet) public {
    require(_wallet != address(0));
    wallet = _wallet;
  }

  /**
   * @param beneficiary Investor address
   */
  function deposit(address beneficiary) onlyOwner public payable {
    deposited[beneficiary] = deposited[beneficiary].add(msg.value);
    fundsOwners.push(beneficiary);
    Deposited(beneficiary, msg.value);
  }

  /** TODO: complete text about overflow
   * @param beneficiary Investor address
   */
  function release(address beneficiary, uint256 overflow) onlyOwner public {
    uint256 amount = deposited[beneficiary].sub(overflow);
    deposited[beneficiary] = 0;

    wallet.transfer(amount);
    if (overflow > 0) {
      beneficiary.transfer(overflow);
      PartialRefund(beneficiary, overflow);
    }
    Released(beneficiary, amount);
  }

  /**
   * @param beneficiary Investor address
   */
  function refund(address beneficiary) onlyOwner public {
    uint256 depositedValue = deposited[beneficiary];
    deposited[beneficiary] = 0;
    beneficiary.transfer(depositedValue);
    Refunded(beneficiary, depositedValue);
  }

  /**
   * refunds all funds on the vault to the corresponding beneficiaries
   * @param indexes list of indexes to look up for in the fundsOwner array to refund
   */
  function refundAll(uint[] indexes) onlyOwner public { //TODO: test this function
    require(indexes.length <= fundsOwners.length);
    for (uint i = 0; i < indexes.length; i++) {
      refund(fundsOwners[indexes[i]]);
    }
  }
}
