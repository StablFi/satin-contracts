const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Upgradeable", function () {
  let proxyFactory;
  let proxyAdmin;
  let factory;
  let tokenA;
  let tokenB;
  let pool;
  let cash;

  let gaugeFactory;
  let bribeFactory;
  let lastGauge;
  let last_internal_bribe;
  let last_external_bribe;

  this.beforeAll(async function () {
    const ProxyFactory_factory = await ethers.getContractFactory("ProxyFactory");
    proxyFactory = await ProxyFactory_factory.deploy();
    proxyAdmin = await upgrades.deployProxyAdmin();
    const erc20Factory = await ethers.getContractFactory("GenericERC20");
    tokenA = await erc20Factory.deploy("TestTokenA", "TTX", 18);
    tokenB = await erc20Factory.deploy("TestTokenB", "TTY", 18);
    cash = await erc20Factory.deploy("CASH", "CSH", 18);
  });

  it("BaseV1Factory deploys pools", async function () {
    const poolFactory = await ethers.getContractFactory("BaseV1Pair");
    const poolImplementation = await poolFactory.deploy();

    const BaseV1Factory_Factory = await ethers.getContractFactory("BaseV1Factory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    factory = await upgrades.deployProxy(BaseV1Factory_Factory, [ethers.constants.AddressZero, proxyAdmin, poolImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });

    await factory.createPair(tokenA.address, tokenB.address, true);

    const poolCreated = await factory.getPair(tokenA.address, tokenB.address, true);
    expect(poolCreated).not.eq(ethers.constants.AddressZero);

    pool = await ethers.getContractAt("BaseV1Pair", poolCreated);
    expect(await pool.token0()).eq(tokenA.address);
    expect(await pool.token1()).eq(tokenB.address);
    expect(await pool.stable()).eq(true);
  });

  it("GaugeFactory deploys Gauge", async function () {
    const _gaugeFactory = await ethers.getContractFactory("Gauge");
    const gaugeImplementation = await _gaugeFactory.deploy();

    const _internalBribeFactory = await ethers.getContractFactory("InternalBribe");
    const internalBribeImplementation = await _internalBribeFactory.deploy();

    const _externalBribeFactory = await ethers.getContractFactory("ExternalBribe");
    const externalBribeImplementation = await _externalBribeFactory.deploy();

    const BribeFactory_Factory = await ethers.getContractFactory("BribeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    const GaugeFactory_Factory = await ethers.getContractFactory("GaugeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    bribeFactory = await upgrades.deployProxy(BribeFactory_Factory, [proxyAdmin, internalBribeImplementation.address, externalBribeImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });

    gaugeFactory = await upgrades.deployProxy(GaugeFactory_Factory, [proxyAdmin, gaugeImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });

    const controllerFactory = await ethers.getContractFactory("Controller");
    const controller = await controllerFactory.deploy();

    const veToken = await ethers.getContractFactory("Ve");
    const ve = await upgrades.deployProxy(veToken, [controller.address]);

    const satinFactory = await ethers.getContractFactory("Satin");
    const satin = await upgrades.deployProxy(satinFactory);

    const Ve_dist = await ethers.getContractFactory("VeDist");
    const ve_dist = await upgrades.deployProxy(Ve_dist, [ve.address, satin.address, cash.address]);

    const satinVoterFactory = await ethers.getContractFactory("SatinVoter");
    const satinVoter = await upgrades.deployProxy(satinVoterFactory, [ve.address, factory.address, gaugeFactory.address, bribeFactory.address, satin.address, ve_dist.address]);

    expect(satinVoter.address).not.eq(ethers.constants.AddressZero);

    await satinVoter.whitelist(tokenA.address);
    await satinVoter.whitelist(tokenB.address);

    await satinVoter.createGauge(pool.address);

    last_internal_bribe = await bribeFactory.last_internal_bribe();
    last_external_bribe = await bribeFactory.last_external_bribe();

    expect(last_internal_bribe).not.eq(ethers.constants.AddressZero);
    expect(last_external_bribe).not.eq(ethers.constants.AddressZero);

    await gaugeFactory.createGauge(pool.address, last_internal_bribe, last_external_bribe, ve.address, [tokenA.address, tokenB.address]);

    lastGauge = await gaugeFactory.lastGauge();
    expect(lastGauge).not.eq(ethers.constants.AddressZero);
  });

  it("Factory upgrade working", async function () {
    const BaseV1Factory_Factory = await ethers.getContractFactory("BaseV1Factory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });
    const _factory = await upgrades.forceImport(factory.address, BaseV1Factory_Factory);

    const factoryUpgrade = await ethers.getContractFactory("BaseV1Factory_Upgrade", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    const upgradedContract = await upgrades.upgradeProxy(_factory, factoryUpgrade, {
      unsafeAllowLinkedLibraries: true,
    });

    expect(await upgradedContract.newFunction()).eq(1234);
  });

  it("Pool upgrade working", async function () {
    const poolFactory = await ethers.getContractFactory("BaseV1Pair");
    const _pool = await upgrades.forceImport(pool.address, poolFactory);
    const poolUpgrade = await ethers.getContractFactory("BaseV1Pair_Upgrade");
    const upgradedContract = await upgrades.upgradeProxy(_pool, poolUpgrade);
    expect(await upgradedContract.newFunction()).eq(1234);
    expect(await upgradedContract.token0()).eq(tokenA.address);
    expect(await upgradedContract.token1()).eq(tokenB.address);
    expect(await upgradedContract.stable()).eq(true);
  });

  it("GaugeFactory upgrade working", async function () {
    const GaugeFactory_Factory = await ethers.getContractFactory("GaugeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    const _gaugeFactory = await upgrades.forceImport(gaugeFactory.address, GaugeFactory_Factory);
    const gaugeFactoryUpgrade = await ethers.getContractFactory("GaugeFactory_Upgrade", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    const upgradedContract = await upgrades.upgradeProxy(_gaugeFactory, gaugeFactoryUpgrade, {
      unsafeAllowLinkedLibraries: true,
    });

    expect(await upgradedContract.newFunction()).eq(1234);
    expect(await upgradedContract.lastGauge()).eq(lastGauge);
  });

  it("BribeFactory upgrade working", async function () {
    const BribeFactory_Factory = await ethers.getContractFactory("BribeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    const _bribeFactory = await upgrades.forceImport(bribeFactory.address, BribeFactory_Factory);
    const bribeFactoryUpgrade = await ethers.getContractFactory("BribeFactory_Upgrade", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    const upgradedContract = await upgrades.upgradeProxy(_bribeFactory, bribeFactoryUpgrade, {
      unsafeAllowLinkedLibraries: true,
    });

    expect(await upgradedContract.newFunction()).eq(1234);
    expect(await upgradedContract.last_internal_bribe()).eq(last_internal_bribe);
    expect(await upgradedContract.last_external_bribe()).eq(last_external_bribe);
  });

  it("Gauge upgrade working", async function () {
    const gaugeFactory = await ethers.getContractFactory("Gauge");
    const _gauge = await upgrades.forceImport(lastGauge, gaugeFactory);
    const gaugeUpgrade = await ethers.getContractFactory("Gauge_Upgrade");
    const upgradedContract = await upgrades.upgradeProxy(_gauge, gaugeUpgrade);
    expect(await upgradedContract.newFunction()).eq(1234);
    expect(await upgradedContract.internal_bribe()).eq(last_internal_bribe);
    expect(await upgradedContract.external_bribe()).eq(last_external_bribe);
  });

  it("ExternalBribe upgrade working", async function () {
    const externalBribeFactory = await ethers.getContractFactory("ExternalBribe");
    const _externalBribe = await upgrades.forceImport(last_external_bribe, externalBribeFactory);
    const externalBribeUpgrade = await ethers.getContractFactory("ExternalBribe_Upgrade");
    const upgradedContract = await upgrades.upgradeProxy(_externalBribe, externalBribeUpgrade);
    expect(await upgradedContract.newFunction()).eq(1234);
    expect(await upgradedContract.isReward(tokenA.address)).to.be.true;
    expect(await upgradedContract.isReward(tokenB.address)).to.be.true;
  });

  it("InternalBribe upgrade working", async function () {
    const internalBribeFactory = await ethers.getContractFactory("InternalBribe");
    const _internalBribe = await upgrades.forceImport(last_internal_bribe, internalBribeFactory);
    const internalBribeUpgrade = await ethers.getContractFactory("InternalBribe_Upgrade");
    const upgradedContract = await upgrades.upgradeProxy(_internalBribe, internalBribeUpgrade);
    expect(await upgradedContract.newFunction()).eq(1234);
    expect(await upgradedContract.isReward(tokenA.address)).to.be.true;
    expect(await upgradedContract.isReward(tokenB.address)).to.be.true;
  });
});
