// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Satin is Initializable, ERC20Upgradeable, ERC20BurnableUpgradeable, PausableUpgradeable, OwnableUpgradeable {
    address public minter;

    function initialize() public initializer {
        __ERC20_init("SATIN", "SATIN");
        __ERC20Burnable_init();
        __Pausable_init();
        __Ownable_init();
        minter = msg.sender;
        _mint(msg.sender, 3514796667 * 10 ** decimals());
    }

    // No checks as its meant to be once off to set minting rights to Minter
    function setMinter(address _minter) external {
        require(msg.sender == minter, "SATIN: Not minter");
        minter = _minter;
    }

    function mint(address account, uint amount) external returns (bool) {
        require(msg.sender == minter, "SATIN: Not minter");
        _mint(account, amount);
        return true;
    }

    function ownerMint(address to, uint amount) public onlyOwner {
        _mint(to, amount);
    }
}
