const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TimeUtils } = require("../TimeUtils");

xdescribe("fees tests", function () {
  let snapshotBefore;
  let snapshot;

  let owner;
  let owner2;
  let fees;
  let weth;
  let tokenA;
  let tokenB;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2] = await ethers.getSigners();
    let WETH = await ethers.getContractFactory("WETH");
    weth = await WETH.deploy();
    let TokenA = await ethers.getContractFactory("TokenA");
    let TokenB = await ethers.getContractFactory("TokenB");
    tokenA = await TokenA.deploy();
    tokenB = await TokenB.deploy();
    let Fees = await ethers.getContractFactory("BaseV1Fees");
    fees = await Fees.deploy(tokenA.address, tokenB.address);
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

  it("only pair allowed", async function () {
    await expect(fees.connect(owner2).claimFeesFor(owner.address, 0, 0)).revertedWith("Not Pair");
  });
});
