const { expect } = require("chai");
const { ethers } = require("hardhat");
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
  let wmatic;
  let pair;
  let controller;
  let token;
  let gauges;
  let bribes;
  let ve;
  let ve_dist;
  let voter;
  let minter;
  let SatinCashPair;

  let gauge;
  let bribe;
  let helper;
  let fourPoolLPTokenAddress;
  let fourPoolAddress;
  let SwapContract;

  let gaugeSatinCash;
  let bribeSatinCash;

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

    let Factory = await ethers.getContractFactory("BaseV1Factory");
    factory = await upgrades.deployProxy(Factory, [owner3.address]);
    let Router = await ethers.getContractFactory("BaseV1Router01");
    router = await upgrades.deployProxy(Router, [factory.address, wmatic.address]);

    const minterMax = utils.parseUnits("58333333");

    pair = await ethers.getContractFactory("BaseV1Pair");
    const Token = await ethers.getContractFactory("Satin");
    const Gaauges = await ethers.getContractFactory("GaugeFactory");
    gauge = await ethers.getContractFactory("Gauge");
    const Briibes = await ethers.getContractFactory("BribeFactory");
    bribe = await ethers.getContractFactory("Bribe");
    const Ve = await ethers.getContractFactory("Ve");
    const Ve_dist = await ethers.getContractFactory("VeDist");
    const BaseV1Voter = await ethers.getContractFactory("SatinVoter");
    const BaseV1Minter = await ethers.getContractFactory("SatinMinter");
    const Controller = await ethers.getContractFactory("Controller");

    controller = await upgrades.deployProxy(Controller);
    token = await upgrades.deployProxy(Token);
    gauges = await upgrades.deployProxy(Gaauges);
    bribes = await upgrades.deployProxy(Briibes);
    ve = await upgrades.deployProxy(Ve, [controller.address]);
    ve_dist = await upgrades.deployProxy(Ve_dist, [ve.address, token.address]);
    voter = await upgrades.deployProxy(BaseV1Voter, [ve.address, factory.address, gauges.address, bribes.address, token.address]);
    minter = await upgrades.deployProxy(BaseV1Minter, [ve.address, controller.address, token.address]);

    const cashAddress = cash.address;

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
    await token.approve(router.address, MAX_UINT);
    await dai.approve(router.address, MAX_UINT);

    await router.addLiquidity(cashAddress, token.address, false, utils.parseUnits("1000"), utils.parseUnits("1000"), 1, 1, owner.address, Date.now());

    await router.addLiquidity(cashAddress, dai.address, true, utils.parseUnits("1000"), utils.parseUnits("1000"), 1, 1, owner.address, Date.now());

    await router.addLiquidity(cashAddress, token.address, false, utils.parseUnits("1000"), utils.parseUnits("1000"), 1, 1, owner2.address, Date.now());

    await router.addLiquidity(cashAddress, token.address, false, utils.parseUnits("1000"), utils.parseUnits("1000"), 1, 1, owner3.address, Date.now());

    const SatinCashPairAddress = await router.pairFor(cashAddress, token.address, false);
    SatinCashPair = pair.attach(SatinCashPairAddress);

    await voter.createGauge(SatinCashPairAddress);
    expect(await voter.gauges(SatinCashPairAddress)).to.not.equal(ZERO_ADDRESS);

    const gaugeSatinCashAddress = await voter.gauges(SatinCashPairAddress);
    const bribeSatinCashAddress = await voter.bribes(gaugeSatinCashAddress);

    gaugeSatinCash = gauge.attach(gaugeSatinCashAddress);
    bribeSatinCash = bribe.attach(bribeSatinCashAddress);

    await SatinCashPair.approve(gaugeSatinCash.address, MAX_UINT);
    await gaugeSatinCash.deposit(parseUnits("100"), 0);
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
    await SatinCashPair.connect(owner).approve(gaugeSatinCash.address, amount1000At6);
    // await gaugeSatinCash.connect(owner).deposit(amount1000At6, 0);
    const fees = await SatinCashPair.fees();
    await router.addLiquidity(cash.address, token.address, false, utils.parseUnits("1000"), utils.parseUnits("1000"), 1, 1, owner.address, Date.now());

    await cash.approve(router.address, parseUnits("99999"));
    await router.swapExactTokensForTokens(parseUnits("1000"), 0, [{ from: cash.address, to: token.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));
    await token.approve(router.address, MAX_UINT);
    await SatinCashPair.approve(ve.address, utils.parseUnits("1000"));
    await ve.createLockFor(utils.parseUnits("1000"), WEEK, owner.address);
    await router.swapExactTokensForTokens(
      parseUnits("1000", 6),
      0,
      [{ to: cash.address, from: token.address, stable: false }],
      owner.address,
      BigNumber.from("999999999999999999")
    );

    await router.swapExactTokensForTokens(
      parseUnits("1000", 6),
      0,
      [{ to: cash.address, from: token.address, stable: false }],
      owner.address,
      BigNumber.from("999999999999999999")
    );

    await router.swapExactTokensForTokens(
      parseUnits("1000", 6),
      0,
      [{ to: cash.address, from: token.address, stable: false }],
      owner.address,
      BigNumber.from("999999999999999999")
    );

    console.log("_supplied", await SatinCashPair.index0());

    console.log("Fee balance", await token.balanceOf(bribeSatinCash.address));
    await ve.claimFees();
    console.log("ve address", ve.address);
    console.log("Fee balance", await token.balanceOf(bribeSatinCash.address));
    // console.log("Balance After", await token.balanceOf(bribeSatinCash.address));
  });

  xit("claim fee any user", async function () {
    const EXPECTED_FEE = "0.25";
    await SatinCashPair.connect(owner).approve(gaugeSatinCash.address, amount1000At6);
    await gaugeSatinCash.connect(owner).deposit(amount1000At6, 0);
    const fees = await SatinCashPair.fees();

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

    // await SatinCashPair.approve(ve.address, ethers.BigNumber.from("2000000000000000000"));
    await ve.createLockFor(ethers.BigNumber.from("1000000000000000000"), WEEK, owner.address);
    await ve.connect(owner3).claimFees();

    console.log("Balance before", await cash.balanceOf(owner3.address));
    console.log("Balance After", await token.balanceOf(owner3.address));

    // await voter.vote(1, [SatinCashPair.address], [ethers.BigNumber.from("5000")]);
    // const tokenIDaddress = await bribeSatinCash.tokenIdToAddress(1);
    // console.log("tokenIDaddress", tokenIDaddress);
    // console.log("earned", await bribeSatinCash.earned(cash.address, tokenIDaddress));
  });

  // it("gauge getReward for not owner or voter should be forbidden", async function () {
  //   await expect(gaugeSatinCash.getReward(owner2.address, [])).revertedWith("Forbidden");
  // });

  // it("bribe getReward for not owner should reject", async function () {
  //   await expect(bribeSatinCash.getReward(0, [ZERO_ADDRESS])).revertedWith("Not token owner");
  // });

  // it("bribe getRewardForOwner for not voter should reject", async function () {
  //   await expect(bribeSatinCash.getRewardForOwner(0, [ZERO_ADDRESS])).revertedWith("Not voter");
  // });

  // it("bribe deposit for not voter should reject", async function () {
  //   await expect(bribeSatinCash._deposit(0, 0)).revertedWith("Not voter");
  // });

  // it("bribe withdraw for not voter should reject", async function () {
  //   await expect(bribeSatinCash._withdraw(0, 0)).revertedWith("Not voter");
  // });

  // it("bribe deposit with zero amount should reject", async function () {
  //   const voter = await impersonate(voter.address);
  //   await expect(bribeSatinCash.connect(voter)._deposit(0, 0)).revertedWith("Zero amount");
  // });

  // it("bribe withdraw with zero amount should reject", async function () {
  //   await expect(bribeSatinCash.connect(voter)._withdraw(0, 0)).revertedWith("Zero amount");
  // });

  // it("bribe tokenIdToAddress should be rejected with too high tokenId", async function () {
  //   await expect(bribeSatinCash.tokenIdToAddress(MAX_UINT)).revertedWith("Wrong convert");
  // });

  // it("bribe tokenIdToAddress should be rejected with too high tokenId", async function () {
  //   expect(await bribeSatinCash.addressToTokenId(await bribeSatinCash.tokenIdToAddress(1))).is.eq(
  //     1
  //   );
  // });

  // it("deposit with another tokenId should be rejected", async function () {
  //   expect(await gaugeSatinCash.tokenIds(owner.address)).is.eq(1);
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
  //   await pair.approve(gaugeSatinCash.address, pairBalance);
  //   await expect(gaugeSatinCash.deposit(pairBalance, 3)).revertedWith("Wrong token");
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
