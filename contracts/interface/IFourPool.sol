// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

interface IFourPool {
    function getTokensArray() external view returns (address[] memory);
}
