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

describe("ve dist tests", function () {
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
  let veDist;
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
    await wmatic.mint(owner.address, utils.parseUnits("1000000"));

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
    veDist = await upgrades.deployProxy(Ve_dist, [ve.address, token.address]);
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
    await veDist.setDepositor(minter.address);
    await controller.setVeDist(veDist.address);
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

    await SatinCashPair.approve(ve.address, ethers.BigNumber.from("2000000000000000000"));
    await ve.createLockFor(
      ethers.BigNumber.from("1000000000000000000"),
      86400 * 30 * 6,
      owner.address
    );

    const Helper = await ethers.getContractFactory("ContractTestHelper");
    helper = await Helper.deploy();
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

  xit("veForAt test", async function () {
    expect(await veDist.veForAt(1, 0)).is.eq(BigNumber.from("0"));
    const Multicall2 = await ethers.getContractFactory("Multicall2");
    const multi = await Multicall2.deploy();
    // const multi = await Deploy.deployContract(owner, 'Multicall2');
    expect(await veDist.veForAt(1, await multi.getCurrentBlockTimestamp())).above(
      BigNumber.from("0")
    );
    await TimeUtils.advanceBlocksOnTs(WEEK + 123);
    expect(await veDist.veForAt(1, await multi.getCurrentBlockTimestamp())).above(
      BigNumber.from("0")
    );
  });

  xit("multi checkpointToken with empty balance test", async function () {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [minter.address],
    });
    await network.provider.send("hardhat_setBalance", [minter.address, "0x10000000000000000"]);
    const minterSigner = await ethers.getSigner(minter.address);
    await veDist.connect(minterSigner).setDepositor(helper.address);
    await helper.multipleVeDistCheckpoints(veDist.address);

    const curTs = (await veDist.lastTokenTime()).toNumber();
    const nextWeek = curTs + WEEK;
    await TimeUtils.setNextBlockTime(nextWeek);

    await helper.multipleVeDistCheckpoints(veDist.address);
  });

  xit("multi checkpointToken with positive balance test", async function () {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [minter.address],
    });
    await network.provider.send("hardhat_setBalance", [minter.address, "0x10000000000000000"]);
    const minterSigner = await ethers.getSigner(minter.address);
    await veDist.connect(minterSigner).setDepositor(helper.address);
    await wmatic.mint(veDist.address, parseUnits("1"));
    await helper.multipleVeDistCheckpoints(veDist.address);
  });

  xit("adjustToDistribute test", async function () {
    expect(await veDist.adjustToDistribute(100, 1, 1, 20)).eq(100);
    expect(await veDist.adjustToDistribute(100, 0, 1, 20)).eq(100);
    expect(await veDist.adjustToDistribute(100, 2, 1, 20)).eq(5);
  });

  xit("checkpointToken not depositor revert test", async function () {
    await expect(veDist.connect(owner2).checkpointToken()).revertedWith("!depositor");
  });

  xit("setDepositor not depositor revert test", async function () {
    await expect(veDist.connect(owner2).setDepositor(ZERO_ADDRESS)).revertedWith("!depositor");
  });

  xit("checkpointTotalSupply dummy test", async function () {
    await ve.checkpoint();
    await veDist.checkpointTotalSupply();
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.checkpoint();
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.checkpoint();
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.checkpoint();
    await veDist.checkpointTotalSupply();
  });

  xit("adjustVeSupply test", async function () {
    expect(await veDist.adjustVeSupply(100, 100, 5, 10)).eq(5);
    expect(await veDist.adjustVeSupply(99, 100, 5, 10)).eq(0);
    expect(await veDist.adjustVeSupply(200, 100, 5, 10)).eq(0);
    expect(await veDist.adjustVeSupply(2, 1, 20, 5)).eq(15);
    expect(await veDist.adjustVeSupply(3, 1, 20, 5)).eq(10);
  });

  xit("claim for non exist token test", async function () {
    await veDist.claim(99);
  });

  xit("claim without rewards test", async function () {
    await veDist.claim(1);
  });

  xit("claim for early token test", async function () {
    const Controller = await ethers.getContractFactory("Controller");
    const controller = await Controller.deploy();
    const Ve = await ethers.getContractFactory("Ve");
    const ve1 = await upgrades.deployProxy(Ve, [controller.address]);
    await ve1.postInitialize(wmatic.address);
    // await Deploy.deployVe(owner, wmatic.address, controller.address);
    await wmatic.approve(ve1.address, parseUnits("10000"));
    await ve1.createLock(parseUnits("1"), 60 * 60 * 24 * 14);
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    const Ve_dist = await ethers.getContractFactory("VeDist");
    const veDist1 = await await upgrades.deployProxy(Ve_dist, [ve.address, wmatic.address]);

    await veDist1.checkpointToken();

    await veDist1.claim(1);
  });

  xit("claim for early token with delay test", async function () {
    const Controller = await ethers.getContractFactory("Controller");
    const controller = await Controller.deploy();
    const Ve = await ethers.getContractFactory("Ve");
    const ve1 = await upgrades.deployProxy(Ve, [controller.address]);
    await ve1.postInitialize(wmatic.address);
    // await Deploy.deployVe(owner, wmatic.address, controller.address);
    await wmatic.approve(ve1.address, parseUnits("10000"));
    await ve1.createLock(parseUnits("1"), 60 * 60 * 24 * 14);
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    // const veDist1 = await Deploy.deployVeDist(owner, ve.address);
    const Ve_dist = await ethers.getContractFactory("VeDist");
    const veDist1 = await await upgrades.deployProxy(Ve_dist, [ve.address, wmatic.address]);

    await veDist1.checkpointToken();
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await veDist1.claim(1);
  });

  xit("claim with rewards test", async function () {
    await ve.createLock(WEEK * 2, 60 * 60 * 24 * 365);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);

    await wmatic.transfer(veDist.address, parseUnits("1"));
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [minter.address],
    });
    await network.provider.send("hardhat_setBalance", [minter.address, "0x10000000000000000"]);
    const minterSigner = await ethers.getSigner(minter.address);
    await veDist.connect(minterSigner).checkpointToken();
    await veDist.connect(minterSigner).checkpointTotalSupply();
    await veDist.claim(2);
  });

  xit("claim without checkpoints after the launch should return zero", async function () {
    await ve.createLock(parseUnits("1"), 60 * 60 * 24 * 365);
    const maxUserEpoch = await ve.userPointEpoch(2);
    const startTime = await veDist.startTime();
    let weekCursor = await veDist.timeCursorOf(2);
    let userEpoch;
    if (weekCursor.isZero()) {
      userEpoch = await veDist.findTimestampUserEpoch(ve.address, 2, startTime, maxUserEpoch);
    } else {
      userEpoch = await veDist.userEpochOf(2);
    }
    if (userEpoch.isZero()) {
      userEpoch = BigNumber.from(1);
    }
    const userPoint = await ve.userPointHistory(2, userEpoch);
    if (weekCursor.isZero()) {
      weekCursor = userPoint.ts.add(WEEK).sub(1).div(WEEK).mul(WEEK);
    }
    const lastTokenTime = await veDist.lastTokenTime();
    expect(weekCursor.gte(lastTokenTime)).eq(true);
  });

  xit("claim with rewards with minimal possible amount and lock", async function () {
    await ve.createLock(4 * 365 * 86400, WEEK);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await wmatic.transfer(veDist.address, parseUnits("1"));
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [minter.address],
    });
    await network.provider.send("hardhat_setBalance", [minter.address, "0x10000000000000000"]);
    const minterSigner = await ethers.getSigner(minter.address);
    await veDist.connect(minterSigner).checkpointToken();
    await veDist.connect(minterSigner).checkpointTotalSupply();

    // const maxUserEpoch = await ve.userPointEpoch(2)
    // console.log('maxUserEpoch', maxUserEpoch.toString());
    //
    // const startTime = await veDist.startTime();
    // console.log('startTime', startTime.toString());
    //
    // let weekCursor = await veDist.timeCursorOf(2);
    // console.log('weekCursor', weekCursor.toString());
    //
    // let userEpoch;
    // if (weekCursor.isZero()) {
    //   userEpoch = await veDist.findTimestampUserEpoch(ve.address, 2, startTime, maxUserEpoch);
    //   console.log('userEpoch from findTimestampUserEpoch', userEpoch.toString());
    // } else {
    //   userEpoch = await veDist.userEpochOf(2);
    //   console.log('userEpoch', userEpoch.toString());
    // }
    //
    // if (userEpoch.isZero()) {
    //   userEpoch = BigNumber.from(1);
    // }
    //
    // const userPoint = await ve.userPointHistory(2, userEpoch);
    // console.log('///userPoint blk', userPoint.blk.toString());
    // console.log('///userPoint ts', userPoint.ts.toString());
    // console.log('///userPoint bias', userPoint.bias.toString());
    // console.log('///userPoint slope', userPoint.slope.toString());
    //
    // if (weekCursor.isZero()) {
    //   weekCursor = userPoint.ts.add(WEEK).sub(1).div(WEEK).mul(WEEK);
    //   console.log("weekCursor from userPoint", weekCursor.toString());
    // }
    //
    // const lastTokenTime = await veDist.lastTokenTime();
    // console.log('lastTokenTime', lastTokenTime.toString());
    // if (weekCursor.gte(lastTokenTime)) {
    //   console.log("weekCursor >= lastTokenTime STOP", weekCursor.sub(lastTokenTime).toString());
    //   return;
    // }
    // if (weekCursor.lt(startTime)) {
    //   weekCursor = startTime;
    //   console.log("weekCursor set to start time", weekCursor.toString());
    // }

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);

    let bal = await ve.balanceOfNFT(2);
    await veDist.claim(2);
    expect((await ve.balanceOfNFT(2)).sub(bal)).eq(0);

    // SECOND CLAIM

    await wmatic.transfer(veDist.address, parseUnits("1"));
    await veDist.connect(minterSigner).checkpointToken();
    await veDist.connect(minterSigner).checkpointTotalSupply();

    await TimeUtils.advanceBlocksOnTs(123456);

    bal = await ve.balanceOfNFT(2);
    await veDist.claim(2);
    expect((await ve.balanceOfNFT(2)).sub(bal)).eq(0);
  });

  xit("claimMany on old block test", async function () {
    await ve.createLock(4 * 365 * 86400, WEEK);
    await veDist.claimMany([1, 2, 0]);
  });

  it("No rewards if locked for 6 months", async function () {
    await voter.createGauge(SatinCashPair.address);
    await voter.vote(1, [SatinCashPair.address], [ethers.BigNumber.from("5000")]);
    await network.provider.send("evm_increaseTime", [2 * 86400 * 7]);
    await network.provider.send("evm_mine");
    await minter.updatePeriod();
    await veDist.claimable(1)
  });
});
