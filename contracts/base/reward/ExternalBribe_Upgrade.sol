// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "../../lib/Math.sol";
import "contracts/interface/IBribe.sol";
import "contracts/interface/IERC20.sol";
import "contracts/interface/IGauge.sol";
import "contracts/interface/IVoter.sol";
import "contracts/interface/IVe.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// Bribes pay out rewards for a given pool based on the votes that were received from the user (goes hand in hand with Voter.vote())
contract ExternalBribe_Upgrade is Initializable, IBribe {
    address public voter; // only voter can modify balances (since it only happens on vote())
    address public _ve; // 天使のたまご

    uint internal DURATION; // rewards are released over the voting period
    uint internal MAX_REWARD_TOKENS;

    uint internal PRECISION;

    // simple re-entrancy check
    uint internal _unlocked;

    uint public totalSupply;
    mapping(uint => uint) public balanceOf;
    mapping(address => mapping(uint => uint)) public tokenRewardsPerEpoch;
    mapping(address => uint) public periodFinish;
    mapping(address => mapping(uint => uint)) public lastEarn;

    address[] public rewards;
    mapping(address => bool) public isReward;

    /// @notice A checkpoint for marking balance
    struct Checkpoint {
        uint timestamp;
        uint balanceOf;
    }

    /// @notice A checkpoint for marking supply
    struct SupplyCheckpoint {
        uint timestamp;
        uint supply;
    }

    /// @notice A record of balance checkpoints for each account, by index
    mapping(uint => mapping(uint => Checkpoint)) public checkpoints;
    /// @notice The number of checkpoints for each account
    mapping(uint => uint) public numCheckpoints;
    /// @notice A record of balance checkpoints for each token, by index
    mapping(uint => SupplyCheckpoint) public supplyCheckpoints;
    /// @notice The number of checkpoints
    uint public supplyNumCheckpoints;

    event Deposit(address indexed from, uint tokenId, uint amount);
    event Withdraw(address indexed from, uint tokenId, uint amount);
    event NotifyReward(address indexed from, address indexed reward, uint epoch, uint amount);
    event ClaimRewards(address indexed from, address indexed reward, uint amount);

    function initialize(address _voter, address[] memory _allowedRewardTokens) public initializer {
        _setInitialValues();

        voter = _voter;
        _ve = IVoter(_voter).ve();

        for (uint i; i < _allowedRewardTokens.length; ++i) {
            if (_allowedRewardTokens[i] != address(0)) {
                isReward[_allowedRewardTokens[i]] = true;
                rewards.push(_allowedRewardTokens[i]);
            }
        }
    }

    function _setInitialValues() private {
        _unlocked = 1;
        DURATION = 7 days;
        MAX_REWARD_TOKENS = 16;
        PRECISION = 10 ** 18;
    }

    // simple re-entrancy check
    modifier lock() {
        require(_unlocked == 1);
        _unlocked = 2;
        _;
        _unlocked = 1;
    }

    function _bribeStart(uint timestamp) internal pure returns (uint) {
        return timestamp - (timestamp % (7 days));
    }

    function getEpochStart(uint timestamp) public view returns (uint) {
        uint bribeStart = _bribeStart(timestamp);
        uint bribeEnd = bribeStart + DURATION;
        return timestamp < bribeEnd ? bribeStart : bribeStart + 7 days;
    }

    /**
     * @notice Determine the prior balance for an account as of a block number
     * @dev Block number must be a finalized block or else this function will revert to prevent misinformation.
     * @param tokenId The token of the NFT to check
     * @param timestamp The timestamp to get the balance at
     * @return The balance the account had as of the given block
     */
    function getPriorBalanceIndex(uint tokenId, uint timestamp) public view returns (uint) {
        uint nCheckpoints = numCheckpoints[tokenId];
        if (nCheckpoints == 0) {
            return 0;
        }
        // First check most recent balance
        if (checkpoints[tokenId][nCheckpoints - 1].timestamp <= timestamp) {
            return (nCheckpoints - 1);
        }
        // Next check implicit zero balance
        if (checkpoints[tokenId][0].timestamp > timestamp) {
            return 0;
        }

        uint lower = 0;
        uint upper = nCheckpoints - 1;
        while (upper > lower) {
            uint center = upper - (upper - lower) / 2; // ceil, avoiding overflow
            Checkpoint memory cp = checkpoints[tokenId][center];
            if (cp.timestamp == timestamp) {
                return center;
            } else if (cp.timestamp < timestamp) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return lower;
    }

    function getPriorSupplyIndex(uint timestamp) public view returns (uint) {
        uint nCheckpoints = supplyNumCheckpoints;
        if (nCheckpoints == 0) {
            return 0;
        }

        // First check most recent balance
        if (supplyCheckpoints[nCheckpoints - 1].timestamp <= timestamp) {
            return (nCheckpoints - 1);
        }

        // Next check implicit zero balance
        if (supplyCheckpoints[0].timestamp > timestamp) {
            return 0;
        }

        uint lower = 0;
        uint upper = nCheckpoints - 1;
        while (upper > lower) {
            uint center = upper - (upper - lower) / 2; // ceil, avoiding overflow
            SupplyCheckpoint memory cp = supplyCheckpoints[center];
            if (cp.timestamp == timestamp) {
                return center;
            } else if (cp.timestamp < timestamp) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return lower;
    }

    function _writeCheckpoint(uint tokenId, uint balance) internal {
        uint _timestamp = block.timestamp;
        uint _nCheckPoints = numCheckpoints[tokenId];
        if (_nCheckPoints > 0 && checkpoints[tokenId][_nCheckPoints - 1].timestamp == _timestamp) {
            checkpoints[tokenId][_nCheckPoints - 1].balanceOf = balance;
        } else {
            checkpoints[tokenId][_nCheckPoints] = Checkpoint(_timestamp, balance);
            numCheckpoints[tokenId] = _nCheckPoints + 1;
        }
    }

    function _writeSupplyCheckpoint() internal {
        uint _nCheckPoints = supplyNumCheckpoints;
        uint _timestamp = block.timestamp;

        if (_nCheckPoints > 0 && supplyCheckpoints[_nCheckPoints - 1].timestamp == _timestamp) {
            supplyCheckpoints[_nCheckPoints - 1].supply = totalSupply;
        } else {
            supplyCheckpoints[_nCheckPoints] = SupplyCheckpoint(_timestamp, totalSupply);
            supplyNumCheckpoints = _nCheckPoints + 1;
        }
    }

    function rewardsListLength() external view returns (uint) {
        return rewards.length;
    }

    // returns the last time the reward was modified or periodFinish if the reward has ended
    function lastTimeRewardApplicable(address token) public view returns (uint) {
        return Math.min(block.timestamp, periodFinish[token]);
    }

    // allows a user to claim rewards for a given token
    function getReward(uint tokenId, address[] memory tokens) external lock {
        require(IVe(_ve).isApprovedOrOwner(msg.sender, tokenId));
        for (uint i = 0; i < tokens.length; i++) {
            uint _reward = earned(tokens[i], tokenId);
            lastEarn[tokens[i]][tokenId] = block.timestamp;
            if (_reward > 0) _safeTransfer(tokens[i], msg.sender, _reward);

            emit ClaimRewards(msg.sender, tokens[i], _reward);
        }
    }

    // used by Voter to allow batched reward claims
    function getRewardForOwner(uint tokenId, address[] memory tokens) external lock {
        require(msg.sender == voter);
        address _owner = IVe(_ve).ownerOf(tokenId);
        for (uint i = 0; i < tokens.length; i++) {
            uint _reward = earned(tokens[i], tokenId);
            lastEarn[tokens[i]][tokenId] = block.timestamp;
            if (_reward > 0) _safeTransfer(tokens[i], _owner, _reward);

            emit ClaimRewards(_owner, tokens[i], _reward);
        }
    }

    function earned(address token, uint tokenId) public view returns (uint) {
        uint _startTimestamp = lastEarn[token][tokenId];
        if (numCheckpoints[tokenId] == 0) {
            return 0;
        }

        uint _startIndex = getPriorBalanceIndex(tokenId, _startTimestamp);
        uint _endIndex = numCheckpoints[tokenId] - 1;

        uint reward = 0;
        // you only earn once per epoch (after it's over)
        Checkpoint memory prevRewards; // reuse struct to avoid stack too deep
        prevRewards.timestamp = _bribeStart(_startTimestamp);
        uint _prevSupply = 1;

        if (_endIndex > 0) {
            for (uint i = _startIndex; i <= _endIndex - 1; i++) {
                Checkpoint memory cp0 = checkpoints[tokenId][i];
                uint _nextEpochStart = _bribeStart(cp0.timestamp);
                // check that you've earned it
                // this won't happen until a week has passed
                if (_nextEpochStart > prevRewards.timestamp) {
                    reward += prevRewards.balanceOf;
                }

                prevRewards.timestamp = _nextEpochStart;
                _prevSupply = supplyCheckpoints[getPriorSupplyIndex(_nextEpochStart + DURATION)].supply;
                prevRewards.balanceOf = (cp0.balanceOf * tokenRewardsPerEpoch[token][_nextEpochStart]) / _prevSupply;
            }
        }

        Checkpoint memory cp = checkpoints[tokenId][_endIndex];
        uint _lastEpochStart = _bribeStart(cp.timestamp);
        uint _lastEpochEnd = _lastEpochStart + DURATION;

        if (block.timestamp > _lastEpochEnd) {
            reward += (cp.balanceOf * tokenRewardsPerEpoch[token][_lastEpochStart]) / supplyCheckpoints[getPriorSupplyIndex(_lastEpochEnd)].supply;
        }

        return reward;
    }

    // This is an external function, but internal notation is used since it can only be called "internally" from Gauges
    function _deposit(uint amount, uint tokenId) external {
        require(msg.sender == voter);

        totalSupply += amount;
        balanceOf[tokenId] += amount;

        _writeCheckpoint(tokenId, balanceOf[tokenId]);
        _writeSupplyCheckpoint();

        emit Deposit(msg.sender, tokenId, amount);
    }

    function _withdraw(uint amount, uint tokenId) external {
        require(msg.sender == voter);

        totalSupply -= amount;
        balanceOf[tokenId] -= amount;

        _writeCheckpoint(tokenId, balanceOf[tokenId]);
        _writeSupplyCheckpoint();

        emit Withdraw(msg.sender, tokenId, amount);
    }

    function left(address token) external view returns (uint) {
        uint adjustedTstamp = getEpochStart(block.timestamp);
        return tokenRewardsPerEpoch[token][adjustedTstamp];
    }

    function notifyRewardAmount(address token, uint amount) external lock {
        require(amount > 0);
        if (!isReward[token]) {
            require(IVoter(voter).isWhitelisted(token), "bribe tokens must be whitelisted");
            require(rewards.length < MAX_REWARD_TOKENS, "too many rewards tokens");
        }
        // bribes kick in at the start of next bribe period
        uint adjustedTstamp = getEpochStart(block.timestamp);
        uint epochRewards = tokenRewardsPerEpoch[token][adjustedTstamp];

        _safeTransferFrom(token, msg.sender, address(this), amount);
        tokenRewardsPerEpoch[token][adjustedTstamp] = epochRewards + amount;

        periodFinish[token] = adjustedTstamp + DURATION;

        if (!isReward[token]) {
            isReward[token] = true;
            rewards.push(token);
        }

        emit NotifyReward(msg.sender, token, adjustedTstamp, amount);
    }

    function swapOutRewardToken(uint i, address oldToken, address newToken) external {
        require(msg.sender == IVe(_ve).VeOwner(), "only team");
        require(rewards[i] == oldToken);
        isReward[oldToken] = false;
        isReward[newToken] = true;
        rewards[i] = newToken;
    }

    function _safeTransfer(address token, address to, uint256 value) internal {
        require(token.code.length > 0);
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))));
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        require(token.code.length > 0);
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))));
    }

    function newFunction() external pure returns (uint32) {
        return 1234;
    }
}
