pragma solidity ^0.4.21;

import "qb-token/contracts/QiibeeToken.sol";

contract QiibeeTokenTest is QiibeeToken {

  function QiibeeTokenTest(address _migrationMaster) QiibeeToken(_migrationMaster) {}
  
}
