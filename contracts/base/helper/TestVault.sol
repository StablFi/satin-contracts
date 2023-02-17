// SPDX-License-Identifier: MIT

// @dev a dummy vault used to issue receipt tokens to the depositer

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract TestVault is Initializable, OwnableUpgradeable, ERC20Upgradeable {
    function __TestVault_init(string memory _name, string memory _symbol) public initializer {
        __Ownable_init_unchained();
        __ERC20_init_unchained(_name, _symbol);
        __TestVault_init_unchained();
    }

    function __TestVault_init_unchained() internal initializer {}

    function deposit(uint256 _amount) public {
        _mint(msg.sender, _amount);
    }

    function withdraw(uint256 _shares) public {
        _burn(msg.sender, _shares);
    }
}
