// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "contracts/interface/IBribeFactory.sol";
import "./InternalBribe.sol";
import "./ExternalBribe.sol";
import "../helper/ProxyFactory.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "hardhat/console.sol";

contract BribeFactory_Upgrade is Initializable, IBribeFactory {
    address public last_internal_bribe;
    address public last_external_bribe;

    address private internalBribeImplementationAddress;
    address private externalBribeImplementationAddress;

    address private proxyAdmin;

    function initialize(address _proxyAdmin, address _internalBribeImplementationAddress, address _externalBribeImplementationAddress) public initializer {
        proxyAdmin = _proxyAdmin;
        internalBribeImplementationAddress = _internalBribeImplementationAddress;
        externalBribeImplementationAddress = _externalBribeImplementationAddress;
    }

    function createInternalBribe(address[] memory allowedRewards) external returns (address) {
        bytes memory salt = abi.encodePacked(msg.sender, allowedRewards);
        bytes memory payload = abi.encodeWithSelector(InternalBribe.initialize.selector, msg.sender, allowedRewards);
        last_internal_bribe = ProxyFactory.createTransparentProxy(internalBribeImplementationAddress, proxyAdmin, payload, salt);
        return last_internal_bribe;
    }

    function createExternalBribe(address[] memory allowedRewards) external returns (address) {
        bytes memory salt = abi.encodePacked(msg.sender, allowedRewards);
        bytes memory payload = abi.encodeWithSelector(ExternalBribe.initialize.selector, msg.sender, allowedRewards);
        last_external_bribe = ProxyFactory.createTransparentProxy(externalBribeImplementationAddress, proxyAdmin, payload, salt);
        return last_external_bribe;
    }

    function newFunction() external pure returns (uint32) {
        return 1234;
    }
}
