// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "../../interface/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Satin is IERC20, Initializable {
    string public constant symbol = "SATIN";
    string public constant name = "SATIN";
    uint8 public constant decimals = 18;
    uint public override totalSupply;

    mapping(address => uint) public override balanceOf;
    mapping(address => mapping(address => uint)) public override allowance;

    address public minter;

    // constructor() {
    //     minter = msg.sender;
    //     _mint(msg.sender, 0);
    // }

    function initialize() public initializer {
        // __ERC20_init("SATIN", "SATIN");
        // __ERC20Burnable_init();
        // __Pausable_init();
        // __Ownable_init();
        // __UUPSUpgradeable_init();
        minter = msg.sender;
        _mint(msg.sender, 3514796667 * 10 ** decimals);
    }

    // No checks as its meant to be once off to set minting rights to Minter
    function setMinter(address _minter) external {
        require(msg.sender == minter, "SATIN: Not minter");
        minter = _minter;
    }

    function approve(address _spender, uint _value) external override returns (bool) {
        require(_spender != address(0), "SATIN: Approve to the zero address");
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function _mint(address _to, uint _amount) internal returns (bool) {
        require(_to != address(0), "SATIN: Mint to the zero address");
        balanceOf[_to] += _amount;
        totalSupply += _amount;
        emit Transfer(address(0x0), _to, _amount);
        return true;
    }

    function _transfer(address _from, address _to, uint _value) internal returns (bool) {
        require(_to != address(0), "SATIN: Transfer to the zero address");

        uint fromBalance = balanceOf[_from];
        require(fromBalance >= _value, "SATIN: Transfer amount exceeds balance");
        unchecked {
            balanceOf[_from] = fromBalance - _value;
        }

        balanceOf[_to] += _value;
        emit Transfer(_from, _to, _value);
        return true;
    }

    function transfer(address _to, uint _value) external override returns (bool) {
        return _transfer(msg.sender, _to, _value);
    }

    function transferFrom(address _from, address _to, uint _value) external override returns (bool) {
        address spender = msg.sender;
        uint spenderAllowance = allowance[_from][spender];
        if (spenderAllowance != type(uint).max) {
            require(spenderAllowance >= _value, "SATIN: Insufficient allowance");
            unchecked {
                uint newAllowance = spenderAllowance - _value;
                allowance[_from][spender] = newAllowance;
                emit Approval(_from, spender, newAllowance);
            }
        }
        return _transfer(_from, _to, _value);
    }

    function mint(address account, uint amount) external returns (bool) {
        require(msg.sender == minter, "SATIN: Not minter");
        _mint(account, amount);
        return true;
    }
}
