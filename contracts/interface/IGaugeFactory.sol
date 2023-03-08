// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

interface IGaugeFactory {
    function createGauge(address _pool, address _internal_bribe, address _external_bribe, address _ve, address[] memory allowedRewards) external returns (address);
}
