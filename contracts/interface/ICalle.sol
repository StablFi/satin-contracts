//SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

interface ICallee {
    function hook(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}
