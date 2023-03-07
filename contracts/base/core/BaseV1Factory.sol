//SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "../../interface/IFactory.sol";
import "./BaseV1Pair.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract BaseV1Factory is IFactory, Initializable {
    address public pauser;
    address public pendingPauser;
    address public treasury;

    //Token0address => Token1address => Stable = pairAddress
    mapping(address => mapping(address => mapping(bool => address))) public getPair;
    address[] public allPairs;
    mapping(address => bool) public isPair; // simplified check if its a pair, given that `stable` flag might not be available in peripherals

    address internal lastToken0;
    address internal lastToken1;
    bool internal lastIsStable;
    mapping(address => bool) public override paused;

    event PairCreated(address indexed token0, address indexed token1, bool stable, address pair, uint256);

    function initialize(address _treasury) public initializer {
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

    function getInitializable() external view returns (address, address, bool) {
        return (lastToken0, lastToken1, lastIsStable);
    }

    function createPair(address tokenA, address tokenB, bool stable) external returns (address pair) {
        require(tokenA != tokenB, "BaseV1: IA"); // BaseV1: IDENTICAL_ADDRESSES
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "BaseV1: ZA"); // BaseV1: ZERO_ADDRESS
        require(getPair[token0][token1][stable] == address(0), "BaseV1: PE"); // BaseV1: PAIR_EXISTS - single check is sufficient
        bytes32 salt = keccak256(abi.encodePacked(token0, token1, stable)); // notice salt includes stable as well, 3 parameters
        (lastToken0, lastToken1, lastIsStable) = (token0, token1, stable);
        pair = address(new BaseV1Pair{salt: salt}());
        getPair[token0][token1][stable] = pair;
        getPair[token1][token0][stable] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        isPair[pair] = true;
        emit PairCreated(token0, token1, stable, pair, allPairs.length);
    }
}
