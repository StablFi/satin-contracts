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
      86400 * 365,
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

  xit("Testing createLockForOwner function", async function () {
    await ve.createLockForOwner(utils.parseUnits("100"), 86400 * 365, owner2.address);
    expect(await ve.ownerOf(2)).to.be.equal(owner2.address);
  });

  xit("Admin NFT cannot withdraw", async function () {
    await ve.createLockForOwner(utils.parseUnits("100"), 86400 * 365, owner.address);
    await network.provider.send("evm_increaseTime", [365 * 86400]);
    await network.provider.send("evm_mine");
    await expect(ve.withdraw(2)).revertedWith("OwnerNFT");
  });

  it("Admin NFT cannot withdraw", async function () {
    await ve.createLockForOwner(utils.parseUnits("100"), 86400 * 365, owner.address);
    await network.provider.send("evm_increaseTime", [365 * 86400]);
    await network.provider.send("evm_mine");
    await expect(ve.increaseUnlockTime(2, 60 * 60 * 24 * 365 )).revertedWith("OwnerNFT");
  });

  it("Admin NFT cannot merge", async function () {
    await ve.createLockForOwner(utils.parseUnits("100"), 86400 * 365, owner3.address);
    await SatinCashPair.approve(ve.address, ethers.BigNumber.from("2000000000000000000"));
    await ve.createLockFor(
      ethers.BigNumber.from("1000000000000000000"),
      86400 * 365,
      owner3.address
    );
    await network.provider.send("evm_increaseTime", [365 * 86400]);
    await network.provider.send("evm_mine");
    await expect(ve.merge(1, 2)).revertedWith("OwnerNFT");
  });

  xit("Admin can vote", async function () {
    await ve.createLockForOwner(utils.parseUnits("100"), 86400 * 365, owner.address);
    await voter.createGauge(SatinCashPair.address);
    await voter.vote(1, [SatinCashPair.address], [ethers.BigNumber.from("5000")]);
    console.log("Weights", await voter.weights(SatinCashPair.address));
  });

  xit("Only owner can create OwnerNFT", async function () {
    await expect(
      ve.connect(owner2).createLockForOwner(utils.parseUnits("100"), 86400 * 365, owner.address)
    ).revertedWith("!VeOwner");
  });

  it("transferFrom with attached token revert test", async function () {
    // await TestHelper.depositToGauge(owner, gauge, pair, parseUnits("0.0001"), 1);
    await voter.createGauge(SatinCashPair.address);
    const gaugeAddress = await voter.gauges(SatinCashPair.address);
    const bribeAddress = await voter.bribes(gaugeAddress);

    const SatinCashGauge = gauge.attach(gaugeAddress);
    const SatinCashBribe = bribe.attach(bribeAddress);

    await SatinCashPair.approve(SatinCashGauge.address, MAX_UINT);

    await SatinCashGauge.deposit(parseUnits("0.0001"), 1);

    // console.log("Attachment", await ve.attachments(1));

    await expect(ve.transferFrom(owner.address, owner2.address, 1)).revertedWith("attached");
  });

  // it("transferFrom not owner revert test", async function () {
  //   await expect(ve.transferFrom(owner2.address, owner.address, 1)).revertedWith("!owner");
  // });

  it("transferFrom /!owner remove/ revert test", async function () {
    await expect(ve.transferFrom(owner2.address, owner.address, 1)).revertedWith("!owner remove");
  });

  it("transferFrom zero dst revert test", async function () {
    await expect(ve.transferFrom(owner.address, ZERO_ADDRESS, 1)).revertedWith("dst is zero");
  });

  it("transferFrom reset approves test", async function () {
    await ve.approve(owner2.address, 1);
    expect(await ve.isApprovedOrOwner(owner2.address, 1)).eq(true);
    await ve.transferFrom(owner.address, owner3.address, 1);
    expect(await ve.isApprovedOrOwner(owner2.address, 1)).eq(false);
  });

  it("approve invalid id revert test", async function () {
    await expect(ve.approve(owner2.address, 99)).revertedWith("invalid id");
  });

  it("approve self approve revert test", async function () {
    await expect(ve.approve(owner.address, 1)).revertedWith("self approve");
  });

  it("setApprovalForAll operator is sender revert test", async function () {
    await expect(ve.setApprovalForAll(owner.address, true)).revertedWith("operator is sender");
  });

  it("mint to zero dst revert test", async function () {
    await expect(ve.createLockFor(1, 60 * 60 * 24 * 365, ZERO_ADDRESS)).revertedWith("zero dst");
  });

  it("voting revert", async function () {
    await expect(ve.voting(1)).revertedWith("!voter");
  });

  it("abstain revert", async function () {
    await expect(ve.abstain(1)).revertedWith("!voter");
  });

  it("attach revert", async function () {
    await expect(ve.attachToken(1)).revertedWith("!voter");
  });

  it("detach revert", async function () {
    await expect(ve.detachToken(1)).revertedWith("!voter");
  });

  it("merge attached revert", async function () {
    // await TestHelper.depositToGauge(owner, gauge, pair, parseUnits("0.0001"), 1);
    await voter.createGauge(SatinCashPair.address);
    const gaugeAddress = await voter.gauges(SatinCashPair.address);
    const bribeAddress = await voter.bribes(gaugeAddress);

    const SatinCashGauge = gauge.attach(gaugeAddress);
    const SatinCashBribe = bribe.attach(bribeAddress);

    await SatinCashPair.approve(SatinCashGauge.address, MAX_UINT);

    await SatinCashGauge.deposit(parseUnits("0.0001"), 1);
    await expect(ve.merge(1, 2)).revertedWith("attached");
  });

  it("merge the same revert", async function () {
    await expect(ve.merge(1, 1)).revertedWith("the same");
  });

  it("merge !owner from revert", async function () {
    await expect(ve.merge(2, 1)).revertedWith("!owner from");
  });

  it("merge !owner to revert", async function () {
    await expect(ve.merge(1, 2)).revertedWith("!owner to");
  });

  it("deposit zero revert", async function () {
    await expect(ve.depositFor(1, 0)).revertedWith("zero value");
  });

  it("deposit for not locked revert", async function () {
    await expect(ve.depositFor(99, 1)).revertedWith("No existing lock found");
  });

  it("deposit for expired revert", async function () {
    await voter.createGauge(SatinCashPair.address);
    const gaugeAddress = await voter.gauges(SatinCashPair.address);
    const bribeAddress = await voter.bribes(gaugeAddress);

    const SatinCashGauge = gauge.attach(gaugeAddress);
    const SatinCashBribe = bribe.attach(bribeAddress);

    await SatinCashPair.approve(SatinCashGauge.address, MAX_UINT);

    await SatinCashGauge.deposit(parseUnits("0.0001"), 1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365 * 2);
    await expect(ve.depositFor(1, 1)).revertedWith("Cannot add to expired lock. Withdraw");
  });

  it("create lock zero value revert", async function () {
    await expect(ve.createLock(0, 1)).revertedWith("zero value");
  });

  it("create lock zero period revert", async function () {
    await expect(ve.createLock(1, 0)).revertedWith("Can only lock until time in the future");
  });

  it("create lock too big period revert", async function () {
    await expect(ve.createLock(1, 1e12)).revertedWith("Voting lock can be 1 year max");
  });

  it("increaseAmount not owner revert", async function () {
    await expect(ve.connect(owner2).increaseAmount(1, 1)).revertedWith("!owner");
  });

  it("increaseAmount zero value revert", async function () {
    await expect(ve.increaseAmount(1, 0)).revertedWith("zero value");
  });

  it("increaseAmount not locked revert", async function () {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365 * 5);
    await ve.withdraw(1);
    await expect(ve.increaseAmount(1, 1)).revertedWith("No existing lock found");
  });

  it("increaseAmount expired revert", async function () {
    // await TestHelper.depositToGauge(owner, gauge, pair, parseUnits('0.0001'), 1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365 * 5);
    await expect(ve.increaseAmount(1, 1)).revertedWith("Cannot add to expired lock. Withdraw");
  });

  it("increaseUnlockTime not owner revert", async function () {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 180);
    await expect(ve.connect(owner2).increaseUnlockTime(1, 60 * 60 * 24 * 365)).revertedWith(
      "!owner"
    );
  });

  it("increaseUnlockTime lock expired revert", async function () {
    await voter.createGauge(SatinCashPair.address);
    const gaugeAddress = await voter.gauges(SatinCashPair.address);
    const bribeAddress = await voter.bribes(gaugeAddress);

    const SatinCashGauge = gauge.attach(gaugeAddress);
    const SatinCashBribe = bribe.attach(bribeAddress);

    await SatinCashPair.approve(SatinCashGauge.address, MAX_UINT);

    await SatinCashGauge.deposit(parseUnits("0.0001"), 1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365 * 5);
    await expect(ve.increaseUnlockTime(1, 1)).revertedWith("Lock expired");
  });

  it("increaseUnlockTime not locked revert", async function () {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365 * 2);
    await ve.withdraw(1);
    await expect(ve.increaseUnlockTime(1, 60 * 60 * 24 * 365)).revertedWith("Nothing is locked");
  });

  it("increaseUnlockTime zero extend revert", async function () {
    await voter.createGauge(SatinCashPair.address);
    const gaugeAddress = await voter.gauges(SatinCashPair.address);
    const bribeAddress = await voter.bribes(gaugeAddress);

    const SatinCashGauge = gauge.attach(gaugeAddress);
    const SatinCashBribe = bribe.attach(bribeAddress);

    await SatinCashPair.approve(SatinCashGauge.address, MAX_UINT);

    await SatinCashGauge.deposit(parseUnits("0.0001"), 1);
    await expect(ve.increaseUnlockTime(1, 0)).revertedWith("Can only increase lock duration");
  });

  it("increaseUnlockTime too big extend revert", async function () {
    await voter.createGauge(SatinCashPair.address);
    const gaugeAddress = await voter.gauges(SatinCashPair.address);
    const bribeAddress = await voter.bribes(gaugeAddress);

    const SatinCashGauge = gauge.attach(gaugeAddress);
    const SatinCashBribe = bribe.attach(bribeAddress);

    await SatinCashPair.approve(SatinCashGauge.address, MAX_UINT);

    await SatinCashGauge.deposit(parseUnits("0.0001"), 1);
    await expect(ve.increaseUnlockTime(1, 1e12)).revertedWith("Voting lock can be 1 year max");
  });

  it("withdraw not owner revert", async function () {
    await expect(ve.withdraw(2)).revertedWith("!owner");
  });

  it("withdraw attached revert", async function () {
    await voter.createGauge(SatinCashPair.address);
    const gaugeAddress = await voter.gauges(SatinCashPair.address);
    const bribeAddress = await voter.bribes(gaugeAddress);

    const SatinCashGauge = gauge.attach(gaugeAddress);
    const SatinCashBribe = bribe.attach(bribeAddress);

    await SatinCashPair.approve(SatinCashGauge.address, MAX_UINT);

    await SatinCashGauge.deposit(parseUnits("0.0001"), 1);
    await expect(ve.withdraw(1)).revertedWith("attached");
  });

  it("withdraw not expired revert", async function () {
    await expect(ve.withdraw(1)).revertedWith("The lock did not expire");
  });

  it("balanceOfNFT zero epoch test", async function () {
    expect(await ve.balanceOfNFT(99)).eq(0);
  });

  it("balanceOfNFT flash protection test", async function () {
    await ve.approve(helper.address, 1);
    await helper.veFlashTransfer(ve.address, 1);
    await ve.approve(helper.address, 1);
    await helper.veFlashTransfer(ve.address, 1);
  });

  it("tokenURI for not exist revert", async function () {
    await expect(ve.tokenURI(99)).revertedWith("Query for nonexistent token");
  });

  it("balanceOfNFTAt for new block revert", async function () {
    await expect(ve.balanceOfAtNFT(1, Date.now() * 10)).revertedWith("only old block");
  });

  it("totalSupplyAt for new block revert", async function () {
    await expect(ve.totalSupplyAt(Date.now() * 10)).revertedWith("only old blocks");
  });

  it("tokenUri for expired lock", async function () {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365 * 5);
    expect(await ve.tokenURI(1)).not.eq("");
  });

  it("totalSupplyAt for not exist epoch", async function () {
    expect(await ve.totalSupplyAt(0)).eq(0);
  });

  it("totalSupplyAt for first epoch", async function () {
    const start = (await ve.pointHistory(0)).blk;
    expect(await ve.totalSupplyAt(start)).eq(0);
    expect(await ve.totalSupplyAt(start.add(1))).eq(0);
  });

  it("totalSupplyAt for second epoch", async function () {
    const start = (await ve.pointHistory(1)).blk;
    expect(await ve.totalSupplyAt(start)).not.eq(0);
    expect(await ve.totalSupplyAt(start.add(1))).not.eq(0);
  });

  it("checkpoint for a long period", async function () {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365 * 3);
    await ve.checkpoint();
  });

  it("balanceOfNFTAt loop test", async function () {
    const cp0 = await ve.userPointHistory(2, 0);
    await ve.balanceOfAtNFT(2, cp0.blk);
    const cp1 = await ve.userPointHistory(2, 1);
    await ve.balanceOfAtNFT(2, cp1.blk.add(1));
  });

  it("supportsInterface test", async function () {
    expect(await ve.supportsInterface("0x00000000")).is.eq(false);
  });

  it("get_last_user_slope test", async function () {
    expect(await ve.getLastUserSlope(0)).is.eq(0);
  });

  it("user_point_history__ts test", async function () {
    expect(await ve.userPointHistoryTs(0, 0)).is.eq(0);
  });

  it("locked__end test", async function () {
    expect(await ve.lockedEnd(0)).is.eq(0);
  });

  it("balanceOf test", async function () {
    expect(await ve.balanceOf(owner.address)).is.eq(1);
  });

  it("getApproved test", async function () {
    expect(await ve.getApproved(owner.address)).is.eq(ZERO_ADDRESS);
  });

  it("isApprovedForAll test", async function () {
    expect(await ve.isApprovedForAll(owner.address, owner.address)).is.eq(false);
  });

  it("tokenOfOwnerByIndex test", async function () {
    expect(await ve.tokenOfOwnerByIndex(owner.address, 0)).is.eq(1);
  });

  it("safeTransferFrom test", async function () {
    await ve["safeTransferFrom(address,address,uint256)"](owner.address, owner.address, 1);
  });

  it("safeTransferFrom to wrong contract test", async function () {
    await expect(
      ve["safeTransferFrom(address,address,uint256)"](owner.address, token.address, 1)
    ).revertedWith("ERC721: transfer to non ERC721Receiver implementer");
  });

  it("setApprovalForAll test", async function () {
    await ve.setApprovalForAll(owner2.address, true);
  });

  it("increase_unlock_time test", async function () {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 300);
    await ve.increaseUnlockTime(1, 60 * 60 * 24 * 365);
    await expect(ve.increaseUnlockTime(1, 60 * 60 * 24 * 365 * 4)).revertedWith(
      "Voting lock can be 1 year max"
    );
  });

  it("tokenURI test", async function () {
    await ve.tokenURI(1);
  });

  it("balanceOfNFTAt test", async function () {
    await ve.balanceOfNFTAt(1, 0);
  });
});
