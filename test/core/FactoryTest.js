const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TimeUtils } = require("../TimeUtils");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

xdescribe("Factory Tests", function () {
  let snapshotBefore;
  let snapshot;

  let owner;
  let owner2;
  let owner3;
  let factory;
  let weth;
  let tokenA;
  let tokenB;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();
    let Weth = await ethers.getContractFactory("WETH");
    weth = await Weth.deploy();
    let Factory = await ethers.getContractFactory("BaseV1Factory");
    factory = await Factory.deploy();
    let TokenA = await ethers.getContractFactory("TokenA");
    tokenA = await TokenA.deploy();
    let TokenB = await ethers.getContractFactory("TokenB");
    tokenB = await TokenB.deploy();
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

  it("set pauser", async function () {
    await factory.setPauser(owner2.address);
    await factory.connect(owner2).acceptPauser();
    expect(await factory.pauser()).is.eq(owner2.address);
  });

  it("set pauser only from pauser", async function () {
    await expect(factory.connect(owner2).setPauser(owner2.address)).to.be.reverted;
  });

  it("accept pauser only from pending pauser", async function () {
    await factory.setPauser(owner2.address);
    await expect(factory.connect(owner).acceptPauser()).to.be.reverted;
  });

  it("pause", async function () {
    await factory.connect(owner).setPause(true);
    expect(await factory.isPaused()).is.eq(true);
  });

  it("pause only from pauser", async function () {
    await expect(factory.connect(owner2).setPause(true)).to.be.reverted;
  });

  it("create pair with the same tokens should revert", async function () {
    await expect(factory.createPair(ZERO_ADDRESS, ZERO_ADDRESS, true)).revertedWith("IA");
  });

  it("create pair with zero address should revert", async function () {
    await expect(factory.createPair(weth.address, ZERO_ADDRESS, true)).revertedWith("ZA");
  });

  it("set fees with new address should revert", async function () {
    await expect(factory.connect(owner2).setSwapFee(ZERO_ADDRESS, 1)).to.be.reverted;
  });

  it("Should not create same pair again", async function () {
    await factory.createPair(tokenA.address, tokenB.address, false);
    await expect(factory.createPair(tokenA.address, tokenB.address, false)).revertedWith("PE");
  });

  it("Check created pair variables", async function () {
    await factory.createPair(tokenA.address, tokenB.address, false);
    const pairAddress = await factory.getPair(tokenA.address, tokenB.address, false);
    const PairContract = await ethers.getContractFactory("BaseV1Pair");
    const pair = PairContract.attach(pairAddress);
    expect(await pair.fees()).not.eq(ZERO_ADDRESS);
    expect(await pair.stable()).eq(false);
  });

  it("Set Swap Fee", async function () {
    await factory.createPair(tokenA.address, tokenB.address, false);
    const pairAddress = await factory.getPair(tokenA.address, tokenB.address, false);
    const PairContract = await ethers.getContractFactory("BaseV1Pair");
    const pair = PairContract.attach(pairAddress);
    await factory.setSwapFee(pairAddress, 1500);
    expect(await pair.swapFee()).to.be.eq("1500");
    await expect(factory.setSwapFee(pairAddress, 1500)).to.emit(pair, "FeesChanged").withArgs(1500);
  });

  it("Set Partner Address", async function () {
    await factory.createPair(tokenA.address, tokenB.address, false);
    const pairAddress = await factory.getPair(tokenA.address, tokenB.address, false);
    const PairContract = await ethers.getContractFactory("BaseV1Pair");
    const pair = PairContract.attach(pairAddress);
    await factory.setPartnerAddress(pairAddress, owner.address);
    expect(await pair.partnerAddress()).to.be.equal(owner.address);
  });

  it("Set PriorityPair", async function () {
    await factory.createPair(tokenA.address, tokenB.address, false);
    const pairAddress = await factory.getPair(tokenA.address, tokenB.address, false);
    const PairContract = await ethers.getContractFactory("BaseV1Pair");
    const pair = PairContract.attach(pairAddress);
    await factory.setIfPriorityPair(pairAddress, true);
    expect(await pair.isPriorityPair()).to.be.equal(true);
    expect(await pair.swapFee()).to.be.equal(1500);
  });

  it("Set PriorityPair false", async function () {
    await factory.createPair(tokenA.address, tokenB.address, false);
    const pairAddress = await factory.getPair(tokenA.address, tokenB.address, false);
    const PairContract = await ethers.getContractFactory("BaseV1Pair");
    const pair = PairContract.attach(pairAddress);
    await factory.setIfPriorityPair(pairAddress, false);
    expect(await pair.isPriorityPair()).to.be.equal(false);
    expect(await pair.swapFee()).to.be.equal(2500);
  });
});
