// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

abstract contract Reentrancy {

  /// @dev simple re-entrancy check
  uint internal _unlocked = 1;

  modifier lock() {
    require(_unlocked == 1, "Reentrant call");
    _unlocked = 2;
    _;
    _unlocked = 1;
  }

}