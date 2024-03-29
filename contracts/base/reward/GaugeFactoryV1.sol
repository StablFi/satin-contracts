// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "../../interface/IGaugeFactory.sol";
import "../helper/ProxyFactory.sol";
import "./Gauge.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract GaugeFactoryV1 is Initializable, IGaugeFactory {
    address public lastGauge;

    address private gaugeImplementation;
    address private proxyAdmin;

    event GaugeCreated(address value);

    function initialize(address _proxyAdmin, address _gaugeImplementation) public initializer {
        gaugeImplementation = _gaugeImplementation;
        proxyAdmin = _proxyAdmin;
    }

    function createGauge(
        address _pool,
        address _internal_bribe,
        address _external_bribe,
        address _ve,
        address[] memory allowedRewards,
        address _rebaseHandler
    ) external override returns (address) {
        bytes memory salt = abi.encodePacked(_pool, _internal_bribe, _external_bribe, _ve, msg.sender, allowedRewards);
        bytes memory payload = abi.encodeWithSelector(Gauge.initialize.selector, _pool, _internal_bribe, _external_bribe, _ve, msg.sender, allowedRewards, _rebaseHandler);
        address _lastGauge = ProxyFactory.createTransparentProxy(gaugeImplementation, proxyAdmin, payload, salt);
        lastGauge = _lastGauge;
        emit GaugeCreated(_lastGauge);
        return _lastGauge;
    }

    function initializeImplementation(address _gaugeImplementation) public reinitializer(2) {
        gaugeImplementation = _gaugeImplementation;
    }
}
