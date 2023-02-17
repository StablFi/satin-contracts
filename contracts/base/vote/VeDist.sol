// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "../../lib/Math.sol";
import "../../interface/IERC20.sol";
import "../../interface/IVeDist.sol";
import "../../interface/IVe.sol";
import "../../lib/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract VeDist is IVeDist, Initializable {
    using SafeERC20 for IERC20;

    event CheckpointToken(uint time, uint tokens);

    event Claimed(uint tokenId, uint amount, uint claimEpoch, uint maxEpoch);

    struct ClaimCalculationResult {
        uint toDistribute;
        uint userEpoch;
        uint weekCursor;
        uint maxUserEpoch;
        bool success;
    }

    uint constant WEEK = 7 * 86400;

    uint public startTime;
    uint public timeCursor;
    uint public minLockDurationForReward;
    mapping(uint => uint) public timeCursorOf;
    mapping(uint => uint) public userEpochOf;

    uint public lastTokenTime;
    uint[1000000000000000] public tokensPerWeek;

    address public votingEscrow;
    address public token;
    uint public tokenLastBalance;

    uint[1000000000000000] public veSupply;

    address public depositor;
    address public owner;

    // constructor(address _votingEscrow, address token_) {
    // uint _t = (block.timestamp / WEEK) * WEEK;
    // startTime = _t;
    // lastTokenTime = _t;
    // timeCursor = _t;
    // address _token = token_;
    // token = _token;
    // votingEscrow = _votingEscrow;
    // depositor = msg.sender;
    // IERC20(_token).safeIncreaseAllowance(_votingEscrow, type(uint).max);
    // }

    function initialize(address _votingEscrow, address token_) public initializer {
        uint _t = (block.timestamp / WEEK) * WEEK;
        startTime = _t;
        lastTokenTime = _t;
        timeCursor = _t;
        address _token = token_;
        token = _token;
        votingEscrow = _votingEscrow;
        depositor = msg.sender;
        owner = msg.sender;
        minLockDurationForReward = 6 * 30 * 86400;
        IERC20(_token).safeIncreaseAllowance(_votingEscrow, type(uint).max);
    }

    function timestamp() external view returns (uint) {
        return (block.timestamp / WEEK) * WEEK;
    }

    function setMinLockDurationForReward(uint _minLockDurationForReward) external {
        require(msg.sender == owner);
        minLockDurationForReward = _minLockDurationForReward;
    }

    function _checkpointToken() internal {
        uint tokenBalance = IERC20(token).balanceOf(address(this));
        uint toDistribute = tokenBalance - tokenLastBalance;
        tokenLastBalance = tokenBalance;

        uint t = lastTokenTime;
        uint sinceLast = block.timestamp - t;
        lastTokenTime = block.timestamp;
        uint thisWeek = (t / WEEK) * WEEK;
        uint nextWeek = 0;

        for (uint i = 0; i < 20; i++) {
            nextWeek = thisWeek + WEEK;
            if (block.timestamp < nextWeek) {
                tokensPerWeek[thisWeek] += _adjustToDistribute(
                    toDistribute,
                    block.timestamp,
                    t,
                    sinceLast
                );
                break;
            } else {
                tokensPerWeek[thisWeek] += _adjustToDistribute(
                    toDistribute,
                    nextWeek,
                    t,
                    sinceLast
                );
            }
            t = nextWeek;
            thisWeek = nextWeek;
        }
        emit CheckpointToken(block.timestamp, toDistribute);
    }

    /// @dev For testing purposes.
    function adjustToDistribute(
        uint toDistribute,
        uint t0,
        uint t1,
        uint sinceLastCall
    ) external pure returns (uint) {
        return _adjustToDistribute(toDistribute, t0, t1, sinceLastCall);
    }

    function _adjustToDistribute(
        uint toDistribute,
        uint t0,
        uint t1,
        uint sinceLast
    ) internal pure returns (uint) {
        if (t0 <= t1 || t0 - t1 == 0 || sinceLast == 0) {
            return toDistribute;
        }
        return (toDistribute * (t0 - t1)) / sinceLast;
    }

    function checkpointToken() external override {
        require(msg.sender == depositor, "!depositor");
        _checkpointToken();
    }

    function _findTimestampEpoch(address ve, uint _timestamp) internal view returns (uint) {
        uint _min = 0;
        uint _max = IVe(ve).epoch();
        for (uint i = 0; i < 128; i++) {
            if (_min >= _max) break;
            uint _mid = (_min + _max + 2) / 2;
            IVe.Point memory pt = IVe(ve).pointHistory(_mid);
            if (pt.ts <= _timestamp) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }
        return _min;
    }

    function findTimestampUserEpoch(
        address ve,
        uint tokenId,
        uint _timestamp,
        uint maxUserEpoch
    ) external view returns (uint) {
        return _findTimestampUserEpoch(ve, tokenId, _timestamp, maxUserEpoch);
    }

    function _findTimestampUserEpoch(
        address ve,
        uint tokenId,
        uint _timestamp,
        uint maxUserEpoch
    ) internal view returns (uint) {
        uint _min = 0;
        uint _max = maxUserEpoch;
        for (uint i = 0; i < 128; i++) {
            if (_min >= _max) break;
            uint _mid = (_min + _max + 2) / 2;
            IVe.Point memory pt = IVe(ve).userPointHistory(tokenId, _mid);
            if (pt.ts <= _timestamp) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }
        return _min;
    }

    function veForAt(uint _tokenId, uint _timestamp) external view returns (uint) {
        address ve = votingEscrow;
        uint maxUserEpoch = IVe(ve).userPointEpoch(_tokenId);
        uint epoch = _findTimestampUserEpoch(ve, _tokenId, _timestamp, maxUserEpoch);
        IVe.Point memory pt = IVe(ve).userPointHistory(_tokenId, epoch);
        return
            uint(
                int256(
                    Math.positiveInt128(pt.bias - pt.slope * (int128(int256(_timestamp - pt.ts))))
                )
            );
    }

    function _checkpointTotalSupply() internal {
        address ve = votingEscrow;
        uint t = timeCursor;
        uint roundedTimestamp = (block.timestamp / WEEK) * WEEK;
        IVe(ve).checkpoint();

        // assume will be called more frequently than 20 weeks
        for (uint i = 0; i < 20; i++) {
            if (t > roundedTimestamp) {
                break;
            } else {
                uint epoch = _findTimestampEpoch(ve, t);
                IVe.Point memory pt = IVe(ve).pointHistory(epoch);
                veSupply[t] = _adjustVeSupply(t, pt.ts, pt.bias, pt.slope);
            }
            t += WEEK;
        }
        timeCursor = t;
    }

    function adjustVeSupply(
        uint t,
        uint ptTs,
        int128 ptBias,
        int128 ptSlope
    ) external pure returns (uint) {
        return _adjustVeSupply(t, ptTs, ptBias, ptSlope);
    }

    function _adjustVeSupply(
        uint t,
        uint ptTs,
        int128 ptBias,
        int128 ptSlope
    ) internal pure returns (uint) {
        if (t < ptTs) {
            return 0;
        }
        int128 dt = int128(int256(t - ptTs));
        if (ptBias < ptSlope * dt) {
            return 0;
        }
        return uint(int256(Math.positiveInt128(ptBias - ptSlope * dt)));
    }

    function checkpointTotalSupply() external override {
        _checkpointTotalSupply();
    }

    function _claim(uint _tokenId, address ve, uint _lastTokenTime) internal returns (uint) {
        ClaimCalculationResult memory result = _calculateClaim(_tokenId, ve, _lastTokenTime);
        if (result.success) {
            userEpochOf[_tokenId] = result.userEpoch;
            timeCursorOf[_tokenId] = result.weekCursor;
            emit Claimed(_tokenId, result.toDistribute, result.userEpoch, result.maxUserEpoch);
        }
        return result.toDistribute;
    }

    function _calculateClaim(
        uint _tokenId,
        address ve,
        uint _lastTokenTime
    ) internal view returns (ClaimCalculationResult memory) {
        uint userEpoch;
        uint toDistribute;
        uint maxUserEpoch = IVe(ve).userPointEpoch(_tokenId);
        uint lockEndTime = IVe(ve).lockedEnd(_tokenId);
        uint _startTime = startTime;

        if (maxUserEpoch == 0) {
            return ClaimCalculationResult(0, 0, 0, 0, false);
        }

        uint weekCursor = timeCursorOf[_tokenId];

        if (weekCursor == 0) {
            userEpoch = _findTimestampUserEpoch(ve, _tokenId, _startTime, maxUserEpoch);
        } else {
            userEpoch = userEpochOf[_tokenId];
        }

        if (userEpoch == 0) userEpoch = 1;

        IVe.Point memory userPoint = IVe(ve).userPointHistory(_tokenId, userEpoch);
        if (weekCursor == 0) {
            weekCursor = ((userPoint.ts + WEEK - 1) / WEEK) * WEEK;
        }
        if (weekCursor >= lastTokenTime) {
            return ClaimCalculationResult(0, 0, 0, 0, false);
        }
        if (weekCursor < _startTime) {
            weekCursor = _startTime;
        }

        IVe.Point memory oldUserPoint;
        {
            for (uint i = 0; i < 50; i++) {
                if (weekCursor >= _lastTokenTime) {
                    break;
                }
                if (weekCursor >= userPoint.ts && userEpoch <= maxUserEpoch) {
                    userEpoch += 1;
                    oldUserPoint = userPoint;
                    if (userEpoch > maxUserEpoch) {
                        userPoint = IVe.Point(0, 0, 0, 0);
                    } else {
                        userPoint = IVe(ve).userPointHistory(_tokenId, userEpoch);
                    }
                } else {
                    int128 dt = int128(int256(weekCursor - oldUserPoint.ts));
                    uint balanceOf = uint(
                        int256(Math.positiveInt128(oldUserPoint.bias - dt * oldUserPoint.slope))
                    );
                    if (balanceOf == 0 && userEpoch > maxUserEpoch) {
                        break;
                    }
                    if ((lockEndTime - oldUserPoint.ts) > (minLockDurationForReward)) {
                        toDistribute +=
                            (balanceOf * tokensPerWeek[weekCursor]) /
                            veSupply[weekCursor];
                        weekCursor += WEEK;
                    }
                }
            }
        }
        return
            ClaimCalculationResult(
                toDistribute,
                Math.min(maxUserEpoch, userEpoch - 1),
                weekCursor,
                maxUserEpoch,
                true
            );
    }

    function claimable(uint _tokenId) external view returns (uint) {
        uint _lastTokenTime = (lastTokenTime / WEEK) * WEEK;
        ClaimCalculationResult memory result = _calculateClaim(
            _tokenId,
            votingEscrow,
            _lastTokenTime
        );
        return result.toDistribute;
    }

    function claim(uint _tokenId) external returns (uint) {
        if (block.timestamp >= timeCursor) _checkpointTotalSupply();
        uint _lastTokenTime = lastTokenTime;
        _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
        uint amount = _claim(_tokenId, votingEscrow, _lastTokenTime);
        if (amount != 0) {
            IERC20(token).safeTransfer(IVe(votingEscrow).ownerOf(_tokenId), amount);
            tokenLastBalance -= amount;
        }
        return amount;
    }

    function claimMany(uint[] memory _tokenIds) external returns (bool) {
        if (block.timestamp >= timeCursor) _checkpointTotalSupply();
        uint _lastTokenTime = lastTokenTime;
        _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
        address _votingEscrow = votingEscrow;
        uint total = 0;

        for (uint i = 0; i < _tokenIds.length; i++) {
            uint _tokenId = _tokenIds[i];
            if (_tokenId == 0) break;
            uint amount = _claim(_tokenId, _votingEscrow, _lastTokenTime);
            if (amount != 0) {
                IERC20(token).safeTransfer(IVe(_votingEscrow).ownerOf(_tokenId), amount);
                total += amount;
            }
        }
        if (total != 0) {
            tokenLastBalance -= total;
        }

        return true;
    }

    // Once off event on contract initialize
    function setDepositor(address _depositor) external {
        require(msg.sender == depositor, "!depositor");
        depositor = _depositor;
    }
}
