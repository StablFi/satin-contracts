// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.8.11;

interface IFlashLoanReceiver {
    function executeOperation(
        address pool,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external;
}
