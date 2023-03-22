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
const { time } = require("@nomicfoundation/hardhat-network-helpers");
var hdate = require("human-date");
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
  let DAICashPair;
  let gauge;
  let bribe;
  let bribe_int;
  let Token;
  let Gaauges;
  let Briibes;
  let Ve;
  let Ve_dist;
  let BaseV1Voter;
  let BaseV1Minter;
  let Controller;
  let Router;
  let Factory;

  let gauges;
  let controller;
  let bribes;
  let int_bribeDAICash;

  let USDTCashPairAddress;
  let DAICashPairAddress;
  let SatinCashPair;
  let CashSatinLPAddress;

  let MAX_UINT = BigNumber.from("115792089237316195423570985008687907853269984665640564039457584007913129639935");
  let fourPoolLPTokenAddress;
  let fourPoolAddress;
  let SwapContract;
  const tresuryAddress = "0x9c4927530B1719e063D7E181C6c2e56353204e64";
  let gaugeUSDTCash;
  let bribeUSDTCash;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();
    const minterMax = utils.parseUnits("58333333");

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

    const ProxyFactory_factory = await ethers.getContractFactory("ProxyFactory");
    const proxyFactory = await ProxyFactory_factory.deploy();
    console.log("proxyFactory is deployed at address", proxyFactory.address);

    const poolFactory = await ethers.getContractFactory("BaseV1Pair");
    const poolImplementation = await poolFactory.deploy();
    proxyAdmin = await upgrades.deployProxyAdmin();

    const _gaugeContract = await ethers.getContractFactory("Gauge");
    const gaugeImplementation = await _gaugeContract.deploy();
    console.log("gaugeImplementation is deployed at", gaugeImplementation.address);

    const _internalBribeContract = await ethers.getContractFactory("InternalBribe");
    const internalBribeImplementation = await _internalBribeContract.deploy();
    console.log("internalBribeImplementation is deployed at", internalBribeImplementation.address);

    const _externalBribeContract = await ethers.getContractFactory("ExternalBribe");
    const externalBribeImplementation = await _externalBribeContract.deploy();
    console.log("externalBribeImplementation is deployed at", externalBribeImplementation.address);

    // GET CONTRACTS //////////////////////

    Factory = await ethers.getContractFactory("BaseV1Factory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });
    Router = await ethers.getContractFactory("BaseV1Router01");
    pair = await ethers.getContractFactory("BaseV1Pair");
    Token = await ethers.getContractFactory("Satin");
    Gaauges = await ethers.getContractFactory("GaugeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });
    gauge = await ethers.getContractFactory("Gauge");
    Briibes = await ethers.getContractFactory("BribeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });
    bribe = await ethers.getContractFactory("ExternalBribe");
    bribe_int = await ethers.getContractFactory("InternalBribe");
    Ve = await ethers.getContractFactory("Ve");
    Ve_dist = await ethers.getContractFactory("VeDist");
    BaseV1Voter = await ethers.getContractFactory("SatinVoter");
    BaseV1Minter = await ethers.getContractFactory("SatinMinter");
    Controller = await ethers.getContractFactory("Controller");

    // DEPLOY CONTRACTS //////////////////////

    factory = await upgrades.deployProxy(Factory, [tresuryAddress, proxyAdmin, poolImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });
    router = await upgrades.deployProxy(Router, [factory.address, wmatic.address]);
    token = await upgrades.deployProxy(Token);
    controller = await upgrades.deployProxy(Controller);
    gauges = await upgrades.deployProxy(Gaauges, [proxyAdmin, gaugeImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });
    bribes = await upgrades.deployProxy(Briibes, [proxyAdmin, internalBribeImplementation.address, externalBribeImplementation.address], {
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
    await minter.postInitialize(minterMax);
    console.log("Minter contract initialized");
    const SatinBalance = await token.balanceOf(owner.address);
    console.log("Balance of satin of owner1", SatinBalance);
    await factory.createPair(cashAddress, token.address, false);
    CashSatinLPAddress = await factory.getPair(cashAddress, token.address, false);
    console.log("CashSatinLPAddress", CashSatinLPAddress);

    await ve.postInitialize(CashSatinLPAddress);
    console.log("Ve contract initialized");

    await cash.approve(router.address, MAX_UINT);
    await usdt.approve(router.address, MAX_UINT);
    await dai.approve(router.address, MAX_UINT);
    await token.approve(router.address, MAX_UINT);

    await router.addLiquidity(cashAddress, usdt.address, false, utils.parseUnits("1000"), utils.parseUnits("1000", 6), 1, 1, owner.address, Date.now());

    await router.addLiquidity(cashAddress, token.address, false, utils.parseUnits("1000"), utils.parseUnits("1000"), 1, 1, owner.address, Date.now());

    await router.addLiquidity(cashAddress, dai.address, true, utils.parseUnits("1000"), utils.parseUnits("1000"), 1, 1, owner.address, Date.now());

    await router.addLiquidity(cashAddress, usdt.address, false, utils.parseUnits("1000"), utils.parseUnits("1000", 6), 1, 1, owner2.address, Date.now());

    await router.addLiquidity(cashAddress, usdt.address, false, utils.parseUnits("1000"), utils.parseUnits("1000", 6), 1, 1, owner3.address, Date.now());

    USDTCashPairAddress = await router.pairFor(cashAddress, usdt.address, false);
    DAICashPairAddress = await router.pairFor(cashAddress, dai.address, true);
    SatinCashPair = pair.attach(CashSatinLPAddress);
    const balpair = await SatinCashPair.balanceOf(owner.address);

    const venftid = await ve.createLockForOwner(utils.parseUnits("10"), 60 * 60 * 24 * 14, owner.address);

    await voter.createGauge(USDTCashPairAddress);
    expect(await voter.gauges(USDTCashPairAddress)).to.not.equal(ZERO_ADDRESS);

    const gaugeUSDTCashAddress = await voter.gauges(USDTCashPairAddress);
    const bribeUSDTCashAddress = await voter.external_bribes(gaugeUSDTCashAddress);

    const gaugeDAICashAddress = await voter.gauges(DAICashPairAddress);
    const bribeDAICashAddress = await voter.external_bribes(gaugeDAICashAddress);
    const int_bribeDAICashAddress = await voter.external_bribes(gaugeDAICashAddress);

    USDTCashPair = pair.attach(USDTCashPairAddress);
    DAICashPair = pair.attach(DAICashPairAddress);

    gaugeUSDTCash = gauge.attach(gaugeUSDTCashAddress);
    bribeUSDTCash = bribe.attach(bribeUSDTCashAddress);
    gaugeDAICash = gauge.attach(gaugeDAICashAddress);
    bribeDAICash = bribe.attach(bribeDAICashAddress);
    int_bribeDAICash = bribe_int.attach(int_bribeDAICashAddress);

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
  it("getPriorBalanceIndex for unknown token return 0", async function () {
    expect(await bribeUSDTCash.getPriorBalanceIndex("0x0000000000000000000000000000000000000000", 0)).is.eq(0);
  });

  it("getPriorBalanceIndex test", async function () {
    await voter.vote(1, [USDTCashPairAddress], [100]);
    console.log(await minter.activePeriod(), await voter.lastVoted(1), "vote 0");

    const block = await ethers.provider.getBlock("latest");
    console.log(hdate.prettyPrint((await ethers.provider.getBlock("latest")).timestamp), "week0");

    await time.increaseTo(block.timestamp + 794800);
    console.log(hdate.prettyPrint((await ethers.provider.getBlock("latest")).timestamp), await ethers.provider.getBlock("latest").timestamp, "week1");

    const a = await minter.updatePeriod();
    console.log(a, await minter.activePeriod(), await voter.lastVoted(1), "vote after week");

    await voter.reset(1);
    console.log("hell1");
    await TimeUtils.advanceBlocksOnTs(1);
    await voter.vote(1, [USDTCashPairAddress], [100]);
    console.log("hell");
    await time.increaseTo(block.timestamp + 954800);
    const checkPointN = await bribeUSDTCash.numCheckpoints("1");
    console.log(checkPointN, "hell1");
    expect(checkPointN).is.not.eq(0);
    const checkPoint = await bribeUSDTCash.checkpoints("1", checkPointN.sub(1));
    console.log(
      checkPoint,
      "hell1",
      await bribeUSDTCash.getPriorBalanceIndex("1", checkPoint.timestamp.add(1)),
      await bribeUSDTCash.getPriorBalanceIndex("1", checkPoint.timestamp),
      await bribeUSDTCash.getPriorBalanceIndex("1", checkPoint.timestamp.sub(1))
    );
    console.log("checkpoint timestamp", checkPoint.timestamp.toString());
    console.log("checkpoint bal", checkPoint.balanceOf.toString());
    expect(await bribeUSDTCash.getPriorBalanceIndex("1", checkPoint.timestamp)).is.eq(0);
    expect(await bribeUSDTCash.getPriorBalanceIndex("1", checkPoint.timestamp.add(1))).is.eq(0);
    expect(await bribeUSDTCash.getPriorBalanceIndex("1", checkPoint.timestamp.sub(1))).is.eq(0);
  });

  it("getPriorSupplyIndex for empty bribe", async function () {
    await voter.createGauge(CashSatinLPAddress);
    const gauge = await voter.gauges(CashSatinLPAddress);
    const bribeadd = await voter.external_bribes(gauge);
    const b = bribe.attach(bribeadd);

    expect(await b.getPriorSupplyIndex(0)).is.eq(0);
  });

  // it("getPriorSupplyIndex test", async function () {
  //   await voter.vote(1, [DAICashPairAddress], [100]);
  //   await TimeUtils.advanceBlocksOnTs(1);
  //   await voter.reset(1);
  //   await TimeUtils.advanceBlocksOnTs(1);
  //   await voter.vote(1, [DAICashPairAddress], [100]);

  //   const n = await bribeDAICash.supplyNumCheckpoints();
  //   expect(n).is.not.eq(0);
  //   const checkpoint = await bribeDAICash.supplyCheckpoints(n.sub(2));
  //   expect(await bribeDAICash.getPriorSupplyIndex(checkpoint.timestamp)).is.eq(1);
  //   expect(await bribeDAICash.getPriorSupplyIndex(checkpoint.timestamp.add(1))).is.eq(1);
  //   expect(await bribeDAICash.getPriorSupplyIndex(checkpoint.timestamp.sub(1))).is.eq(0);
  // });

  it("custom reward test", async function () {
    await voter.vote(1, [DAICashPairAddress], [100]);
    await dai.approve(bribeDAICash.address, parseUnits("100"));
    await bribeDAICash.notifyRewardAmount(dai.address, parseUnits("1"));
    await TimeUtils.advanceBlocksOnTs(954800);

    await voter.reset(1);

    await bribeDAICash.batchUpdateRewardPerToken(dai.address, 3);
    await bribeDAICash.notifyRewardAmount(dai.address, parseUnits("1"));
    await TimeUtils.advanceBlocksOnTs(954800);

    await voter.vote(1, [DAICashPairAddress], [100]);

    await bribeDAICash.notifyRewardAmount(dai.address, parseUnits("10"));
    await TimeUtils.advanceBlocksOnTs(954800);

    await voter.reset(1);
    await TimeUtils.advanceBlocksOnTs(954800);
    await voter.vote(1, [DAICashPairAddress], [100]);

    expect(bribeDAICash.supplyNumCheckpoints()).is.not.eq(0);
    expect(bribeDAICash.rewardRate(dai.address)).is.not.eq(0);

    await bribeDAICash.batchUpdateRewardPerToken(dai.address, 3);
    await bribeDAICash.batchUpdateRewardPerToken(dai.address, 3);

    const n = await bribeDAICash.rewardPerTokenNumCheckpoints(dai.address);
    expect(n).is.not.eq(0);
    const checkpoint = await bribeDAICash.rewardPerTokenCheckpoints(dai.address, n.sub(1));
    const c = await bribeDAICash.getPriorRewardPerToken(dai.address, checkpoint.timestamp);
    expect(c[1]).is.not.eq(0);
    expect(c[1]).is.not.eq(0);
    expect(await bribeDAICash.rewardTokensLength()).is.eq(3);
    expect(await bribeDAICash.left(dai.address)).is.not.eq(0);
  });

  it("getRewardForOwner through voter", async function () {
    await voter.vote(1, [DAICashPairAddress], [100]);
    await dai.approve(bribeDAICash.address, parseUnits("100"));
    await bribeDAICash.notifyRewardAmount(dai.address, parseUnits("10"));

    const balanceBefore = await dai.balanceOf(owner.address);
    await voter.claimBribes([bribeDAICash.address], [[dai.address]], 1);
    expect((await dai.balanceOf(owner.address)).sub(balanceBefore)).is.not.eq(0);
  });

  it("reward per token for empty bribe", async function () {
    await voter.createGauge(CashSatinLPAddress);
    const gauge = await voter.gauges(CashSatinLPAddress);
    const bribe = await voter.bribes(gauge);

    expect(await bribe.connect(bribe, owner).rewardPerToken(dai.address)).is.eq(0);
  });

  it("double deposit should not reset rewards", async function () {
    await voter.vote(1, [DAICashPairAddress], [100]);

    await depositToGauge(core, owner2, dai.address, cashAddress, gaugeDAICash, 2);
    await depositToGauge(core, owner3, dai.address, cashAddress, gaugeDAICash, 0);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await minter.updatePeriod();
    await voter.distributeAll();

    await TimeUtils.advanceBlocksOnTs(WEEK / 2);

    // should not reset rewards after deposit and withdraw
    await gaugeDAICash.connect(owner3).withdrawAll();
    await depositToGauge(core, owner2, dai.address, cashAddress, gaugeDAICash, 2);

    await gaugeDAICash.connect(owner2).getReward(owner2.address, [token.address]);
    await gaugeDAICash.connect(owner3).getReward(owner3.address, [token.address]);

    expect(await token.balanceOf(owner2.address)).is.above(parseUnits("150000"));
    expect(await token.balanceOf(owner3.address)).is.above(parseUnits("150000"));
  });

  it("ve boost test", async function () {
    await voter.vote(1, [DAICashPairAddress], [100]);
    const veBal = await ve.balanceOfNFT(2);
    expect(veBal).is.not.eq(0);
    expect(await ve.balanceOf(owner3.address)).is.eq(0);

    await depositToGauge(core, owner2, dai.address, cashAddress, gaugeDAICash, 2);
    await depositToGauge(core, owner3, dai.address, cashAddress, gaugeDAICash, 0);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await minter.updatePeriod();
    await voter.distributeAll();

    await TimeUtils.advanceBlocksOnTs(WEEK);

    await gaugeDAICash.connect(owner2).getReward(owner2.address, [token.address]);
    await gaugeDAICash.connect(owner3).getReward(owner3.address, [token.address]);

    const balanceWithFullBoost = await token.balanceOf(owner2.address);
    const balanceWithoutBoost = await token.balanceOf(owner3.address);
    const rewardsSum = balanceWithFullBoost.add(balanceWithoutBoost);
    console.log("veBal 2", formatUnits(veBal));
    console.log("ve total supply", formatUnits(await ve.totalSupply()));
    console.log("balanceWithFullBoost", formatUnits(balanceWithFullBoost));
    console.log("balanceWithoutBoost", formatUnits(balanceWithoutBoost));
    console.log("rewardsSum", formatUnits(rewardsSum));
    const withoutBoostRatio = balanceWithoutBoost.mul(100).div(rewardsSum).toNumber();
    const withBoostRatio = balanceWithFullBoost.mul(100).div(rewardsSum).toNumber();
    expect(withoutBoostRatio).is.below(40);
    expect(withBoostRatio).is.above(40);
  });

  it("claim fees", async function () {
    const EXPECTED_FEE = "0.25";
    await dai.approve(router.address, parseUnits("10000"));
    await router.addLiquidityMATIC(dai.address, true, parseUnits("10000"), 0, 0, owner.address, BigNumber.from("999999999999999999"), { value: parseUnits("10000") });
    const pairAdr = await factory.getPair(dai.address, wmatic.address, true);
    const pair = pair.connect(pairAdr, owner);

    await voter.createGauge(pairAdr);

    const gaugeAdr = await voter.gauges(pairAdr);
    const gauge = await Gauge__factory.connect(gaugeAdr, owner);

    const bribeAdr = await voter.bribes(gaugeAdr);
    const bribe = await bribe.connect(bribeAdr, owner);

    await TestHelper.depositToGauge(owner, gauge, pair, await pair.balanceOf(owner.address), 1);
    const fees = await pair.fees();

    expect(await dai.balanceOf(bribeAdr)).is.eq(0);
    expect(await wmatic.balanceOf(bribeAdr)).is.eq(0);
    expect(await dai.balanceOf(fees)).is.eq(0);
    expect(await wmatic.balanceOf(fees)).is.eq(0);

    await dai.approve(router.address, parseUnits("99999"));
    await router.swapExactTokensForTokens(parseUnits("1000"), 0, [{ from: dai.address, to: wmatic.address, stable: true }], owner.address, BigNumber.from("999999999999999999"));
    await wmatic.approve(router.address, parseUnits("99999", 6));
    await router.swapExactTokensForTokens(parseUnits("1000", 6), 0, [{ to: dai.address, from: wmatic.address, stable: true }], owner.address, BigNumber.from("999999999999999999"));

    expect(await dai.balanceOf(fees)).is.eq(parseUnits(EXPECTED_FEE));
    expect(await wmatic.balanceOf(fees)).is.eq(parseUnits(EXPECTED_FEE, 6));

    await gauge.claimFees();

    expect(await dai.balanceOf(fees)).is.below(2);
    expect(await wmatic.balanceOf(fees)).is.below(2);

    expect(await gauge.fees0()).is.eq(0);
    expect(await gauge.fees1()).is.eq(0);

    expect(await dai.balanceOf(bribe.address)).is.above(parseUnits(EXPECTED_FEE).sub(2));
    expect(await wmatic.balanceOf(bribe.address)).is.above(parseUnits(EXPECTED_FEE, 6).sub(2));

    expect(await bribe.left(dai.address)).is.above(100);
    expect(await bribe.left(wmatic.address)).is.above(100);

    const EXPECTED_FEE2 = 3;
    const SWAP_AMOUNT = 10000;

    await router.swapExactTokensForTokens(SWAP_AMOUNT, 0, [{ from: dai.address, to: wmatic.address, stable: true }], owner.address, BigNumber.from("999999999999999999"));
    await router.swapExactTokensForTokens(SWAP_AMOUNT, 0, [{ to: dai.address, from: wmatic.address, stable: true }], owner.address, BigNumber.from("999999999999999999"));

    expect(await dai.balanceOf(fees)).is.eq(EXPECTED_FEE2 + 1);
    expect(await wmatic.balanceOf(fees)).is.eq(EXPECTED_FEE2 + 1);

    await gauge.claimFees();

    expect(await dai.balanceOf(fees)).is.below(3);
    expect(await wmatic.balanceOf(fees)).is.below(3);

    expect(await gauge.fees0()).is.eq(EXPECTED_FEE2 - 1);
    expect(await gauge.fees1()).is.eq(EXPECTED_FEE2 - 1);
  });

  it("gauge getReward for not owner or voter should be forbidden", async function () {
    await expect(gaugeDAICash.getReward(owner2.address, [])).revertedWith("Forbidden");
  });

  it("bribe getReward for not owner should reject", async function () {
    await expect(bribeDAICash.getReward(0, ["0x0000000000000000000000000000000000000000"])).revertedWith("Not token owner");
  });

  it("bribe getRewardForOwner for not voter should reject", async function () {
    await expect(bribeDAICash.getRewardForOwner(0, ["0x0000000000000000000000000000000000000000"])).revertedWith("Not voter");
  });

  it("bribe deposit for not voter should reject", async function () {
    await expect(bribeDAICash._deposit(0, 0)).revertedWith("Not voter");
  });

  it("bribe withdraw for not voter should reject", async function () {
    await expect(bribeDAICash._withdraw(0, 0)).revertedWith("Not voter");
  });

  it("bribe deposit with zero amount should reject", async function () {
    const voter = await Misc.impersonate(voter.address);
    await expect(bribeDAICash.connect(voter)._deposit(0, 0)).revertedWith("Zero amount");
  });

  it("bribe withdraw with zero amount should reject", async function () {
    const voter = await Misc.impersonate(voter.address);
    await expect(bribeDAICash.connect(voter)._withdraw(0, 0)).revertedWith("Zero amount");
  });

  it("bribe tokenIdToAddress should be rejected with too high tokenId", async function () {
    await expect(bribeDAICash.tokenIdToAddress(MAX_UINT)).revertedWith("Wrong convert");
  });

  it("bribe tokenIdToAddress should be rejected with too high tokenId", async function () {
    expect(await bribeDAICash.addressToTokenId(await bribeDAICash.tokenIdToAddress(1))).is.eq(1);
  });

  it("deposit with another tokenId should be rejected", async function () {
    expect(await gaugeDAICash.tokenIds(owner.address)).is.eq(1);
    await TestHelper.addLiquidity(factory, router, owner, dai.address, cashAddress, utils.parseUnits("1"), utils.parseUnits("1", 6), true);
    const pairAdr = await factory.getPair(dai.address, cashAddress, true);
    const pair = pair.connect(pairAdr, owner);
    const pairBalance = await pair.balanceOf(owner.address);
    expect(pairBalance).is.not.eq(0);
    await pair.approve(gaugeMimcashAddress, pairBalance);
    await expect(gaugeDAICash.deposit(pairBalance, 3)).revertedWith("Wrong token");
  });
});

//   it("claim fees", async function () {
//     const EXPECTED_FEE = "0.25";

//     await USDTCashPair.connect(owner).approve(gaugeUSDTCash.address, amount1000At6);
//     // await gaugeUSDTCash.connect(owner).deposit(, 0);
//     const fees = await USDTCashPair.fees();
//     await router.addLiquidity(cash.address, usdt.address, false, utils.parseUnits("1"), utils.parseUnits("1", 6), 1, 1, owner.address, Date.now());

//     await cash.approve(router.address, parseUnits("99999"));
//     await router.swapExactTokensForTokens(parseUnits("1000"), 0, [{ from: cash.address, to: usdt.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));
//     await usdt.approve(router.address, MAX_UINT);
//     await USDTCashPair.approve(ve.address, utils.parseUnits("1000"));
//     await ve.createLockFor(utils.parseUnits("1000"), WEEK, owner.address);
//     await router.swapExactTokensForTokens(parseUnits("1000", 6), 0, [{ to: cash.address, from: usdt.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));

//     await router.swapExactTokensForTokens(parseUnits("1000", 6), 0, [{ to: cash.address, from: usdt.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));

//     await router.swapExactTokensForTokens(parseUnits("1000", 6), 0, [{ to: cash.address, from: usdt.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));

//     console.log("_supplied", await USDTCashPair.index0());

//     console.log("Fee balance", await usdt.balanceOf(bribeUSDTCash.address));
//     await ve.claimFees();
//     console.log("ve address", ve.address);
//     console.log("Fee balance", await usdt.balanceOf(bribeUSDTCash.address));
//     // console.log("Balance After", await token.balanceOf(bribeUSDTCash.address));
//   });

//   xit("claim fee any user", async function () {
//     const EXPECTED_FEE = "0.25";
//     await USDTCashPair.connect(owner).approve(gaugeUSDTCash.address, amount1000At6);
//     await gaugeUSDTCash.connect(owner).deposit(amount1000At6, 0);
//     const fees = await USDTCashPair.fees();

//     await cash.approve(router.address, parseUnits("99999"));
//     await router.swapExactTokensForTokens(parseUnits("1000"), 0, [{ from: cash.address, to: token.address, stable: false }], owner.address, BigNumber.from("999999999999999999"));
//     await token.approve(router.address, MAX_UINT);
//     await router.swapExactTokensForTokens(
//       parseUnits("1000", 6),
//       0,
//       [{ to: cash.address, from: token.address, stable: false }],
//       owner.address,
//       BigNumber.from("999999999999999999")
//     );

// expect(await cash.balanceOf(fees)).is.eq(parseUnits(EXPECTED_FEE));
// expect(await token.balanceOf(fees)).is.eq(parseUnits(EXPECTED_FEE, 6));

// console.log("Balance before", await cash.balanceOf(owner3.address));
// console.log("Balance before", await token.balanceOf(owner3.address));

// // await USDTCashPair.approve(ve.address, ethers.BigNumber.from("2000000000000000000"));
// await ve.createLockFor(ethers.BigNumber.from("1000000000000000000"), WEEK, owner.address);
// await ve.connect(owner3).claimFees();

// console.log("Balance before", await cash.balanceOf(owner3.address));
// console.log("Balance After", await token.balanceOf(owner3.address));

// await voter.vote(1, [USDTCashPair.address], [ethers.BigNumber.from("5000")]);
// const tokenIDaddress = await bribeUSDTCash.tokenIdToAddress(1);
// console.log("tokenIDaddress", tokenIDaddress);
// console.log("earned", await bribeUSDTCash.earned(cash.address, tokenIDaddress));
// });

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
//     cashAddress,
//     utils.parseUnits("1"),
//     utils.parseUnits("1", 6),
//     true
//   );
//   const pairAdr = await factory.getPair(cash.address, cashAddress, true);
//   // const pair = pair.connect(pairAdr, owner);
//   const pair = (await ethers.getContractFactory("BaseV1Pair")).connect(pairAdr, owner);
//   const pairBalance = await pair.balanceOf(owner.address);
//   expect(pairBalance).is.not.eq(0);
//   await pair.approve(gaugeUSDTCash.address, pairBalance);
//   await expect(gaugeUSDTCash.deposit(pairBalance, 3)).revertedWith("Wrong token");
// });
async function depositToGauge(core, owner, token0, token1, gauge, tokenId) {
  await TestHelper.addLiquidity(factory, router, owner, token0, token1, utils.parseUnits("1"), utils.parseUnits("1", 6), true);
  const pairAdr = await factory.getPair(token0, token1, true);
  const pair = pair.connect(pairAdr, owner);
  const pairBalance = await pair.balanceOf(owner.address);
  expect(pairBalance).is.not.eq(0);
  await pair.approve(gauge.address, pairBalance);
  await gauge.connect(owner).deposit(pairBalance, tokenId);
}
