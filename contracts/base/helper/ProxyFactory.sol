// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

library ProxyFactory {
    event ProxyCreated(address creator, address proxy);

    function createTransparentProxy(address logic, address proxyAdmin, bytes memory payload, bytes memory salt) external returns (address) {
        address proxy = deployTransparent(logic, proxyAdmin, payload, salt);
        emit ProxyCreated(msg.sender, proxy);
        return proxy;
    }

    function deployTransparent(address _logic, address _admin, bytes memory _data, bytes memory salt) private returns (address) {
        bytes memory creationByteCode = getCreationBytecode(_logic, _admin, _data);
        TransparentUpgradeableProxy proxy = _deployTransparentProxy(creationByteCode, salt);
        return address(proxy);
    }

    function getCreationBytecode(address _logic, address _admin, bytes memory _data) private pure returns (bytes memory) {
        bytes memory bytecode = type(TransparentUpgradeableProxy).creationCode;
        return abi.encodePacked(bytecode, abi.encode(_logic, _admin, _data));
    }

    function _deployTransparentProxy(bytes memory _creationByteCode, bytes memory salt) private returns (TransparentUpgradeableProxy) {
        address payable addr;
        assembly {
            addr := create2(0, add(_creationByteCode, 0x20), mload(_creationByteCode), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
        return TransparentUpgradeableProxy(addr);
    }
}
