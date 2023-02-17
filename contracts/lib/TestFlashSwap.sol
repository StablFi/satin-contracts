//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../base/core/BaseV1Pair.sol";

contract TestFlashSwap is ICallee {
    address tokenA;
    address tokenB;
    address pair;

    constructor(
        address _tokenA,
        address _tokenB,
        address _pair
    ) {
        tokenA = _tokenA;
        tokenB = _tokenB;
        pair = _pair;
    }

    function solidlyCallSwap(address _tokenBorrow, uint256 _amount) external {
        uint256 amount0Out = _tokenBorrow == tokenA ? _amount : 0;
        uint256 amount1Out = _tokenBorrow == tokenB ? _amount : 0;

        bytes memory data = abi.encode(_tokenBorrow, _amount);

        BaseV1Pair(pair).swap(amount0Out, amount1Out, address(this), data);
    }

    function hook(
        address,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external {
        address _pair = abi.decode(data, (address));
        (address token0, address token1) = BaseV1Pair(_pair).tokens();
        if (amount0 != 0) {
            IERC20(token0).transfer(_pair, amount0);
        }
        if (amount1 != 0) {
            IERC20(token1).transfer(_pair, amount1);
        }
    }
}
