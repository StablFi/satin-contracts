const { expect } = require("chai");
const { ethers } = require("hardhat");
const { factory } = require("typescript");
const { TimeUtils } = require("../TimeUtils");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const { formatUnits, parseUnits } = require("ethers/lib/utils");
const { BigNumber, utils } = require("ethers");
const MAX_UINT = BigNumber.from(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935"
);
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
    const minterMax = utils.parseUnits("58333333");
    const cashAddress = cash.address;

    const voterTokens = [wmatic.address, usdt.address, usdc.address, dai.address, cash.address];

    const Factory = await ethers.getContractFactory("BaseV1Factory");
    const Pair = await ethers.getContractFactory("BaseV1Pair");
    const Fee = await ethers.getContractFactory("BaseV1Fees");
    const Router = await ethers.getContractFactory("BaseV1Router01");
    const Library = await ethers.getContractFactory("satin_library");
    const Token = await ethers.getContractFactory("Satin");
    const Gauges = await ethers.getContractFactory("GaugeFactory");
    const Bribes = await ethers.getContractFactory("BribeFactory");
    const Ve = await ethers.getContractFactory("Ve");
    const Ve_dist = await ethers.getContractFactory("VeDist");
    const BaseV1Voter = await ethers.getContractFactory("SatinVoter");
    const BaseV1Minter = await ethers.getContractFactory("SatinMinter");
    const Controller = await ethers.getContractFactory("Controller");

    const controller = await upgrades.deployProxy(Controller);
    console.log("Controller is deployed at:", controller.address);
    // const factory = await Factory.deploy(tresuryAddress);
    const factory = await upgrades.deployProxy(Factory, [owner3.address]);
    console.log("BaseV1Factory is deployed at:", factory.address);
    // const router = await Router.deploy(factory.address, WethAddress);
    const router = await upgrades.deployProxy(Router, [factory.address, wmatic.address]);
    console.log("BaseV1Router01 is deployed at:", router.address);
    const library = await Library.deploy(router.address);
    // const library = await upgrades.deployProxy(Library, [router.address]);
    console.log("SatinLibrary is deployed at", library.address);
    // const token = await Token.deploy();
    const token = await upgrades.deployProxy(Token);
    console.log("Satin token is deployed at:", token.address);
    // const gauges = await Gauges.deploy();
    const gauges = await upgrades.deployProxy(Gauges);
    console.log("GaugeFactory is deployed at:", gauges.address);
    // const bribes = await Bribes.deploy();
    const bribes = await upgrades.deployProxy(Bribes);
    console.log("BribeFactory is deployed at:", bribes.address);
    // const ve = await Ve.deploy(controller.address);
    const ve = await upgrades.deployProxy(Ve, [controller.address]);
    console.log("ve is deployed at address:", ve.address);
    // const ve_dist = await Ve_dist.deploy(ve.address, token.address);
    const ve_dist = await upgrades.deployProxy(Ve_dist, [ve.address, token.address]);
    console.log("ve_dist is deployed at address:", ve_dist.address);
    // const voter = await BaseV1Voter.deploy(
    //   ve.address,
    //   factory.address,
    //   gauges.address,
    //   bribes.address,
    //   token.address
    // );

    const voter = await upgrades.deployProxy(BaseV1Voter, [
      ve.address,
      factory.address,
      gauges.address,
      bribes.address,
      token.address,
    ]);

    console.log("voter is deployed at address:", voter.address);
    // const minter = await BaseV1Minter.deploy(
    //   ve.address,
    //   controller.address,
    //   token.address,
    //   warmupPeriod
    // );

    const minter = await upgrades.deployProxy(BaseV1Minter, [
      ve.address,
      controller.address,
      token.address,
      1,
    ]);
    console.log("minter is deployed at address:", minter.address);

    await token.setMinter(minter.address);
    console.log("Token contract initialized");
    await ve_dist.setDepositor(minter.address);
    console.log("Ve Dist contract initialized");
    await controller.setVeDist(ve_dist.address);
    console.log("Controller contract setVeDist initialized");
    await controller.setVoter(voter.address);
    console.log("Controller contract setVoter initialized");
    await voter.postInitialize([...voterTokens, token.address], minter.address);
    console.log("Voter contract initialized");
    await minter.postInitialize(minterMax);
    console.log("Minter contract initialized");
    console.log("cashAddress", cashAddress);
    console.log("tokenAddress", token.address);
    await cash.approve(router.address, utils.parseUnits("100"));
    await token.approve(router.address, utils.parseUnits("100"));
    // console.log("cashAddress", cashAddress);
    // console.log("token address", token.address);
    // await factory.createPair(cashAddress, token.address, false);
    await router.addLiquidity(
      cashAddress,
      token.address,
      false,
      utils.parseUnits("100"),
      utils.parseUnits("100"),
      1,
      1,
      owner.address,
      Date.now()
    );

    const CashSatinLPAddress = await factory.getPair(cashAddress, token.address, false);

    console.log("CashSatinLPAddress", CashSatinLPAddress);

    await ve.postInitialize(CashSatinLPAddress);
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
    console.log(EXPECTED_FEE);
  });
});
