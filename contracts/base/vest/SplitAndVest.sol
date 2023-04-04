// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/finance/PaymentSplitter.sol";
import "@openzeppelin/contracts/finance/VestingWallet.sol";

contract Vester is VestingWallet {
    constructor(address splitter, uint64 startAt) VestingWallet(splitter, startAt, 365 days) {
        // ...
    }
}

contract Splitter is PaymentSplitter {
    constructor(address[] memory payees, uint256[] memory shares) PaymentSplitter(payees, shares) {
        // ...
    }
}
