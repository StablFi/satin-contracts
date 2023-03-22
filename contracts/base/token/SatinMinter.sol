// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "../../lib/Math.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../../interface/IUnderlying.sol";
import "../../interface/IVoter.sol";
import "../../interface/IVe.sol";
import "../../interface/IVeDist.sol";
import "../../interface/IMinter.sol";
import "../../interface/IController.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title Codifies the minting rules as per ve(3,3),
///        abstracted from the token to support any token that allows minting
contract SatinMinter is IMinter, Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @dev Allows minting once per week (reset every Thursday 00:00 UTC)
    uint internal constant _WEEK = 86400 * 7;

    /// @dev Decrease base weekly emission by 2%
    uint internal constant _WEEKLY_EMISSION_DECREASE = 98;
    uint internal constant _WEEKLY_EMISSION_DECREASE_DENOMINATOR = 100;

    /// @dev weekly rewards for ve holders. 5% of the full amount.
    uint internal growthDivider;

    /// @dev No emissions after 491 weeks;
    uint internal periodEmissionsEnd;

    /// @dev The core parameter for determinate the whole emission dynamic.
    ///       Will be decreased every week.
    uint public WEEKLY_EMISSION;

    IUnderlying public token;
    IVe public ve;
    address public controller;
    uint public activePeriod;
    address public owner;

    event Mint(address indexed sender, uint weekly, uint growth);

    // constructor(
    //     address ve_, // the ve(3,3) system that will be locked into
    //     address controller_, // controller with veDist and voter addresses
    //     address token_, //Satin token address
    //     uint warmingUpPeriod // 2 by default
    // ) {
    // owner = msg.sender;
    // token = IUnderlying(token_);
    // ve = IVe(ve_);
    // controller = controller_;
    // activePeriod = ((block.timestamp + (warmingUpPeriod * _WEEK)) / _WEEK) * _WEEK;
    // }

    function initialize(
        address ve_, // the ve(3,3) system that will be locked into
        address controller_, // controller with veDist and voter addresses
        address token_ //Satin token address
    ) public initializer {
        owner = msg.sender;
        token = IUnderlying(token_);
        ve = IVe(ve_);
        controller = controller_;
        activePeriod = ((block.timestamp + _WEEK) / _WEEK) * _WEEK;
        periodEmissionsEnd = ((block.timestamp + (491 * _WEEK)) / _WEEK) * _WEEK;
        WEEKLY_EMISSION = 312_000_000e18;
        growthDivider = 49;
    }

    function postInitialize(uint totalAmount) external {
        require(msg.sender == owner);
        token.mint(msg.sender, totalAmount);
    }

    function setGrowthDivider(uint _growthDivider) external {
        require(msg.sender == owner);
        growthDivider = _growthDivider;
    }

    function _veDist() internal view returns (IVeDist) {
        return IVeDist(IController(controller).veDist());
    }

    // function setWeeklyEmissions(uint _weeklyEmissions) external {
    //     require(msg.sender == owner);
    //     WEEKLY_EMISSION = _weeklyEmissions;
    // }

    function _voter() internal view returns (IVoter) {
        return IVoter(IController(controller).voter());
    }

    /// @dev Calculate inflation and adjust ve balances accordingly
    function _calculateGrowth(uint _minted) internal view returns (uint) {
        return _minted / growthDivider;
    }

    /// @dev Update period can only be called once per cycle (1 week)
    function updatePeriod() external override returns (uint) {
        uint _period = activePeriod;
        // only trigger if new week
        if (block.timestamp >= _period + _WEEK && block.timestamp <= periodEmissionsEnd) {
            _period = (block.timestamp / _WEEK) * _WEEK;
            uint sinceLast = _period - activePeriod;
            uint emissionsMultiplier = sinceLast / _WEEK;
            activePeriod = _period;
            uint _weekly;
            if (emissionsMultiplier > 1) {
                for (uint i = 1; i <= emissionsMultiplier; i++) {
                    _weekly += WEEKLY_EMISSION;
                    WEEKLY_EMISSION = (WEEKLY_EMISSION * _WEEKLY_EMISSION_DECREASE) / _WEEKLY_EMISSION_DECREASE_DENOMINATOR;
                }
            } else {
                _weekly = WEEKLY_EMISSION;
                WEEKLY_EMISSION = (_weekly * _WEEKLY_EMISSION_DECREASE) / _WEEKLY_EMISSION_DECREASE_DENOMINATOR;
            }
            uint _growth = _calculateGrowth(_weekly);
            uint _required = _weekly;
            uint _balanceOf = token.balanceOf(address(this));
            if (_balanceOf < _required) {
                token.mint(address(this), _required - _balanceOf);
            }

            token.approve(address(_voter()), _weekly - _growth);
            _voter().notifyRewardAmount(_weekly - _growth);
            _voter().distribute(_voter().viewSatinCashLPGaugeAddress());

            IERC20Upgradeable(address(token)).safeTransfer(address(_veDist()), _growth);
            // checkpoint token balance that was just minted in veDist
            _veDist().checkpointToken();
            _veDist().checkpointEmissions();
            // checkpoint supply
            _veDist().checkpointTotalSupply();

            emit Mint(msg.sender, _weekly, _growth);
        }
        return _period;
    }
}
