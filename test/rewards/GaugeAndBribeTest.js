const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { factory } = require("typescript");
const { TimeUtils } = require("../TimeUtils");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const { formatUnits, parseUnits } = require("ethers/lib/utils");
const { BigNumber, utils } = require("ethers");
const MAX_UINT = BigNumber.from("115792089237316195423570985008687907853269984665640564039457584007913129639935");
const amount1000At6 = parseUnits("1000", 6);
const WEEK = 60 * 60 * 24 * 7;

describe("gauge and bribe tests", function () {
  let snapshotBefore;
  let snapshot;

  let owner;
  let owner2;
  let owner3;
  let factory;
  let router;
  let usdt;
  let usdc;
  let dai;
  let cash;
  let token;
  let wmatic;
  let pair;
  let ve;
  let ve_dist;
  let minter;
  let voter;
  let USDTCashPair;
  let gauge;
  let bribe;
  let helper;
  let fourPoolLPTokenAddress;
  let fourPoolAddress;
  let SwapContract;
  const tresuryAddress = "0x9c4927530B1719e063D7E181C6c2e56353204e64";
  let gaugeUSDTCash;
  let bribeUSDTCash;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    const GenericERC20 = await ethers.getContractFactory("GenericERC20");
    wmatic = await GenericERC20.deploy("WMATIC", "WMATIC", 18);
    usdt = await GenericERC20.deploy("USDT", "USDT", 6);
    usdc = await GenericERC20.deploy("USDC", "USDC", 6);
    cash = await GenericERC20.deploy("CASH", "CASH", 18);
    dai = await GenericERC20.deploy("DAI", "DAI", 18);

    await usdt.mint(owner.address, utils.parseUnits("1000000", 6));
    await usdc.mint(owner.address, utils.parseUnits("1000000", 6));
    await dai.mint(owner.address, utils.parseUnits("1000000"));
    await cash.mint(owner.address, utils.parseUnits("1000000"));

    const _gaugeContract = await ethers.getContractFactory("Gauge");
    const gaugeImplementation = await _gaugeContract.deploy();
    console.log("gaugeImplementation is deployed at", gaugeImplementation.address);

    const _internalBribeContract = await ethers.getContractFactory("InternalBribe");
    const internalBribeImplementation = await _internalBribeContract.deploy();
    console.log("internalBribeImplementation is deployed at", internalBribeImplementation.address);

    const _externalBribeContract = await ethers.getContractFactory("ExternalBribe");
    const externalBribeImplementation = await _externalBribeContract.deploy();
    console.log("externalBribeImplementation is deployed at", externalBribeImplementation.address);

    const ProxyFactory_factory = await ethers.getContractFactory("ProxyFactory");
    const proxyFactory = await ProxyFactory_factory.deploy();
    console.log("proxyFactory is deployed at address", proxyFactory.address);

    const poolFactory = await ethers.getContractFactory("BaseV1Pair");
    const poolImplementation = await poolFactory.deploy();
    proxyAdmin = await upgrades.deployProxyAdmin();

    let Factory = await ethers.getContractFactory("BaseV1Factory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });
    const factory = await upgrades.deployProxy(Factory, [tresuryAddress, proxyAdmin, poolImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });
    let Router = await ethers.getContractFactory("BaseV1Router01");
    router = await upgrades.deployProxy(Router, [factory.address, wmatic.address]);

    const minterMax = utils.parseUnits("58333333");

    pair = await ethers.getContractFactory("BaseV1Pair");
    const Token = await ethers.getContractFactory("Satin");
    const Gaauges = await ethers.getContractFactory("GaugeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });
    gauge = await ethers.getContractFactory("Gauge");
    const Briibes = await ethers.getContractFactory("BribeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });
    bribe = await ethers.getContractFactory("ExternalBribe");
    const Ve = await ethers.getContractFactory("Ve");
    const Ve_dist = await ethers.getContractFactory("VeDist");
    const BaseV1Voter = await ethers.getContractFactory("SatinVoter");
    const BaseV1Minter = await ethers.getContractFactory("SatinMinter");
    const Controller = await ethers.getContractFactory("Controller");

    const controller = await upgrades.deployProxy(Controller);
    token = await upgrades.deployProxy(Token);
    const gauges = await upgrades.deployProxy(Gaauges, [proxyAdmin, gaugeImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });
    const bribes = await upgrades.deployProxy(Briibes, [proxyAdmin, internalBribeImplementation.address, externalBribeImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });
    const cashAddress = cash.address;
    ve = await upgrades.deployProxy(Ve, [controller.address]);
    ve_dist = await upgrades.deployProxy(Ve_dist, [ve.address, token.address, cashAddress]);
    voter = await upgrades.deployProxy(BaseV1Voter, [ve.address, factory.address, gauges.address, bribes.address, token.address, ve_dist.address, owner.address]);
    minter = await upgrades.deployProxy(BaseV1Minter, [ve.address, controller.address, token.address]);

    const voterTokens = [wmatic.address, usdt.address, usdc.address, dai.address, token.address, cash.address];

    await token.setMinter(minter.address);
    await ve_dist.setDepositor(minter.address);
    await controller.setVeDist(ve_dist.address);
    await controller.setVoter(voter.address);
    await voter.postInitialize(voterTokens, minter.address);
    // await minter.postInitialize(minterMax);
    console.log("Minter contract initialized");
    const SatinBalance = await token.balanceOf(owner.address);
    console.log("Balance of satin of owner1", SatinBalance);
    await factory.createPair(cashAddress, token.address, false);
    const CashSatinLPAddress = await factory.getPair(cashAddress, token.address, false);
    console.log("CashSatinLPAddress", CashSatinLPAddress);

    await ve.postInitialize(CashSatinLPAddress);
    console.log("Ve contract initialized");

    await cash.approve(router.address, MAX_UINT);
    await usdt.approve(router.address, MAX_UINT);
    await dai.approve(router.address, MAX_UINT);

    await router.addLiquidity(cashAddress, usdt.address, false, utils.parseUnits("1000"), utils.parseUnits("1000", 6), 1, 1, owner.address, Date.now());

    await router.addLiquidity(cashAddress, dai.address, true, utils.parseUnits("1000"), utils.parseUnits("1000"), 1, 1, owner.address, Date.now());

    await router.addLiquidity(cashAddress, usdt.address, false, utils.parseUnits("1000"), utils.parseUnits("1000", 6), 1, 1, owner2.address, Date.now());

    await router.addLiquidity(cashAddress, usdt.address, false, utils.parseUnits("1000"), utils.parseUnits("1000", 6), 1, 1, owner3.address, Date.now());

    const USDTCashPairAddress = await router.pairFor(cashAddress, usdt.address, false);
    USDTCashPair = pair.attach(USDTCashPairAddress);

    await voter.createGauge(USDTCashPairAddress);
    expect(await voter.gauges(USDTCashPairAddress)).to.not.equal(ZERO_ADDRESS);

    const gaugeUSDTCashAddress = await voter.gauges(USDTCashPairAddress);
    const bribeUSDTCashAddress = await voter.external_bribes(gaugeUSDTCashAddress);

    gaugeUSDTCash = gauge.attach(gaugeUSDTCashAddress);
    bribeUSDTCash = bribe.attach(bribeUSDTCashAddress);

    await USDTCashPair.approve(gaugeUSDTCash.address, MAX_UINT);
    await gaugeUSDTCash.deposit(parseUnits("1000000", 6), 0);
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });

  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("claim fees", async function () {
    const EXPECTED_FEE = "0.25";
    console.log(owner);
    await USDTCashPair.connect(owner).approve(gaugeUSDTCash.address, amount1000At6);
    // await gaugeUSDTCash.connect(owner).deposit(amount1000At6, 0);
    const fees = await USDTCashPair.fees();
    await router.addLiquidity(cash.address, usdt.address, false, utils.parseUnits("1000"), utils.parseUnits("1000", 6), 1, 1, owner.address, Date.now());

    await cash.approve(router.address, parseUnits("99999"));
    await router.swapExactTokensForTokens(parseUnits("1000"), 0, [{ from: cash.address, to: usdt.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));
    await usdt.approve(router.address, MAX_UINT);
    await USDTCashPair.approve(ve.address, utils.parseUnits("1000"));
    await ve.createLockFor(utils.parseUnits("1000"), WEEK, owner.address);
    await router.swapExactTokensForTokens(parseUnits("1000", 6), 0, [{ to: cash.address, from: usdt.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));

    await router.swapExactTokensForTokens(parseUnits("1000", 6), 0, [{ to: cash.address, from: usdt.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));

    await router.swapExactTokensForTokens(parseUnits("1000", 6), 0, [{ to: cash.address, from: usdt.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));

    console.log("_supplied", await USDTCashPair.index0());

    console.log("Fee balance", await usdt.balanceOf(bribeUSDTCash.address));
    await ve.claimFees();
    console.log("ve address", ve.address);
    console.log("Fee balance", await usdt.balanceOf(bribeUSDTCash.address));
    // console.log("Balance After", await token.balanceOf(bribeUSDTCash.address));
  });

  xit("claim fee any user", async function () {
    const EXPECTED_FEE = "0.25";
    await USDTCashPair.connect(owner).approve(gaugeUSDTCash.address, amount1000At6);
    await gaugeUSDTCash.connect(owner).deposit(amount1000At6, 0);
    const fees = await USDTCashPair.fees();

    await cash.approve(router.address, parseUnits("99999"));
    await router.swapExactTokensForTokens(parseUnits("1000"), 0, [{ from: cash.address, to: token.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));
    await token.approve(router.address, MAX_UINT);
    await router.swapExactTokensForTokens(
      parseUnits("1000", 6),
      0,
      [{ to: cash.address, from: token.address, stable: false }],
      owner.address,
      BigNumber.from("999999999999999999")
    );

    // expect(await cash.balanceOf(fees)).is.eq(parseUnits(EXPECTED_FEE));
    // expect(await token.balanceOf(fees)).is.eq(parseUnits(EXPECTED_FEE, 6));

    console.log("Balance before", await cash.balanceOf(owner3.address));
    console.log("Balance before", await token.balanceOf(owner3.address));

    // await USDTCashPair.approve(ve.address, ethers.BigNumber.from("2000000000000000000"));
    await ve.createLockFor(ethers.BigNumber.from("1000000000000000000"), WEEK, owner.address);
    await ve.connect(owner3).claimFees();

    console.log("Balance before", await cash.balanceOf(owner3.address));
    console.log("Balance After", await token.balanceOf(owner3.address));

    // await voter.vote(1, [USDTCashPair.address], [ethers.BigNumber.from("5000")]);
    // const tokenIDaddress = await bribeUSDTCash.tokenIdToAddress(1);
    // console.log("tokenIDaddress", tokenIDaddress);
    // console.log("earned", await bribeUSDTCash.earned(cash.address, tokenIDaddress));
  });

  // it("gauge getReward for not owner or voter should be forbidden", async function () {
  //   await expect(gaugeUSDTCash.getReward(owner2.address, [])).revertedWith("Forbidden");
  // });

  // it("bribe getReward for not owner should reject", async function () {
  //   await expect(bribeUSDTCash.getReward(0, [ZERO_ADDRESS])).revertedWith("Not token owner");
  // });

  // it("bribe getRewardForOwner for not voter should reject", async function () {
  //   await expect(bribeUSDTCash.getRewardForOwner(0, [ZERO_ADDRESS])).revertedWith("Not voter");
  // });

  // it("bribe deposit for not voter should reject", async function () {
  //   await expect(bribeUSDTCash._deposit(0, 0)).revertedWith("Not voter");
  // });

  // it("bribe withdraw for not voter should reject", async function () {
  //   await expect(bribeUSDTCash._withdraw(0, 0)).revertedWith("Not voter");
  // });

  // it("bribe deposit with zero amount should reject", async function () {
  //   const voter = await impersonate(voter.address);
  //   await expect(bribeUSDTCash.connect(voter)._deposit(0, 0)).revertedWith("Zero amount");
  // });

  // it("bribe withdraw with zero amount should reject", async function () {
  //   await expect(bribeUSDTCash.connect(voter)._withdraw(0, 0)).revertedWith("Zero amount");
  // });

  // it("bribe tokenIdToAddress should be rejected with too high tokenId", async function () {
  //   await expect(bribeUSDTCash.tokenIdToAddress(MAX_UINT)).revertedWith("Wrong convert");
  // });

  // it("bribe tokenIdToAddress should be rejected with too high tokenId", async function () {
  //   expect(await bribeUSDTCash.addressToTokenId(await bribeUSDTCash.tokenIdToAddress(1))).is.eq(
  //     1
  //   );
  // });

  // it("deposit with another tokenId should be rejected", async function () {
  //   expect(await gaugeUSDTCash.tokenIds(owner.address)).is.eq(1);
  //   await TestHelper.addLiquidity(
  //     factory,
  //     router,
  //     owner,
  //     cash.address,
  //     ust.address,
  //     utils.parseUnits("1"),
  //     utils.parseUnits("1", 6),
  //     true
  //   );
  //   const pairAdr = await factory.getPair(cash.address, ust.address, true);
  //   // const pair = DystPair__factory.connect(pairAdr, owner);
  //   const pair = (await ethers.getContractFactory("BaseV1Pair")).connect(pairAdr, owner);
  //   const pairBalance = await pair.balanceOf(owner.address);
  //   expect(pairBalance).is.not.eq(0);
  //   await pair.approve(gaugeUSDTCash.address, pairBalance);
  //   await expect(gaugeUSDTCash.deposit(pairBalance, 3)).revertedWith("Wrong token");
  // });
});

async function depositToGauge(factory, router, owner, token0, token1, gauge, tokenId) {
  await TestHelper.addLiquidity(factory, router, owner, token0, token1, utils.parseUnits("1"), utils.parseUnits("1", 6), true);
  const pairAdr = await factory.getPair(token0, token1, true);
  const pair = (await ethers.getContractFactory("BaseV1Pair")).connect(pairAdr, owner);
  const pairBalance = await pair.balanceOf(owner.address);
  expect(pairBalance).is.not.eq(0);
  await pair.approve(gauge.address, pairBalance);
  await gauge.connect(owner).deposit(pairBalance, tokenId);
}
