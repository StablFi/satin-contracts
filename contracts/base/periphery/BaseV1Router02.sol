//SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "../../lib/Math.sol";
import "../../lib/SatinLibrary.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../interface/IWMATIC.sol";
import "../../interface/IPair.sol";
import "../../interface/IFactory.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract BaseV1Router02 is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct route {
        address from;
        address to;
        bool stable;
    }

    address public factory;
    IWMATIC public weth;
    uint256 internal constant MINIMUM_LIQUIDITY = 10 ** 3;
    bytes32 pairCodeHash;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "BaseV1Router: EXPIRED");
        _;
    }

    // constructor(address _factory, address _weth) {
    //     factory = _factory;
    //     pairCodeHash = IFactory(_factory).pairCodeHash();
    //     weth = IWMATIC(_weth);
    // }

    function initialize(address _factory, address _weth) public initializer {
        factory = _factory;
        pairCodeHash = IFactory(_factory).pairCodeHash();
        weth = IWMATIC(_weth);
    }

    receive() external payable {
        assert(msg.sender == address(weth)); // only accept ETH via fallback from the WETH contract
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(address tokenA, address tokenB, bool stable) public view returns (address pair) {
        pair = IFactory(factory).getPair(tokenA, tokenB, stable);
    }

    // given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
    // function quoteLiquidity(
    //     uint256 amountA,
    //     uint256 reserveA,
    //     uint256 reserveB
    // ) internal pure returns (uint256 amountB) {
    //     require(amountA > 0, "BaseV1Router: INSUFFICIENT_AMOUNT");
    //     require(reserveA > 0 && reserveB > 0, "BaseV1Router: INSUFFICIENT_LIQUIDITY");
    //     amountB = (amountA * reserveB) / reserveA;
    // }

    // fetches and sorts the reserves for a pair
    function getReserves(address tokenA, address tokenB, bool stable) public view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = SatinLibrary.sortTokens(tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1, ) = IPair(pairFor(tokenA, tokenB, stable)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    // performs chained getAmountOut calculations on any number of pairs
    function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut) external view returns (uint256 amount, bool stable) {
        address pair = pairFor(tokenIn, tokenOut, true);
        uint256 amountStable;
        uint256 amountVolatile;
        if (IFactory(factory).isPair(pair)) {
            amountStable = IPair(pair).getAmountOut(amountIn, tokenIn);
        }
        pair = pairFor(tokenIn, tokenOut, false);
        if (IFactory(factory).isPair(pair)) {
            amountVolatile = IPair(pair).getAmountOut(amountIn, tokenIn);
        }
        return amountStable > amountVolatile ? (amountStable, true) : (amountVolatile, false);
    }

    // performs chained getAmountOut calculations on any number of pairs
    function getAmountsOut(uint256 amountIn, route[] memory routes) public view returns (uint256[] memory amounts) {
        require(routes.length >= 1, "BaseV1Router: INVALID_PATH");
        amounts = new uint256[](routes.length + 1);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < routes.length; i++) {
            address pair = pairFor(routes[i].from, routes[i].to, routes[i].stable);
            if (IFactory(factory).isPair(pair)) {
                amounts[i + 1] = IPair(pair).getAmountOut(amounts[i], routes[i].from);
            }
        }
    }

    function isPair(address pair) external view returns (bool) {
        return IFactory(factory).isPair(pair);
    }

    function quoteAddLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired
    ) external view returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        // create the pair if it doesn't exist yet
        address _pair = IFactory(factory).getPair(tokenA, tokenB, stable);
        (uint256 reserveA, uint256 reserveB) = (0, 0);
        uint256 _totalSupply = 0;
        if (_pair != address(0)) {
            _totalSupply = IERC20Upgradeable(_pair).totalSupply();
            (reserveA, reserveB) = getReserves(tokenA, tokenB, stable);
        }
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
            liquidity = Math.sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
        } else {
            uint256 amountBOptimal = SatinLibrary.quoteLiquidity(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                (amountA, amountB) = (amountADesired, amountBOptimal);
                liquidity = Math.min((amountA * _totalSupply) / reserveA, (amountB * _totalSupply) / reserveB);
            } else {
                uint256 amountAOptimal = SatinLibrary.quoteLiquidity(amountBDesired, reserveB, reserveA);
                (amountA, amountB) = (amountAOptimal, amountBDesired);
                liquidity = Math.min((amountA * _totalSupply) / reserveA, (amountB * _totalSupply) / reserveB);
            }
        }
    }

    function quoteRemoveLiquidity(address tokenA, address tokenB, bool stable, uint256 liquidity) external view returns (uint256 amountA, uint256 amountB) {
        // create the pair if it doesn't exist yet
        address _pair = IFactory(factory).getPair(tokenA, tokenB, stable);

        if (_pair == address(0)) {
            return (0, 0);
        }

        (uint256 reserveA, uint256 reserveB) = getReserves(tokenA, tokenB, stable);
        uint256 _totalSupply = IERC20Upgradeable(_pair).totalSupply();

        amountA = (liquidity * reserveA) / _totalSupply; // using balances ensures pro-rata distribution
        amountB = (liquidity * reserveB) / _totalSupply; // using balances ensures pro-rata distribution
    }

    function _addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        require(amountADesired >= amountAMin);
        require(amountBDesired >= amountBMin);
        // create the pair if it doesn't exist yet
        address _pair = IFactory(factory).getPair(tokenA, tokenB, stable);
        if (_pair == address(0)) {
            _pair = IFactory(factory).createPair(tokenA, tokenB, stable);
        }
        (uint256 reserveA, uint256 reserveB) = getReserves(tokenA, tokenB, stable);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = SatinLibrary.quoteLiquidity(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "BaseV1Router: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = SatinLibrary.quoteLiquidity(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "BaseV1Router: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, stable, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = pairFor(tokenA, tokenB, stable);
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(tokenA), msg.sender, pair, amountA);
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(tokenB), msg.sender, pair, amountB);
        liquidity = IPair(pair).mint(to);
    }

    function addLiquidityETH(
        address token,
        bool stable,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        (amountToken, amountETH) = _addLiquidity(token, address(weth), stable, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);
        address pair = pairFor(token, address(weth), stable);
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, pair, amountToken);
        weth.deposit{value: amountETH}();
        assert(weth.transfer(pair, amountETH));
        liquidity = IPair(pair).mint(to);
        // refund dust eth, if any
        if (msg.value > amountETH) _safeTransferETH(msg.sender, msg.value - amountETH);
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = pairFor(tokenA, tokenB, stable);
        IERC20Upgradeable(pair).safeTransferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint256 amount0, uint256 amount1) = IPair(pair).burn(to);
        (address token0, ) = SatinLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "BaseV1Router: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "BaseV1Router: INSUFFICIENT_B_AMOUNT");
    }

    function removeLiquidityETH(
        address token,
        bool stable,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        (amountToken, amountETH) = removeLiquidity(token, address(weth), stable, liquidity, amountTokenMin, amountETHMin, address(this), deadline);
        IERC20Upgradeable(token).safeTransfer(to, amountToken);
        weth.withdraw(amountETH);
        _safeTransferETH(to, amountETH);
    }

    function removeLiquidityMATICSupportingFeeOnTransferTokens(
        address token,
        bool stable,
        uint liquidity,
        uint amountTokenMin,
        uint amountMATICMin,
        address to,
        uint deadline
    ) external returns (uint amountToken, uint amountMATIC) {
        return _removeLiquidityMATICSupportingFeeOnTransferTokens(token, stable, liquidity, amountTokenMin, amountMATICMin, to, deadline);
    }

    function _removeLiquidityMATICSupportingFeeOnTransferTokens(
        address token,
        bool stable,
        uint liquidity,
        uint amountTokenMin,
        uint amountMATICMin,
        address to,
        uint deadline
    ) internal ensure(deadline) returns (uint amountToken, uint amountMATIC) {
        (amountToken, amountMATIC) = removeLiquidity(token, address(weth), stable, liquidity, amountTokenMin, amountMATICMin, address(this), deadline);
        IERC20Upgradeable(token).safeTransfer(to, IERC20Upgradeable(token).balanceOf(address(this)));
        weth.withdraw(amountMATIC);
        _safeTransferETH(to, amountMATIC);
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(uint256[] memory amounts, route[] memory routes, address _to) internal virtual {
        for (uint256 i = 0; i < routes.length; i++) {
            (address token0, ) = SatinLibrary.sortTokens(routes[i].from, routes[i].to);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = routes[i].from == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < routes.length - 1 ? pairFor(routes[i + 1].from, routes[i + 1].to, routes[i + 1].stable) : _to;
            IPair(pairFor(routes[i].from, routes[i].to, routes[i].stable)).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function _swapSupportingFeeOnTransferTokens(route[] memory routes, address _to) internal virtual {
        for (uint i; i < routes.length; i++) {
            (address input, address output) = (routes[i].from, routes[i].to);
            (address token0, ) = SatinLibrary.sortTokens(input, output);
            IPair pair = IPair(pairFor(routes[i].from, routes[i].to, routes[i].stable));
            uint amountInput;
            uint amountOutput;
            {
                // scope to avoid stack too deep errors
                (uint reserve0, uint reserve1, ) = pair.getReserves();
                uint reserveInput = input == token0 ? reserve0 : reserve1;
                amountInput = IERC20Upgradeable(input).balanceOf(address(pair)) - reserveInput;
                //(amountOutput,) = getAmountOut(amountInput, input, output, stable);
                amountOutput = pair.getAmountOut(amountInput, input);
            }
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOutput) : (amountOutput, uint(0));
            address to = i < routes.length - 1 ? pairFor(routes[i + 1].from, routes[i + 1].to, routes[i + 1].stable) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokensSimple(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenFrom,
        address tokenTo,
        bool stable,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        route[] memory routes = new route[](1);
        routes[0].from = tokenFrom;
        routes[0].to = tokenTo;
        routes[0].stable = stable;
        amounts = getAmountsOut(amountIn, routes);
        require(amounts[amounts.length - 1] >= amountOutMin, "BaseV1Router: INSUFFICIENT_OUTPUT_AMOUNT");
        IERC20Upgradeable(routes[0].from).safeTransferFrom(msg.sender, pairFor(routes[0].from, routes[0].to, routes[0].stable), amounts[0]);
        _swap(amounts, routes, to);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, routes);
        require(amounts[amounts.length - 1] >= amountOutMin, "BaseV1Router: INSUFFICIENT_OUTPUT_AMOUNT");
        IERC20Upgradeable(routes[0].from).safeTransferFrom(msg.sender, pairFor(routes[0].from, routes[0].to, routes[0].stable), amounts[0]);
        _swap(amounts, routes, to);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(routes[0].from == address(weth), "BaseV1Router: INVALID_PATH");
        amounts = getAmountsOut(msg.value, routes);
        require(amounts[amounts.length - 1] >= amountOutMin, "BaseV1Router: INSUFFICIENT_OUTPUT_AMOUNT");
        weth.deposit{value: amounts[0]}();
        assert(weth.transfer(pairFor(routes[0].from, routes[0].to, routes[0].stable), amounts[0]));
        _swap(amounts, routes, to);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(routes[routes.length - 1].to == address(weth), "BaseV1Router: INVALID_PATH");
        amounts = getAmountsOut(amountIn, routes);
        require(amounts[amounts.length - 1] >= amountOutMin, "BaseV1Router: INSUFFICIENT_OUTPUT_AMOUNT");
        IERC20Upgradeable(routes[0].from).safeTransferFrom(msg.sender, pairFor(routes[0].from, routes[0].to, routes[0].stable), amounts[0]);
        _swap(amounts, routes, address(this));
        weth.withdraw(amounts[amounts.length - 1]);
        _safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, route[] calldata routes, address to, uint deadline) external ensure(deadline) {
        IERC20Upgradeable(routes[0].from).safeTransferFrom(msg.sender, pairFor(routes[0].from, routes[0].to, routes[0].stable), amountIn);
        uint balanceBefore = IERC20Upgradeable(routes[routes.length - 1].to).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(routes, to);
        require(IERC20Upgradeable(routes[routes.length - 1].to).balanceOf(to) - balanceBefore >= amountOutMin, "BaseV1Router: INSUFFICIENT_OUTPUT_AMOUNT");
    }

    function swapExactMATICForTokensSupportingFeeOnTransferTokens(uint amountOutMin, route[] calldata routes, address to, uint deadline) external payable ensure(deadline) {
        require(routes[0].from == address(weth), "BaseV1Router: INVALID_PATH");
        uint amountIn = msg.value;
        weth.deposit{value: amountIn}();
        assert(weth.transfer(pairFor(routes[0].from, routes[0].to, routes[0].stable), amountIn));
        uint balanceBefore = IERC20Upgradeable(routes[routes.length - 1].to).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(routes, to);
        require(IERC20Upgradeable(routes[routes.length - 1].to).balanceOf(to) - balanceBefore >= amountOutMin, "BaseV1Router: INSUFFICIENT_OUTPUT_AMOUNT");
    }

    function swapExactTokensForMATICSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, route[] calldata routes, address to, uint deadline) external ensure(deadline) {
        require(routes[routes.length - 1].to == address(weth), "BaseV1Router: INVALID_PATH");
        IERC20Upgradeable(routes[0].from).safeTransferFrom(msg.sender, pairFor(routes[0].from, routes[0].to, routes[0].stable), amountIn);
        _swapSupportingFeeOnTransferTokens(routes, address(this));
        uint amountOut = IERC20Upgradeable(address(weth)).balanceOf(address(this));
        require(amountOut >= amountOutMin, "BaseV1Router: INSUFFICIENT_OUTPUT_AMOUNT");
        weth.withdraw(amountOut);
        _safeTransferETH(to, amountOut);
    }

    function UNSAFE_swapExactTokensForTokens(uint256[] memory amounts, route[] calldata routes, address to, uint256 deadline) external ensure(deadline) returns (uint256[] memory) {
        IERC20Upgradeable(routes[0].from).safeTransferFrom(msg.sender, pairFor(routes[0].from, routes[0].to, routes[0].stable), amounts[0]);
        _swap(amounts, routes, to);
        return amounts;
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "TransferHelper: ETH_TRANSFER_FAILED");
    }
}
