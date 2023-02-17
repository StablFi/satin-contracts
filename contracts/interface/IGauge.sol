// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

interface IGauge {

  function notifyRewardAmount(address token, uint amount, bool is4pool) external;

  function getReward(address account, address[] memory tokens) external;

  function claimFees() external returns (uint claimed0, uint claimed1);

}