//SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Faucet {
    using SafeERC20 for IERC20;

    address public token;

    constructor(address _token) {
        token = _token;
    }

    function mint(address recipient, uint256 amount) external {
        IERC20(token).safeTransfer(recipient, amount);
    }
}
