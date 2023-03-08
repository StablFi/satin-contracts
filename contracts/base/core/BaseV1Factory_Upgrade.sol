//SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "../../interface/IFactory.sol";
import "../helper/ProxyFactory.sol";
import "./BaseV1Pair.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract BaseV1Factory_Upgrade is Initializable, IFactory {
    address public pauser;
    address public pendingPauser;
    address public treasury;

    //Token0address => Token1address => Stable = pairAddress
    mapping(address => mapping(address => mapping(bool => address))) public getPair;
    address[] public allPairs;
    mapping(address => bool) public isPair; // simplified check if its a pair, given that `stable` flag might not be available in peripherals

    mapping(address => bool) public override paused;

    address private poolImplementation;
    address private proxyAdmin;

    event PairCreated(address indexed token0, address indexed token1, bool stable, address pair, uint256);

    function initialize(address _treasury, address _proxyAdmin, address _poolImplementation) public initializer {
        poolImplementation = _poolImplementation;
        proxyAdmin = _proxyAdmin;
        pauser = msg.sender;
        treasury = _treasury;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function setPauser(address _pauser) external {
        require(msg.sender == pauser, "BaseV1: !P"); //NOT PAUSER
        pendingPauser = _pauser;
    }

    function acceptPauser() external {
        require(msg.sender == pendingPauser, "BaseV1: !PP"); //NOT PENDING PAUSER
        pauser = pendingPauser;
    }

    function setPause(address _pool, bool _state) external {
        require(msg.sender == pauser, "BaseV1: !P"); //NOT PAUSER
        paused[_pool] = _state;
    }

    function setSwapFee(address pair, uint256 value) external {
        require(msg.sender == pauser, "BaseV1: !P"); //NOT PAUSER
        BaseV1Pair(pair).setSwapFee(value);
    }

    function setPartnerAddresses(address pair, address[] calldata _partnerAddresses) external {
        require(msg.sender == pauser, "BaseV1: !P"); //NOT PAUSER
        BaseV1Pair(pair).setPartnerAddresses(_partnerAddresses);
    }

    function setIfPriorityPair(address pair, bool _ifPriority) external {
        require(msg.sender == pauser, "BaseV1: !P"); //NOT PAUSER
        BaseV1Pair(pair).setIsPriorityPair(_ifPriority);
    }

    function pairCodeHash() external pure returns (bytes32) {
        return keccak256(type(BaseV1Pair).creationCode);
    }

    function createPair(address tokenA, address tokenB, bool stable) external returns (address pair) {
        require(tokenA != tokenB, "BaseV1: IA"); // BaseV1: IDENTICAL_ADDRESSES
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "BaseV1: ZA"); // BaseV1: ZERO_ADDRESS
        require(getPair[token0][token1][stable] == address(0), "BaseV1: PE"); // BaseV1: PAIR_EXISTS - single check is sufficient
        bytes memory payload = abi.encodeWithSelector(BaseV1Pair.initialize.selector, token0, token1, stable);
        bytes memory salt = abi.encodePacked(token0, token1, stable); // notice salt includes stable as well, 3 parameters
        pair = ProxyFactory.createTransparentProxy(poolImplementation, proxyAdmin, payload, salt);
        getPair[token0][token1][stable] = pair;
        getPair[token1][token0][stable] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        isPair[pair] = true;
        emit PairCreated(token0, token1, stable, pair, allPairs.length);
    }

    function newFunction() external pure returns (uint32) {
        return 1234;
    }
}
