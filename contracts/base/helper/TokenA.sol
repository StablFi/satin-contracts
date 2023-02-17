//SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenA is ERC20 {
    constructor() ERC20("TokenA", "TokenA") {
        _mint(msg.sender, 1000000 * (10**18));
    }

    function mint(uint _amount) external {
        _mint(msg.sender, _amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }
}
