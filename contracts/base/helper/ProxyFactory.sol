// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract ProxyFactory {
    event ProxyCreated(address proxy);

    function deployTransparent(
        address _logic,
        address _admin,
        bytes memory _data
    ) public returns (address) {
        bytes memory creationByteCode = getCreationBytecode(_logic, _admin, _data);
        TransparentUpgradeableProxy proxy = _deployTransparentProxy(creationByteCode);
        return address(proxy);
    }

    function getCreationBytecode(
        address _logic,
        address _admin,
        bytes memory _data
    ) public pure returns (bytes memory) {
        bytes memory bytecode = type(TransparentUpgradeableProxy).creationCode;
        return abi.encodePacked(bytecode, abi.encode(_logic, _admin, _data));
    }

    function _deployTransparentProxy(
        bytes memory _creationByteCode
    ) internal returns (TransparentUpgradeableProxy) {
        address payable addr;

        assembly {
            addr := create(0, add(_creationByteCode, 0x20), mload(_creationByteCode))
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }

        return TransparentUpgradeableProxy(addr);
    }
}
