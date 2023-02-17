const { expect } = require("chai");
const { ethers } = require("hardhat");
const { factory } = require("typescript");
const { TimeUtils } = require("../TimeUtils");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const { formatUnits, parseUnits } = require("ethers/lib/utils");
const { BigNumber, utils, Contract } = require("ethers");
const { parse } = require("typechain");
const MAX_UINT = BigNumber.from(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935"
);
const amount1000At6 = parseUnits("1000", 6);
const WEEK = 60 * 60 * 24 * 7;

describe("ve tests", function () {
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
    voter = await upgrades.deployProxy(BaseV1Voter, [
      ve.address,
      factory.address,
      gauges.address,
      bribes.address,
      token.address,
    ]);
    minter = await upgrades.deployProxy(BaseV1Minter, [
      ve.address,
      controller.address,
      token.address,
      1,
      owner3.address,
    ]);

    const cashAddress = cash.address;

    const voterTokens = [
      wmatic.address,
      usdt.address,
      usdc.address,
      dai.address,
      token.address,
      cash.address,
    ];

    await token.setMinter(minter.address);
    await ve_dist.setDepositor(minter.address);
    await controller.setVeDist(ve_dist.address);
    await controller.setVoter(voter.address);
    await voter.postInitialize(voterTokens, minter.address);
    await minter.postInitialize(minterMax);
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

    await router.addLiquidity(
      cashAddress,
      token.address,
      false,
      utils.parseUnits("1000"),
      utils.parseUnits("1000"),
      1,
      1,
      owner.address,
      Date.now()
    );

    await router.addLiquidity(
      cashAddress,
      dai.address,
      true,
      utils.parseUnits("1000"),
      utils.parseUnits("1000"),
      1,
      1,
      owner.address,
      Date.now()
    );

    await router.addLiquidity(
      cashAddress,
      token.address,
      false,
      utils.parseUnits("1000"),
      utils.parseUnits("1000"),
      1,
      1,
      owner2.address,
      Date.now()
    );

    const SatinCashPairAddress = await router.pairFor(cashAddress, token.address, false);
    SatinCashPair = pair.attach(SatinCashPairAddress);

    const TOKEN_ADDRESSES = [
      dai.address, //DAI
      usdc.address, //USDC
      usdt.address, //USDT
      cash.address, //CASH
    ];
    const TOKEN_DECIMALS = [18, 6, 6, 18];
    const LP_TOKEN_NAME = "Satin DAI/USDC/USDT/CASH";
    const LP_TOKEN_SYMBOL = "satinCash";
    const INITIAL_A = 200;
    const SWAP_FEE = 4e6;
    const ADMIN_FEE = 0;

    const swapUtilsV1 = await ethers.getContractFactory("SwapUtils");
    const swapUtilsV1Contract = await swapUtilsV1.deploy();

    console.log("SwapUtilsV1Contract deployed at:", swapUtilsV1Contract.address);

    const AmplificationUtilsV1 = await ethers.getContractFactory("AmplificationUtils");
    const AmplificationUtilsV1Contract = await AmplificationUtilsV1.deploy();

    console.log("AmplificationUtilsV1Contract deployed at:", AmplificationUtilsV1Contract.address);

    const Swap = await ethers.getContractFactory("Swap", {
      libraries: {
        AmplificationUtils: AmplificationUtilsV1Contract.address,
        SwapUtils: swapUtilsV1Contract.address,
      },
    });

    const arguments = [
      TOKEN_ADDRESSES,
      TOKEN_DECIMALS,
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A,
      SWAP_FEE,
      ADMIN_FEE,
    ];

    SwapContract = await upgrades.deployProxy(Swap, arguments, {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["external-library-linking"],
    });

    await SwapContract.deployed();

    fourPoolLPTokenAddress = await SwapContract.swapStorage();

    // await voter.createGauge(SatinCashPairAddress);
    // expect(await voter.gauges(SatinCashPairAddress)).to.not.equal(ZERO_ADDRESS);

    // const gaugeSatinCashAddress = await voter.gauges(SatinCashPairAddress);
    // const bribeSatinCashAddress = await voter.bribes(gaugeSatinCashAddress);

    // gaugeSatinCash = gauge.attach(gaugeSatinCashAddress);
    // bribeSatinCash = bribe.attach(bribeSatinCashAddress);

    // await SatinCashPair.approve(gaugeSatinCash.address, MAX_UINT);
    // await gaugeSatinCash.deposit(parseUnits("100"), 0);
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

  xit("Same Values but different lock time", async function () {
    await SatinCashPair.approve(ve.address, ethers.BigNumber.from("2000000000000000000"));
    await ve.createLockFor(ethers.BigNumber.from("1000000000000000000"), WEEK, owner.address);
    await ve.createLockFor(
      ethers.BigNumber.from("1000000000000000000"),
      86400 * 365,
      owner2.address
    );
    await voter.createGauge(SatinCashPair.address);
    await voter.vote(1, [SatinCashPair.address], [ethers.BigNumber.from("5000")]);
    await voter.connect(owner2).vote(2, [SatinCashPair.address], [ethers.BigNumber.from("5000")]);
    const satinCashGauge = await voter.gauges(SatinCashPair.address);
    const cashSatinGauge = gauge.attach(satinCashGauge);
    await SatinCashPair.connect(owner2).approve(cashSatinGauge.address, MAX_UINT);
    await cashSatinGauge.connect(owner2).deposit(parseUnits("100"), 0);
    await network.provider.send("evm_increaseTime", [2 * 86400 * 7]);
    await network.provider.send("evm_mine");
    await minter.updatePeriod();
  });

  it("No emissions after Week 491", async function () {
     await SatinCashPair.approve(ve.address, ethers.BigNumber.from("2000000000000000000"));
    await ve.createLockFor(ethers.BigNumber.from("1000000000000000000"), WEEK, owner.address);
    await ve.createLockFor(
      ethers.BigNumber.from("1000000000000000000"),
      86400 * 365,
      owner2.address
    );
    await voter.createGauge(SatinCashPair.address);
    await voter.vote(1, [SatinCashPair.address], [ethers.BigNumber.from("5000")]);
    await voter.connect(owner2).vote(2, [SatinCashPair.address], [ethers.BigNumber.from("5000")]);
    const satinCashGauge = await voter.gauges(SatinCashPair.address);
    const cashSatinGauge = gauge.attach(satinCashGauge);
    await SatinCashPair.connect(owner2).approve(cashSatinGauge.address, MAX_UINT);
    await cashSatinGauge.connect(owner2).deposit(parseUnits("100"), 0);
    for(let i = 1; i <= 492; i++){
        console.log("WEEK", i);
        await network.provider.send("evm_increaseTime", [1 * 86400 * 7]);
        await network.provider.send("evm_mine");
        await minter.updatePeriod();
    }
  });
});
