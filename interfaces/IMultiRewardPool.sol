interface IMultiRewardPool {
    function TOTAL_SATIN_REWARDS() external view returns (uint256);

    function addPool(
        uint256 _satinAllocPoint,
        address _token,
        bool _withUpdate,
        uint256 _lastSatinRewardTime
    ) external;

    function cash() external view returns (address);

    function cashEndTime() external view returns (uint256);

    function cashStartTime() external view returns (uint256);

    function claimAllPoolReward(uint256 pid) external;

    function claimAllReward() external;

    function deposit(uint256 pid, uint256 amount) external;

    function emergencyWithdraw(uint256 pid) external;

    function getCashReward(
        uint256 pid,
        uint256 _fromTime,
        uint256 _toTime
    ) external view returns (uint256);

    function getSatinReward(uint256 _fromTime, uint256 _toTime) external view returns (uint256);

    function governanceRecoverUnsupported(
        address _token,
        uint256 amount,
        address to
    ) external;

    function initSatinReward() external view returns (bool);

    function initialize(
        address _satin,
        address _cash,
        uint256 _satinStartTime
    ) external;

    function massUpdatePools() external;

    function notifyCashReward(
        uint256[] memory pids,
        uint256[] memory amounts,
        uint256 duration
    ) external;

    function notifyCashRewardOngoing(uint256[] memory pids, uint256[] memory amounts) external;

    function notifySatinReward() external;

    function operator() external view returns (address);

    function owner() external view returns (address);

    function pendingCashRewards(uint256 pid, address user) external view returns (uint256);

    function pendingSatinRewards(uint256 pid, address user) external view returns (uint256);

    function poolInfo(uint256)
        external
        view
        returns (
            address token,
            uint256 satinAllocPoint,
            uint256 accSatinPerShare,
            uint256 accCashPerShare,
            uint256 lastSatinRewardTime,
            uint256 lastCashRewardTime,
            bool isSatinStarted,
            uint256 cashPerSecond
        );

    function proxiableUUID() external view returns (bytes32);

    function renounceOwnership() external;

    function runningTime() external view returns (uint256);

    function satin() external view returns (address);

    function satinEndTime() external view returns (uint256);

    function satinPerSecond() external view returns (uint256);

    function satinStartTime() external view returns (uint256);

    function setAllocPoint(uint256 pid, uint256 _satinAllocPoint) external;

    function setOperator(address _operator) external;

    function totalSatinAllocPoint() external view returns (uint256);

    function transferOwnership(address newOwner) external;

    function updatePoolCash(uint256 pid) external;

    function updatePoolSatin(uint256 pid) external;

    function upgradeTo(address newImplementation) external;

    function upgradeToAndCall(address newImplementation, bytes memory data) external;

    function userInfo(uint256, address)
        external
        view
        returns (
            uint256 amount,
            uint256 satinRewardDebt,
            uint256 cashRewardDebt
        );

    function withdraw(uint256 pid, uint256 amount) external;
}
