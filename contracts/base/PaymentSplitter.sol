// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/finance/PaymentSplitterUpgradeable.sol";

contract PaymentSplitter is PaymentSplitterUpgradeable {
    function initialize(address[] memory _payees, uint256[] memory _shares) public {
        __PaymentSplitter_init(_payees, _shares);
    }
}
