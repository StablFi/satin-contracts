//SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../../interface/IPair.sol";
import "../../interface/IFactory.sol";
import "../../interface/ICalle.sol";
import "./BaseV1Fees.sol";
import "../../lib/Math.sol";
import "../../lib/SatinLibrary.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract BaseV1Pair_Upgrade is Initializable, ReentrancyGuardUpgradeable, IERC20, IPair {
    using SafeERC20 for IERC20;

    string public name;
    string public symbol;
    uint8 public decimals;

    // Used to denote stable or volatile pair, not immutable since construction happens in the initialize method for CREATE2 deterministic addresses
    bool public stable;
    bool public isPriorityPair;

    uint256 public totalSupply;

    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public balanceOf;

    bytes32 internal DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 internal PERMIT_TYPEHASH;
    uint256 internal _FEE_PRECISION;
    mapping(address => uint256) public nonces;

    uint256 internal MINIMUM_LIQUIDITY;
    /// @dev Base fee
    uint256 internal BASE_FEE;
    /// @dev 0.01% Stable swap fee
    uint256 internal SWAP_FEE_STABLE;
    /// @dev 0.20% Volatile swap fee
    uint256 internal SWAP_FEE_VOLATILE;
    /// @dev 0.5% max allowed swap fee
    uint256 internal SWAP_FEE_MAX;
    /// @dev 25% of swapFee for partnerAddresses
    uint256 internal PARTNER_FEE;
    /// @dev 10% of swapFee for the Treasury
    uint internal TREASURY_FEE;

    address public token0;
    address public token1;
    address public fees;
    address factory;
    address public treasury;

    // Capture oracle reading every 30 minutes
    uint256 periodSize;

    Observation[] public observations;
    address[] public partnerAddresses;

    uint256 public swapFee;
    uint256 internal decimals0;
    uint256 internal decimals1;

    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public blockTimestampLast;

    uint256 public reserve0CumulativeLast;
    uint256 public reserve1CumulativeLast;

    uint256 public partnerClaimable0;
    uint256 public partnerClaimable1;

    // index0 and index1 are used to accumulate fees, this is split out from normal trades to keep the swap "clean"
    // this further allows LP holders to easily claim fees for tokens they have/staked
    uint256 public index0;
    uint256 public index1;

    // position assigned to each LP to track their current index0 & index1 vs the global position
    mapping(address => uint256) public supplyIndex0;
    mapping(address => uint256) public supplyIndex1;

    // tracks the amount of unclaimed, but claimable tokens off of fees for token0 and token1
    mapping(address => uint256) public claimable0;
    mapping(address => uint256) public claimable1;

    function initialize(address _token0, address _token1, bool _stable) public initializer {
        __ReentrancyGuard_init();
        _setInitialValues();

        factory = msg.sender;
        treasury = IFactory(msg.sender).treasury();
        (token0, token1, stable) = (_token0, _token1, _stable);
        fees = address(new BaseV1Fees(_token0, _token1));

        swapFee = _stable ? SWAP_FEE_STABLE : SWAP_FEE_VOLATILE;

        if (_stable) {
            name = string(abi.encodePacked("StableV1 AMM - ", IERC20Metadata(_token0).symbol(), "/", IERC20Metadata(_token1).symbol()));
            symbol = string(abi.encodePacked("sAMM-", IERC20Metadata(_token0).symbol(), "/", IERC20Metadata(_token1).symbol()));
        } else {
            name = string(abi.encodePacked("VolatileV1 AMM - ", IERC20Metadata(_token0).symbol(), "/", IERC20Metadata(_token1).symbol()));
            symbol = string(abi.encodePacked("vAMM-", IERC20Metadata(_token0).symbol(), "/", IERC20Metadata(_token1).symbol()));
        }

        decimals0 = 10 ** IERC20Metadata(_token0).decimals();
        decimals1 = 10 ** IERC20Metadata(_token1).decimals();

        observations.push(Observation(block.timestamp, 0, 0));
    }

    function _setInitialValues() private {
        decimals = 18;
        MINIMUM_LIQUIDITY = 10 ** 3;
        BASE_FEE = 1e6;
        SWAP_FEE_STABLE = 100;
        SWAP_FEE_VOLATILE = 2000;
        SWAP_FEE_MAX = 5000;
        PARTNER_FEE = 250000;
        TREASURY_FEE = 100_000;
        periodSize = 1800;
        PERMIT_TYPEHASH = 0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
        _FEE_PRECISION = 1e32;
    }

    function setSwapFee(uint256 value) external {
        require(msg.sender == factory);
        require(value <= SWAP_FEE_MAX, "max");
        swapFee = value;
        emit FeesChanged(value);
    }

    function setPartnerAddresses(address[] calldata _partnerAddresses) external {
        require(msg.sender == factory);
        partnerAddresses = _partnerAddresses;
    }

    function setIsPriorityPair(bool ifPriority) external {
        require(msg.sender == factory);
        if (ifPriority) {
            if (stable) {
                ///@dev 0.005% stable swap fee
                swapFee = 50;
            } else {
                ///@dev 0.1% volatile swap fee
                swapFee = 1000;
            }
        } else {
            if (stable) {
                ///@dev 0.01% Stable swap fee
                swapFee = SWAP_FEE_STABLE;
            } else {
                ///@dev 0.1% Volatile swap fee
                swapFee = SWAP_FEE_VOLATILE;
            }
        }
    }

    function observationLength() external view returns (uint256) {
        return observations.length;
    }

    function lastObservation() public view returns (Observation memory) {
        return observations[observations.length - 1];
    }

    function metadata() external view returns (uint256 decimal0, uint256 decimal1, uint256 reserves0, uint256 reserves1, bool isStable, address tokenZero, address tokenOne) {
        return (decimals0, decimals1, reserve0, reserve1, stable, token0, token1);
    }

    function tokens() external view returns (address, address) {
        return (token0, token1);
    }

    function claimPartnerFee() external returns (uint256 partnerClaimed0, uint256 partnerClaimed1) {
        partnerClaimed0 = partnerClaimable0;
        partnerClaimed1 = partnerClaimable1;

        uint256 addressLength = partnerAddresses.length;
        if ((partnerClaimed0 > 0 || partnerClaimed1 > 0) && addressLength > 0) {
            partnerClaimable0 = 0;
            partnerClaimable1 = 0;

            for (uint256 i = 0; i < addressLength; i++) {
                BaseV1Fees(fees).claimFeesFor(partnerAddresses[i], (partnerClaimed0 / addressLength), (partnerClaimed1 / addressLength));
            }
        }
    }

    // claim accumulated but unclaimed fees (viewable via claimable0 and claimable1)
    function claimFees() external returns (uint256 claimed0, uint256 claimed1) {
        _updateFor(msg.sender);

        claimed0 = claimable0[msg.sender];
        claimed1 = claimable1[msg.sender];

        if (claimed0 > 0 || claimed1 > 0) {
            claimable0[msg.sender] = 0;
            claimable1[msg.sender] = 0;

            BaseV1Fees(fees).claimFeesFor(msg.sender, claimed0, claimed1);

            emit Claim(msg.sender, msg.sender, claimed0, claimed1);
        }
    }

    function _update0(uint256 amount) internal {
        uint256 _ratio;
        if (partnerAddresses.length != 0) {
            uint256 feeToPartner = (amount * PARTNER_FEE) / BASE_FEE;
            uint256 treasuryFee = (amount * TREASURY_FEE) / BASE_FEE;
            uint256 feeAmount = amount - (feeToPartner + treasuryFee);
            IERC20(token0).safeTransfer(fees, (amount - treasuryFee)); // transfer the fees out to BaseV1Fees
            IERC20(token0).safeTransfer(treasury, treasuryFee); // transfer the fees out to TREASURY
            partnerClaimable0 += feeToPartner;
            _ratio = (feeAmount * 1e18) / totalSupply; // 1e18 adjustment is removed during claim
        } else {
            uint256 treasuryFee = (amount * TREASURY_FEE) / BASE_FEE;
            uint256 feeAmount = amount - treasuryFee;
            IERC20(token0).safeTransfer(fees, (amount - treasuryFee)); // transfer the fees out to BaseV1Fees
            IERC20(token0).safeTransfer(treasury, treasuryFee); // transfer the fees out to TREASURY
            _ratio = (feeAmount * 1e18) / totalSupply; // 1e18 adjustment is removed during claim
        }
        if (_ratio > 0) {
            index0 += _ratio;
        }
        emit Fees(msg.sender, amount, 0);
    }

    /// @dev Accrue fees on token0
    // function _update0(uint256 amount) internal {
    //     uint256 feeToPartner = (amount * PARTNER_FEE) / BASE_FEE;
    //     uint256 treasuryFee = (amount * TREASURY_FEE) / BASE_FEE;
    //     uint256 feeAmount = amount - (feeToPartner + treasuryFee);
    //     IERC20(token0).safeTransfer(fees, (amount - treasuryFee)); // transfer the fees out to BaseV1Fees
    //     IERC20(token0).safeTransfer(treasury, treasuryFee); // transfer the fees out to BaseV1Fees
    //     partnerClaimable0 += feeToPartner;
    //     uint256 _ratio = (feeAmount * 1e18) / totalSupply; // 1e18 adjustment is removed during claim
    //     if (_ratio > 0) {
    //         index0 += _ratio;
    //     }
    //     emit Fees(msg.sender, amount, 0);
    // }

    /// @dev Accrue fees on token1
    function _update1(uint256 amount) internal {
        uint256 _ratio;
        if (partnerAddresses.length != 0) {
            uint256 feeToPartner = (amount * PARTNER_FEE) / BASE_FEE;
            uint256 treasuryFee = (amount * TREASURY_FEE) / BASE_FEE;
            uint256 feeAmount = amount - (feeToPartner + treasuryFee);
            IERC20(token1).safeTransfer(fees, (amount - treasuryFee)); // transfer the fees out to BaseV1Fees
            IERC20(token1).safeTransfer(treasury, treasuryFee); // transfer the fees out to TREASURY
            partnerClaimable1 += feeToPartner;
            _ratio = (feeAmount * 1e18) / totalSupply; // 1e18 adjustment is removed during claim
        } else {
            uint256 treasuryFee = (amount * TREASURY_FEE) / BASE_FEE;
            uint256 feeAmount = amount - treasuryFee;
            IERC20(token1).safeTransfer(fees, (amount - treasuryFee)); // transfer the fees out to BaseV1Fees
            IERC20(token1).safeTransfer(treasury, treasuryFee); // transfer the fees out to TREASURY
            _ratio = (feeAmount * 1e18) / totalSupply; // 1e18 adjustment is removed during claim
        }
        if (_ratio > 0) {
            index1 += _ratio;
        }
        emit Fees(msg.sender, 0, amount);
    }

    /// @dev this function MUST be called on any balance changes,
    /// otherwise can be used to infinitely claim fees
    /// Fees are segregated from core funds, so fees can never put liquidity at risk
    function _updateFor(address recipient) internal {
        uint256 _supplied = balanceOf[recipient]; // get LP balance of `recipient`
        if (_supplied > 0) {
            uint256 _supplyIndex0 = supplyIndex0[recipient]; // get last adjusted index0 for recipient
            uint256 _supplyIndex1 = supplyIndex1[recipient];
            uint256 _index0 = index0; // get global index0 for accumulated fees
            uint256 _index1 = index1;
            supplyIndex0[recipient] = _index0; // update user current position to global position
            supplyIndex1[recipient] = _index1;
            uint256 _delta0 = _index0 - _supplyIndex0; // see if there is any difference that need to be accrued
            uint256 _delta1 = _index1 - _supplyIndex1;
            if (_delta0 > 0) {
                uint256 _share = (_supplied * _delta0) / 1e18; // add accrued difference for each supplied token
                claimable0[recipient] += _share;
            }
            if (_delta1 > 0) {
                uint256 _share = (_supplied * _delta1) / 1e18;
                claimable1[recipient] += _share;
            }
        } else {
            supplyIndex0[recipient] = index0; // new users are set to the default global state
            supplyIndex1[recipient] = index1;
        }
    }

    function getReserves() public view override returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    ///@dev Update reserves and, on the first call per block, price accumulators
    function _update(uint256 balance0, uint256 balance1, uint256 _reserve0, uint256 _reserve1) internal {
        uint256 blockTimestamp = block.timestamp;
        uint256 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
        if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
            unchecked {
                reserve0CumulativeLast += _reserve0 * timeElapsed;
                reserve1CumulativeLast += _reserve1 * timeElapsed;
            }
        }

        Observation memory _point = lastObservation();
        timeElapsed = blockTimestamp - _point.timestamp; // compare the last observation with current timestamp, if greater than 30 minutes, record a new event
        if (timeElapsed > periodSize) {
            observations.push(Observation(blockTimestamp, reserve0CumulativeLast, reserve1CumulativeLast));
        }
        reserve0 = balance0;
        reserve1 = balance1;
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }

    // produces the cumulative price using counterfactuals to save gas and avoid a call to sync.
    function currentCumulativePrices() public view returns (uint256 reserve0Cumulative, uint256 reserve1Cumulative, uint256 blockTimestamp) {
        blockTimestamp = block.timestamp;
        reserve0Cumulative = reserve0CumulativeLast;
        reserve1Cumulative = reserve1CumulativeLast;

        // if time has elapsed since the last update on the pair, mock the accumulated price values
        (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast) = getReserves();
        if (_blockTimestampLast != blockTimestamp) {
            // subtraction overflow is desired
            uint256 timeElapsed = blockTimestamp - _blockTimestampLast;
            reserve0Cumulative += _reserve0 * timeElapsed;
            reserve1Cumulative += _reserve1 * timeElapsed;
        }
    }

    ///@dev gives the current twap price measured from amountIn * tokenIn gives amountOut
    function current(address tokenIn, uint256 amountIn) external view returns (uint256 amountOut) {
        Observation memory _observation = lastObservation();
        (uint256 reserve0Cumulative, uint256 reserve1Cumulative, ) = currentCumulativePrices();
        if (block.timestamp == _observation.timestamp) {
            _observation = observations[observations.length - 2];
        }

        uint256 timeElapsed = block.timestamp - _observation.timestamp;
        uint256 _reserve0 = (reserve0Cumulative - _observation.reserve0Cumulative) / timeElapsed;
        uint256 _reserve1 = (reserve1Cumulative - _observation.reserve1Cumulative) / timeElapsed;
        amountOut = _getAmountOut(amountIn, tokenIn, _reserve0, _reserve1);
    }

    // as per `current`, however allows user configured granularity, up to the full window size
    function quote(address tokenIn, uint256 amountIn, uint256 granularity) external view returns (uint256 amountOut) {
        uint256[] memory _prices = sample(tokenIn, amountIn, granularity, 1);
        uint256 priceAverageCumulative;
        for (uint256 i = 0; i < _prices.length; i++) {
            priceAverageCumulative += _prices[i];
        }
        return priceAverageCumulative / granularity;
    }

    // returns a memory set of twap prices
    function prices(address tokenIn, uint256 amountIn, uint256 points) external view returns (uint256[] memory) {
        return sample(tokenIn, amountIn, points, 1);
    }

    function sample(address tokenIn, uint256 amountIn, uint256 points, uint256 window) public view returns (uint256[] memory) {
        uint256[] memory _prices = new uint256[](points);

        uint256 length = observations.length - 1;
        uint256 i = length - (points * window);
        uint256 nextIndex = 0;
        uint256 index = 0;

        for (; i < length; i += window) {
            nextIndex = i + window;
            uint256 timeElapsed = observations[nextIndex].timestamp - observations[i].timestamp;
            uint256 _reserve0 = (observations[nextIndex].reserve0Cumulative - observations[i].reserve0Cumulative) / timeElapsed;
            uint256 _reserve1 = (observations[nextIndex].reserve1Cumulative - observations[i].reserve1Cumulative) / timeElapsed;
            _prices[index] = _getAmountOut(amountIn, tokenIn, _reserve0, _reserve1);
            index = index + 1;
        }
        return _prices;
    }

    // this low-level function should be called from a contract which performs important safety checks
    // standard uniswap v2 implementation
    function mint(address to) external override nonReentrant returns (uint256 liquidity) {
        (uint256 _reserve0, uint256 _reserve1) = (reserve0, reserve1);
        uint256 _balance0 = IERC20(token0).balanceOf(address(this));
        uint256 _balance1 = IERC20(token1).balanceOf(address(this));
        uint256 _amount0 = _balance0 - _reserve0;
        uint256 _amount1 = _balance1 - _reserve1;

        uint256 _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _mintFee
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(_amount0 * _amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = Math.min((_amount0 * _totalSupply) / _reserve0, (_amount1 * _totalSupply) / _reserve1);
        }
        require(liquidity > 0, "BaseV1: ILM"); // BaseV1: INSUFFICIENT_LIQUIDITY_MINTED
        _mint(to, liquidity);

        _update(_balance0, _balance1, _reserve0, _reserve1);
        emit Mint(msg.sender, _amount0, _amount1);
    }

    // this low-level function should be called from a contract which performs important safety checks
    // standard uniswap v2 implementation
    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        (uint256 _reserve0, uint256 _reserve1) = (reserve0, reserve1);
        (address _token0, address _token1) = (token0, token1);
        uint256 _balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 _balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 _liquidity = balanceOf[address(this)];

        uint256 _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _mintFee
        amount0 = (_liquidity * _balance0) / _totalSupply; // using balances ensures pro-rata distribution
        amount1 = (_liquidity * _balance1) / _totalSupply; // using balances ensures pro-rata distribution
        require(amount0 > 0 && amount1 > 0, "BaseV1: ILB"); // BaseV1: INSUFFICIENT_LIQUIDITY_BURNED
        _burn(address(this), _liquidity);
        IERC20(_token0).safeTransfer(to, amount0);
        IERC20(_token1).safeTransfer(to, amount1);
        _balance0 = IERC20(_token0).balanceOf(address(this));
        _balance1 = IERC20(_token1).balanceOf(address(this));

        _update(_balance0, _balance1, _reserve0, _reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external override nonReentrant {
        require(!IFactory(factory).paused(address(this)), "Paused");
        require(amount0Out > 0 || amount1Out > 0, "BaseV1: IOA"); // BaseV1: INSUFFICIENT_OUTPUT_AMOUNT
        (uint256 _reserve0, uint256 _reserve1) = (reserve0, reserve1);
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "BaseV1: IL"); // BaseV1: INSUFFICIENT_LIQUIDITY

        uint256 _balance0;
        uint256 _balance1;
        {
            // scope for _token{0,1}, avoids stack too deep errors
            (address _token0, address _token1) = (token0, token1);
            require(to != _token0 && to != _token1, "BaseV1: IT"); // BaseV1: INVALID_TO
            if (amount0Out > 0) IERC20(_token0).safeTransfer(to, amount0Out); // optimistically transfer tokens
            if (amount1Out > 0) IERC20(_token1).safeTransfer(to, amount1Out); // optimistically transfer tokens
            if (data.length > 0) ICallee(to).hook(msg.sender, amount0Out, amount1Out, data); // callback, used for flash loans
            _balance0 = IERC20(_token0).balanceOf(address(this));
            _balance1 = IERC20(_token1).balanceOf(address(this));
        }
        uint256 amount0In = _balance0 > _reserve0 - amount0Out ? _balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = _balance1 > _reserve1 - amount1Out ? _balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "IIA"); // BaseV1: INSUFFICIENT_INPUT_AMOUNT
        {
            // scope for reserve{0,1}Adjusted, avoids stack too deep errors
            (address _token0, address _token1) = (token0, token1);
            if (amount0In > 0) _update0((amount0In * swapFee) / BASE_FEE); // accrue fees for token0 and move them out of pool
            if (amount1In > 0) _update1((amount1In * swapFee) / BASE_FEE); // accrue fees for token1 and move them out of pool
            _balance0 = IERC20(_token0).balanceOf(address(this)); // since we removed tokens, we need to reconfirm balances, can also simply use previous balance - amountIn/ 10000, but doing balanceOf again as safety check
            _balance1 = IERC20(_token1).balanceOf(address(this));
            // The curve, either x3y+y3x for stable pools, or x*y for volatile pools
            require(_k(_balance0, _balance1) >= _k(_reserve0, _reserve1), "BaseV1: K"); // BaseV1: K
        }

        _update(_balance0, _balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @dev force balances to match reserves
    function skim(address to) external nonReentrant {
        (address _token0, address _token1) = (token0, token1);
        IERC20(_token0).safeTransfer(to, IERC20(_token0).balanceOf(address(this)) - (reserve0));
        IERC20(_token1).safeTransfer(to, IERC20(_token1).balanceOf(address(this)) - (reserve1));
    }

    // force reserves to match balances
    function sync() external nonReentrant {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)), reserve0, reserve1);
    }

    // function _f(uint256 x0, uint256 y) internal pure returns (uint256) {
    //     return (x0 * ((((y * y) / 1e18) * y) / 1e18)) / 1e18 + (((((x0 * x0) / 1e18) * x0) / 1e18) * y) / 1e18;
    // }

    // function _d(uint256 x0, uint256 y) internal pure returns (uint256) {
    //     return (3 * x0 * ((y * y) / 1e18)) / 1e18 + ((((x0 * x0) / 1e18) * x0) / 1e18);
    // }

    // function _get_y(
    //     uint256 x0,
    //     uint256 xy,
    //     uint256 y
    // ) internal pure returns (uint256) {
    //     for (uint256 i = 0; i < 255; i++) {
    //         uint256 y_prev = y;
    //         uint256 k = _f(x0, y);
    //         if (k < xy) {
    //             uint256 dy = ((xy - k) * 1e18) / _d(x0, y);
    //             y = y + dy;
    //         } else {
    //             uint256 dy = ((k - xy) * 1e18) / _d(x0, y);
    //             y = y - dy;
    //         }
    //         if (y > y_prev) {
    //             if (y - y_prev <= 1) {
    //                 return y;
    //             }
    //         } else {
    //             if (y_prev - y <= 1) {
    //                 return y;
    //             }
    //         }
    //     }
    //     return y;
    // }

    function getAmountOut(uint256 amountIn, address tokenIn) external view override returns (uint256) {
        (uint256 _reserve0, uint256 _reserve1) = (reserve0, reserve1);
        amountIn -= ((amountIn * swapFee) / BASE_FEE); // remove fee from amount received
        return _getAmountOut(amountIn, tokenIn, _reserve0, _reserve1);
    }

    function _getAmountOut(uint256 amountIn, address tokenIn, uint256 _reserve0, uint256 _reserve1) internal view returns (uint256) {
        if (stable) {
            uint256 xy = _k(_reserve0, _reserve1);
            _reserve0 = (_reserve0 * 1e18) / decimals0;
            _reserve1 = (_reserve1 * 1e18) / decimals1;
            (uint256 reserveA, uint256 reserveB) = tokenIn == token0 ? (_reserve0, _reserve1) : (_reserve1, _reserve0);
            amountIn = tokenIn == token0 ? (amountIn * 1e18) / decimals0 : (amountIn * 1e18) / decimals1;
            uint256 y = reserveB - (SatinLibrary._get_y(amountIn + reserveA, xy, reserveB));
            return (y * (tokenIn == token0 ? decimals1 : decimals0)) / 1e18;
        } else {
            (uint256 reserveA, uint256 reserveB) = tokenIn == token0 ? (_reserve0, _reserve1) : (_reserve1, _reserve0);
            return (amountIn * reserveB) / (reserveA + amountIn);
        }
    }

    function _k(uint256 x, uint256 y) internal view returns (uint256) {
        if (stable) {
            uint256 _x = (x * 1e18) / decimals0;
            uint256 _y = (y * 1e18) / decimals1;
            uint256 _a = (_x * _y) / 1e18;
            uint256 _b = ((_x * _x) / 1e18 + (_y * _y) / 1e18);
            return (_a * _b) / 1e18; // x3y+y3x >= k
        } else {
            return x * y; // xy >= k
        }
    }

    function _mint(address dst, uint256 amount) internal {
        _updateFor(dst); // balances must be updated on mint/burn/transfer
        totalSupply += amount;
        balanceOf[dst] += amount;
        emit Transfer(address(0), dst, amount);
    }

    function _burn(address dst, uint256 amount) internal {
        _updateFor(dst);
        totalSupply -= amount;
        balanceOf[dst] -= amount;
        emit Transfer(dst, address(0), amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;

        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        require(deadline >= block.timestamp, "BaseV1: EXP"); //EXPIRED
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))));
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner, "BaseV1: INVALID_SIGNATURE");
        allowance[owner][spender] = value;

        emit Approval(owner, spender, value);
    }

    function transfer(address dst, uint256 amount) external returns (bool) {
        _transferTokens(msg.sender, dst, amount);
        return true;
    }

    function transferFrom(address src, address dst, uint256 amount) external returns (bool) {
        address spender = msg.sender;
        uint256 spenderAllowance = allowance[src][spender];

        if (spender != src && spenderAllowance != type(uint256).max) {
            uint256 newAllowance = spenderAllowance - amount;
            allowance[src][spender] = newAllowance;

            emit Approval(src, spender, newAllowance);
        }

        _transferTokens(src, dst, amount);
        return true;
    }

    function _transferTokens(address src, address dst, uint256 amount) internal {
        _updateFor(src); // update fee position for src
        _updateFor(dst); // update fee position for dst

        balanceOf[src] -= amount;
        balanceOf[dst] += amount;

        emit Transfer(src, dst, amount);
    }

    function newFunction() external pure returns (uint32) {
        return 1234;
    }
}
