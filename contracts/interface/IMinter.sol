// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

interface IMinter {
    function updatePeriod() external returns (uint);

    function activePeriod() external returns (uint);
}
