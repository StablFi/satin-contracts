// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestToken is ERC20, Ownable {
    constructor() ERC20("TestToken", "TKN") {
        // ...
    }

    function mint(address account, uint256 amount) external onlyOwner {
        super._mint(account, amount);
    }
}
