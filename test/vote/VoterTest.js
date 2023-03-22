const { expect } = require("chai");
const { ethers } = require("hardhat");
const { factory } = require("typescript");
const { TimeUtils } = require("../TimeUtils");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const { formatUnits, parseUnits } = require("ethers/lib/utils");
const { BigNumber, utils, Contract } = require("ethers");
const { parse } = require("typechain");
const MAX_UINT = BigNumber.from("115792089237316195423570985008687907853269984665640564039457584007913129639935");
const amount1000At6 = parseUnits("1000", 6);
const WEEK = 60 * 60 * 24 * 7;

describe("Voter tests", function () {
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
  let Factory;
  let Router;
  let Token;
  let Gaauges;

  let Briibes;
  let bribe_int;
  let Ve;
  let Ve_dist;
  let tresuryAddress = "0x9c4927530B1719e063D7E181C6c2e56353204e64";
  let gauge;
  let bribe;
  let helper;
  let fourPoolLPTokenAddress;
  let fourPoolAddress;
  let SwapContract;
  let staking;
  const pair1000 = BigNumber.from("1000000000");

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

    const minterMax = utils.parseUnits("58333333");

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
    cashAddress = cash.address;
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

    const SatinCashPairAddress = await router.pairFor(cashAddress, token.address, false);
    SatinCashPair = pair.attach(SatinCashPairAddress);

    await voter.createGauge(SatinCashPairAddress);
    expect(await voter.gauges(SatinCashPairAddress)).to.not.equal(ZERO_ADDRESS);

    const gaugeSatinCashAddress = await voter.gauges(SatinCashPairAddress);
    const bribeSatinCashAddress = await voter.external_bribes(gaugeSatinCashAddress);

    gaugeSatinCash = gauge.attach(gaugeSatinCashAddress);
    bribeSatinCash = bribe.attach(bribeSatinCashAddress);

    await SatinCashPair.approve(gaugeSatinCash.address, MAX_UINT);
    await gaugeSatinCash.deposit(parseUnits("100"), 0);

    const Staking = await ethers.getContractFactory("StakingRewards");

    staking = await Staking.deploy(SatinCashPair.address, token.address);
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

  it("Vote test", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    const balanceOfSatinCashPair = await SatinCashPair.balanceOf(owner.address);
    await ve.createLockFor(balanceOfSatinCashPair, 86400 * 365, owner.address);
    console.log("balanceOfNFT before", await ve.balanceOfNFT(1));
    await voter.vote(1, [SatinCashPair.address], [ethers.BigNumber.from("1000")]);
    console.log("Votes", await voter.votes(1, SatinCashPair.address));
  });

  it("Whitelisting test", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    const balanceOfSatinCashPair = await SatinCashPair.balanceOf(owner.address);
    await ve.createLockFor(balanceOfSatinCashPair, 86400 * 365, owner.address);
    const ERC20 = await ethers.getContractFactory("GenericERC20");
    const Token = await ERC20.deploy("TOKEN", "TKN", 18);

    await voter.whitelist(Token.address);
    expect(await voter.isWhitelisted(Token.address)).to.equal(true);
  });

  it("poolsLength test", async function () {
    expect(await voter.poolsLength()).to.equal(1);
  });

  it("gauge rewardsListLength", async function () {
    expect(await gaugeSatinCash.rewardTokensLength()).to.equal(2);
  });

  it("registerRewardToken test", async function () {
    expect(await gaugeSatinCash.rewardTokensLength()).to.equal(2);
    await SatinCashPair.approve(ve.address, MAX_UINT);
    const balanceOfSatinCashPair = await SatinCashPair.balanceOf(owner.address);
    console.log("balanceOfSatinCashPair", balanceOfSatinCashPair);
    await ve.createLockFor(parseUnits("800"), 86400 * 365, owner.address);
    await ve.createLockFor(parseUnits("1"), 86400 * 365, owner2.address);
    await expect(voter.registerRewardToken(dai.address, gaugeSatinCash.address)).revertedWith("!token");
    await expect(voter.registerRewardToken(dai.address, gaugeSatinCash.address)).revertedWith("!owner");
    await expect(voter.connect(owner2).registerRewardToken(dai.address, gaugeSatinCash.address)).revertedWith("!power");
    await voter.registerRewardToken(dai.address, gaugeSatinCash.address);
    expect(await gaugeSatinCash.rewardTokensLength()).to.equal(3);
  });

  it("removeRewardToken test", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    const balanceOfSatinCashPair = await SatinCashPair.balanceOf(owner.address);
    await ve.createLockFor(parseUnits("800"), 86400 * 365, owner.address);
    await ve.createLockFor(parseUnits("1"), 86400 * 365, owner2.address);
    expect(await gaugeSatinCash.rewardTokensLength()).to.equal(2);
    await voter.registerRewardToken(dai.address, gaugeSatinCash.address);
    await voter.registerRewardToken(wmatic.address, gaugeSatinCash.address);
    expect(await gaugeSatinCash.rewardTokensLength()).to.equal(4);
    await expect(voter.removeRewardToken(dai.address, gaugeSatinCash.address)).revertedWith("First tokens forbidden to remove");
    await expect(voter.removeRewardToken(dai.address, gaugeSatinCash.address)).revertedWith("!owner");
    await expect(voter.connect(owner2).removeRewardToken(dai.address, gaugeSatinCash.address)).revertedWith("!power");
    await voter.removeRewardToken(wmatic.address, gaugeSatinCash.address);
    expect(await gaugeSatinCash.rewardTokensLength()).to.equal(3);
  });

  it("veNFT gauge manipulate", async function () {
    expect(await gaugeSatinCash.tokenIds(owner.address)).to.equal(0);
    await SatinCashPair.approve(ve.address, MAX_UINT);
    const balanceOfSatinCashPair = await SatinCashPair.balanceOf(owner.address);
    await ve.createLockFor(pair1000, 86400 * 365, owner.address);
    await SatinCashPair.approve(gaugeSatinCash.address, pair1000);
    await gaugeSatinCash.deposit(pair1000, 1);
    expect(await gaugeSatinCash.tokenIds(owner.address)).to.equal(1);
    await SatinCashPair.approve(gaugeSatinCash.address, pair1000);
    await expect(gaugeSatinCash.deposit(pair1000, 2)).to.be.reverted;
    expect(await gaugeSatinCash.tokenIds(owner.address)).to.equal(1);
    // await expect(gaugeSatinCash.withdraw(0)).to.be.reverted;
    expect(await gaugeSatinCash.tokenIds(owner.address)).to.equal(1);
    await gaugeSatinCash.withdraw(0);
    expect(await gaugeSatinCash.tokenIds(owner.address)).to.equal(0);
  });

  it("deposit/withdraw and check", async function () {
    await SatinCashPair.connect(owner2).approve(staking.address, pair1000);
    await staking.connect(owner2).stake(pair1000);

    expect(await gaugeSatinCash.totalSupply()).to.equal("100000000000000000000");
    expect(await gaugeSatinCash.earned(ve.address, owner2.address)).to.equal(0);

    await gaugeSatinCash.withdraw(await gaugeSatinCash.balanceOf(owner.address));
    await gaugeSatinCash.connect(owner2).withdraw(await gaugeSatinCash.balanceOf(owner2.address));

    await staking.withdraw(await staking._balances(owner.address));
    await staking.connect(owner2).withdraw(await staking._balances(owner2.address));

    await gaugeSatinCash.withdraw(await gaugeSatinCash.balanceOf(owner.address));
    expect(await gaugeSatinCash.totalSupply()).to.equal(0);
  });

  it("add gauge & bribe rewards", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    const balanceOfSatinCashPair = await SatinCashPair.balanceOf(owner.address);
    await ve.createLockFor(pair1000, 86400 * 365, owner.address);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365);
    await ve.withdraw(1);

    await token.approve(gaugeSatinCash.address, pair1000);
    await token.approve(bribeSatinCash.address, pair1000);
    await token.approve(staking.address, pair1000);

    await gaugeSatinCash.notifyRewardAmount(token.address, pair1000, false);
    await bribeSatinCash.notifyRewardAmount(token.address, pair1000);
    await staking.notifyRewardAmount(pair1000);

    expect((await gaugeSatinCash.rewardRate(token.address)).div("1000000000000000000")).to.equal(BigNumber.from(1653439153439));
    expect((await bribeSatinCash.rewardRate(token.address)).div("1000000000000000000")).to.equal(BigNumber.from(1653439153439));
    expect(await staking.rewardRate()).to.equal(BigNumber.from(1653));
    expect((await gaugeSatinCash.rewardRate(token.address)).div("1000000000000000000")).to.be.equal(await staking.rewardRate());
  });

  it("exit & getReward gauge stake", async function () {
    await gaugeSatinCash.withdraw(await gaugeSatinCash.balanceOf(owner.address));

    await SatinCashPair.approve(ve.address, MAX_UINT);
    await SatinCashPair.approve(gaugeSatinCash.address, MAX_UINT);
    await ve.createLockFor(parseUnits("10"), 86400 * 365, owner.address);
    await gaugeSatinCash.deposit(parseUnits("10"), 1);

    await gaugeSatinCash.withdraw(parseUnits("10"));

    expect(await gaugeSatinCash.totalSupply()).to.equal(0);

    await gaugeSatinCash.deposit(parseUnits("10"), 1);

    await SatinCashPair.approve(staking.address, parseUnits("10"));
    await staking.stake(parseUnits("10"));
  });

  it("vote hacking", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await SatinCashPair.approve(voter.address, MAX_UINT);
    await ve.createLockFor(parseUnits("100"), 86400 * 365, owner.address);
    await voter.vote(1, [SatinCashPair.address], [5000]);
    expect(await voter.usedWeights(1)).to.closeTo(await ve.balanceOfNFT(1), 1000);
    expect(await bribeSatinCash.balanceOf(1)).to.equal(await voter.votes(1, SatinCashPair.address));
    await voter.reset(1);
    expect(await voter.usedWeights(1)).to.below(await ve.balanceOfNFT(1));
    expect(await voter.usedWeights(1)).to.equal(0);
    expect(await bribeSatinCash.balanceOf(1)).to.equal(await voter.votes(1, SatinCashPair.address));
    expect(await bribeSatinCash.balanceOf(1)).to.equal(0);
  });

  it("gauge poke without votes", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await SatinCashPair.approve(voter.address, MAX_UINT);
    await ve.createLockFor(parseUnits("100"), 86400 * 365, owner.address);
    expect(await voter.usedWeights(1)).to.equal(0);
    expect(await voter.votes(1, SatinCashPair.address)).to.equal(0);
    await voter.poke(1);
    expect(await voter.usedWeights(1)).to.equal(0);
    expect(await voter.votes(1, SatinCashPair.address)).to.equal(0);
  });

  it("gauge vote & bribe balanceOf", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await SatinCashPair.approve(voter.address, MAX_UINT);
    await ve.createLockFor(parseUnits("100"), 86400 * 365, owner.address);

    await voter.vote(1, [SatinCashPair.address], [5000]);
    expect(await voter.totalWeight()).to.not.equal(0);
    expect(await bribeSatinCash.balanceOf(1)).to.not.equal(0);
  });

  it("gauge poke hacking2", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await SatinCashPair.approve(voter.address, MAX_UINT);
    await ve.createLockFor(parseUnits("100"), 86400 * 365, owner.address);
    await voter.vote(1, [SatinCashPair.address], [5000]);
    const weightBefore = await voter.usedWeights(1);
    const votesBefore = await voter.votes(1, SatinCashPair.address);
    await voter.poke(1);
    expect(await voter.usedWeights(1)).to.be.below(weightBefore);
    expect(await voter.votes(1, SatinCashPair.address)).to.be.below(votesBefore);
  });

  it("vote hacking break mint", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await SatinCashPair.approve(voter.address, MAX_UINT);
    await ve.createLockFor(parseUnits("100"), 86400 * 365, owner.address);
    await voter.vote(1, [SatinCashPair.address], [5000]);

    expect(await voter.usedWeights(1)).to.closeTo(await ve.balanceOfNFT(1), 1000);
    expect(await bribeSatinCash.balanceOf(1)).to.equal(await voter.votes(1, SatinCashPair.address));
  });

  it("gauge poke hacking3", async function () {
    expect(await voter.usedWeights(1)).to.equal(await voter.votes(1, SatinCashPair.address));
    await voter.poke(1);
    expect(await voter.usedWeights(1)).to.equal(await voter.votes(1, SatinCashPair.address));
  });

  it("bribe claim rewards", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await ve.createLockFor(parseUnits("100"), 86400 * 365, owner.address);
    await bribeSatinCash.getReward(1, [token.address]);
    await TimeUtils.advanceBlocksOnTs(691200);
    await bribeSatinCash.getReward(1, [token.address]);
  });

  it("distribute and claim fees", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await ve.createLockFor(parseUnits("100"), 86400 * 365, owner.address);
    await TimeUtils.advanceBlocksOnTs(691200);
    await bribeSatinCash.getReward(1, [token.address, cash.address]);

    await voter.distributeFees([gaugeSatinCash.address]);
  });

  it("distribute gauge", async function () {
    await voter.distribute(gaugeSatinCash.address);
  });

  it("whitelist new token", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    const balanceOfSatinCashPair = await SatinCashPair.balanceOf(owner.address);
    await ve.createLockFor(balanceOfSatinCashPair, 86400 * 365, owner.address);
    const Token = await ethers.getContractFactory("GenericERC20");
    const mockToken = await Token.deploy("MOCK", "MOCK", 10);
    await mockToken.mint(owner.address, utils.parseUnits("1000000000000", 10));
    await voter.whitelist(mockToken.address);
    expect(await voter.isWhitelisted(mockToken.address)).is.eq(true);
  });

  it("double init reject test", async function () {
    await expect(voter.postInitialize([], owner.address)).revertedWith("!minter");
  });

  it("reset not owner reject test", async function () {
    await expect(voter.reset(0)).revertedWith("!owner");
  });

  // it("change vote test", async function () {
  //   await SatinCashPair.approve(ve.address, MAX_UINT);
  //   await ve.createLockFor(parseUnits("100"), 86400 * 365, owner.address);
  //   await voter.vote(1, [SatinCashPair.address], [100]);
  //   expect(await voter.votes(1, SatinCashPair.address)).above(parseUnits("99"));
  //   expect(await voter.weights(SatinCashPair.address)).above(parseUnits("99"));
  //   await voter.vote(1, [SatinCashPair.address], [500]);
  //   expect(await voter.votes(1, SatinCashPair.address)).above(parseUnits("49"));
  //   await voter.reset(1);
  //   expect(await voter.votes(1, SatinCashPair.address)).eq(0);
  //   await voter.vote(1, [SatinCashPair.address], [100]);
  //   expect(await voter.votes(1, SatinCashPair.address)).above(parseUnits("99"));
  // });

  it("vote with duplicate pool revert test", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await ve.createLockFor(parseUnits("100"), 86400 * 365, owner.address);
    await expect(voter.vote(1, [SatinCashPair.address, SatinCashPair.address], [100, 1])).revertedWith("duplicate pool");
  });

  it("vote with too low power revert test", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await ve.createLockFor(parseUnits("0.0000000000000001"), 86400 * 365, owner.address);
    await expect(voter.connect(owner).vote(1, [SatinCashPair.address], [parseUnits("1")])).revertedWith("zero power");
  });

  it("vote not owner revert test", async function () {
    await expect(voter.vote(99, [], [])).revertedWith("!owner");
  });

  it("vote wrong arrays revert test", async function () {
    await SatinCashPair.approve(ve.address, MAX_UINT);
    await ve.createLockFor(parseUnits("800"), 86400 * 365, owner.address);
    await expect(voter.vote(1, [], [1])).revertedWith("!arrays");
  });

  it("duplicate whitelist revert test", async function () {
    await voter.whitelist(dai.address);
    await expect(voter.whitelist(dai.address)).revertedWith("already whitelisted");
  });

  it("createGauge duplicate gauge revert test", async function () {
    await expect(voter.createGauge(SatinCashPair.address)).revertedWith("exists");
  });

  it("createGauge not pool revert test", async function () {
    await expect(voter.createGauge(owner.address)).revertedWith("!pool");
  });

  it("attachTokenToGauge not gauge revert test", async function () {
    await expect(voter.attachTokenToGauge(1, owner.address)).revertedWith("!gauge");
  });

  it("attachTokenToGauge zero token test", async function () {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [gaugeSatinCash.address],
    });
    await network.provider.send("hardhat_setBalance", [gaugeSatinCash.address, "0x10000000000000000"]);
    const gaugeSigner = await ethers.getSigner(gaugeSatinCash.address);
    await voter.connect(gaugeSigner).attachTokenToGauge(0, owner.address);
  });

  it("detachTokenFromGauge not gauge revert test", async function () {
    await expect(voter.detachTokenFromGauge(1, owner.address)).revertedWith("!gauge");
  });

  it("detachTokenFromGauge zero token test", async function () {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [gaugeSatinCash.address],
    });
    await network.provider.send("hardhat_setBalance", [gaugeSatinCash.address, "0x10000000000000000"]);
    const gaugeSigner = await ethers.getSigner(gaugeSatinCash.address);
    await voter.connect(gaugeSigner).detachTokenFromGauge(0, owner.address);
  });

  it("notifyRewardAmount zero amount revert test", async function () {
    await expect(voter.notifyRewardAmount(0)).revertedWith("zero amount");
  });

  it("notifyRewardAmount no votes revert test", async function () {
    await expect(voter.notifyRewardAmount(1)).revertedWith("!weights");
  });

  it("claimBribes not owner revert test", async function () {
    await expect(voter.claimBribes([], [[]], 99)).revertedWith("!owner");
  });

  it("claimFees not owner revert test", async function () {
    await expect(voter.claimFees([], [[]], 99)).revertedWith("!owner");
  });

  it("distributeForPoolsInRange test", async function () {
    await voter.distributeForPoolsInRange(0, 1);
  });

  it("distributeForPoolsInRange test", async function () {
    await voter.distributeForGauges([gaugeSatinCash.address]);
  });

  it("whitelist not owner revert test", async function () {
    await expect(voter.connect(owner3).whitelist(ZERO_ADDRESS)).revertedWith("!VoterOwner");
  });
});
