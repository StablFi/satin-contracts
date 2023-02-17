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

describe("token tests", function () {
  let snapshotBefore;
  let snapshot;

  let owner;
  let owner2;
  let owner3;
  let core;
  let ust;
  let mim;
  let dai;
  let wmatic;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();
    let Weth = await ethers.getContractFactory("WETH");
    wmatic = await Weth.deploy();

    let GenericERC20 = await ethers.getContractFactory("GenericERC20");

    ust = await GenericERC20.deploy("UST", "UST", 18);
    mim = await GenericERC20.deploy("MIM", "MIM", 18);
    dai = await GenericERC20.deploy("DAI", "DAI", 6);
    cash = await GenericERC20.deploy("CASH", "CASH", 6);

    await ust.mint(owner2.address, utils.parseUnits("100", 6));
    await mim.mint(owner2.address, utils.parseUnits("100"));
    await dai.mint(owner2.address, utils.parseUnits("100"));
    await cash.mint(owner2.address, utils.parseUnits("100"));

    await ust.mint(owner.address, utils.parseUnits("100", 6));
    await mim.mint(owner.address, utils.parseUnits("100"));
    await dai.mint(owner.address, utils.parseUnits("100"));
    await cash.mint(owner.address, utils.parseUnits("100"));

    await ust.mint(owner3.address, utils.parseUnits("100", 6));
    await mim.mint(owner3.address, utils.parseUnits("100"));
    await dai.mint(owner3.address, utils.parseUnits("100"));
    await cash.mint(owner3.address, utils.parseUnits("100"));

    let Factory = await ethers.getContractFactory("BaseV1Factory");
    let factory = await Factory.deploy(owner3.address, { gasLimit: 12000000 });
    let Router = await ethers.getContractFactory("BaseV1Router01");
    let router = await Router.deploy(factory.address, wmatic.address);

    const voterTokens = [wmatic.address, ust.address, mim.address, dai.address];
    const minterClaimants = [owner.address, owner2.address, owner.address];
    const minterClaimantsAmounts = [
      utils.parseUnits("100"),
      utils.parseUnits("100"),
      BigNumber.from(100),
    ];
    let minterMax = BigNumber.from("0");

    for (const c of minterClaimantsAmounts) {
      minterMax = minterMax.add(c);
    }

    pair = await ethers.getContractFactory("BaseV1Pair");
    const Token = await ethers.getContractFactory("Satin");
    const Gaauges = await ethers.getContractFactory("GaugeFactory");
    const Gauges = await ethers.getContractFactory("Gauge");
    const Briibes = await ethers.getContractFactory("BribeFactory");
    const Bribes = await ethers.getContractFactory("Bribe");
    const Ve = await ethers.getContractFactory("Ve");
    const Ve_dist = await ethers.getContractFactory("VeDist");
    const BaseV1Voter = await ethers.getContractFactory("SatinVoter");
    const BaseV1Minter = await ethers.getContractFactory("SatinMinter");
    const Controller = await ethers.getContractFactory("Controller");

    controller = await Controller.deploy();
    token = await Token.deploy();
    gauges = await Gaauges.deploy();
    bribes = await Briibes.deploy();
    ve = await Ve.deploy(controller.address);
    ve_dist = await Ve_dist.deploy(ve.address, token.address);
    voter = await BaseV1Voter.deploy(
      ve.address,
      factory.address,
      gauges.address,
      bribes.address,
      token.address
    );
    minter = await BaseV1Minter.deploy(ve.address, controller.address, token.address, 2);

    const fourPoolAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
    const fourPoolLPTokenAddress = "0xd8058efe0198ae9dD7D563e1b4938Dcbc86A1F81";
    const cashAddress = cash.address;

    await token.setMinter(minter.address);
    await ve_dist.setDepositor(minter.address);
    await controller.setVeDist(ve_dist.address);
    await controller.setVoter(voter.address);
    await voter.initialize(voterTokens, minter.address, fourPoolAddress, fourPoolLPTokenAddress);
    await minter.initialize(minterClaimants, minterClaimantsAmounts, minterMax);
    console.log("Minter contract initialized");
    console.log("cashAddress", cashAddress);
    console.log("tokenAddress", token.address);
    await factory.createPair(cashAddress, token.address, false);
    const CashSatinLPAddress = await factory.getPair(cashAddress, token.address, false);
    console.log("CashSatinLPAddress", CashSatinLPAddress);

    await ve.initialize(CashSatinLPAddress);
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

  it("set minter reject", async function () {
    await expect(token.setMinter(ZERO_ADDRESS)).revertedWith("SATIN: Not minter");
  });

  it("approve reject", async function () {
    await expect(token.approve(ZERO_ADDRESS, 0)).revertedWith("SATIN: Approve to the zero address");
  });

  it("mint to zero address reject", async function () {
    const minter = await impersonate(await token.minter());
    await expect(token.connect(minter).mint(ZERO_ADDRESS, 1)).revertedWith(
      "SATIN: Mint to the zero address"
    );
  });

  it("transfer to zero address reject", async function () {
    await expect(token.transfer(ZERO_ADDRESS, 1)).revertedWith(
      "SATIN: Transfer to the zero address"
    );
  });

  it("transfer to too much reject", async function () {
    await expect(token.transfer(owner2.address, MAX_UINT)).revertedWith(
      "SATIN: Transfer amount exceeds balance"
    );
  });

  it("transfer from to too much reject", async function () {
    const minter = await impersonate(await token.minter());
    await token.connect(minter).mint(owner2.address, 100);
    await token.connect(owner2).approve(owner.address, 100);
    await token.transferFrom(owner2.address, owner.address, 100);
    // expect(await token.balanceOf(owner.address)).eq(100);
    expect(await token.balanceOf(owner2.address)).eq(0);
    await expect(token.transferFrom(owner2.address, owner.address, 1)).revertedWith(
      "SATIN: Insufficient allowance"
    );
  });

  it("mint from not minter reject", async function () {
    await expect(token.mint(ZERO_ADDRESS, 1)).revertedWith("SATIN: Not minter");
  });
});

async function impersonate(address) {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });

  await hre.network.provider.request({
    method: "hardhat_setBalance",
    params: [address, "0x1431E0FAE6D7217CAA0000000"],
  });
  console.log("address impersonated", address);
  return ethers.getSigner(address);
}
