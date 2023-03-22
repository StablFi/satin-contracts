const { ethers } = require("hardhat");
const chai = require("chai");
const { Deploy } = require("../../scripts/deploy/Deploy");
const { BigNumber, utils } = require("ethers");
const { TestHelper } = require("../TestHelper");
const { TimeUtils } = require("../TimeUtils");
const { formatUnits, parseUnits } = require("ethers/lib/utils");
const { Misc } = require("../../scripts/Misc");

const { expect } = chai;

const amount1000At6 = parseUnits("1000", 6);
const WEEK = 60 * 60 * 24 * 7;

describe("gauge and bribe tests", function () {
  let snapshotBefore;
  let snapshot;

  let owner;
  let owner2;
  let owner3;
  let core;
  let USDT;
  let CASH;
  let dai;
  let wmatic;
  let CASHUSDTPair;
  let CASHDaiPair;
  let satinpair;
  let satinBribe;
  let satinGauge;
  // let USDTDaiPair: DystPair;

  let gaugeCASHUSDT;
  // let gaugeCASHDai: Gauge;

  let bribeCASHUSDT;
  // let bribeCASHDai: Bribe;

  before(async function () {
    satinpair = await ethers.getContractFactory("BaseV1Pair");
    satinBribe = await ethers.getContractFactory("ExternalBribe");
    satinGauge = await ethers.getContractFactory("Gauge");
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    wmatic = await Deploy.deployContract(owner, "Token", "WMATIC", "WMATIC", 18, owner.address);
    await wmatic.mint(owner.address, parseUnits("100000"));

    [USDT, CASH, dai] = await TestHelper.createMockTokensAndMint(owner);
    await USDT.transfer(owner2.address, utils.parseUnits("100", 6));
    await CASH.transfer(owner2.address, utils.parseUnits("100"));
    await dai.transfer(owner2.address, utils.parseUnits("100"));

    await USDT.transfer(owner3.address, utils.parseUnits("100", 6));
    await CASH.transfer(owner3.address, utils.parseUnits("100"));
    await dai.transfer(owner3.address, utils.parseUnits("100"));

    core = await Deploy.deployCore(
      owner,
      wmatic.address,
      [wmatic.address, USDT.address, CASH.address, dai.address],
      [owner.address, owner2.address, owner.address],
      [utils.parseUnits("100"), utils.parseUnits("100"), BigNumber.from(100)],
      utils.parseUnits("200").add(100),
      2
    );

    CASHUSDTPair = await TestHelper.addLiquidity(core.factory, core.router, owner, CASH.address, USDT.address, utils.parseUnits("1"), utils.parseUnits("1", 6), true);
    CASHDaiPair = await TestHelper.addLiquidity(core.factory, core.router, owner, CASH.address, dai.address, utils.parseUnits("1"), utils.parseUnits("1"), true);

    // ------------- setup gauges and bribes --------------

    await core.token.approve(core.voter.address, BigNumber.from("1500000000000000000000000"));
    await core.voter.createGauge(CASHUSDTPair.address);
    expect(await core.voter.gauges(CASHUSDTPair.address)).to.not.equal(0x0000000000000000000000000000000000000000);

    const gaugeCASHUSDTAddress = await core.voter.gauges(CASHUSDTPair.address);
    const bribeCASHUSDTAddress = await core.voter.bribes(gaugeCASHUSDTAddress);

    gaugeCASHUSDT = satinGauge.connect(gaugeCASHUSDTAddress, owner);

    bribeCASHUSDT = satinBribe.connect(bribeCASHUSDTAddress, owner);

    await TestHelper.depositToGauge(owner, gaugeCASHUSDT, CASHUSDTPair, amount1000At6, 1);

    expect(await gaugeCASHUSDT.totalSupply()).to.equal(amount1000At6);
    expect(await gaugeCASHUSDT.earned(core.ve.address, owner.address)).to.equal(0);
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
    expect(await bribeCASHUSDT.getPriorBalanceIndex(Misc.ZERO_ADDRESS, 0)).is.eq(0);
  });

  it("getPriorBalanceIndex test", async function () {
    await core.voter.vote(1, [CASHUSDTPair.address], [100]);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.voter.reset(1);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.voter.vote(1, [CASHUSDTPair.address], [100]);

    const adr1 = await bribeCASHUSDT.tokenIdToAddress(1);

    const checkPointN = await bribeCASHUSDT.numCheckpoints(adr1);
    expect(checkPointN).is.not.eq(0);
    const checkPoint = await bribeCASHUSDT.checkpoints(adr1, checkPointN.sub(2));
    console.log("checkpoint timestamp", checkPoint.timestamp.toString());
    console.log("checkpoint bal", checkPoint.value.toString());
    expect(await bribeCASHUSDT.getPriorBalanceIndex(adr1, checkPoint.timestamp)).is.eq(1);
    expect(await bribeCASHUSDT.getPriorBalanceIndex(adr1, checkPoint.timestamp.add(1))).is.eq(1);
    expect(await bribeCASHUSDT.getPriorBalanceIndex(adr1, checkPoint.timestamp.sub(1))).is.eq(0);
  });

  it("getPriorSupplyIndex for empty bribe", async function () {
    await core.voter.createGauge(CASHDaiPair.address);
    const gauge = await core.voter.gauges(CASHDaiPair.address);
    const bribe = await core.voter.bribes(gauge);

    expect(await satinBribe.connect(bribe, owner).getPriorSupplyIndex(0)).is.eq(0);
  });

  it("getPriorSupplyIndex test", async function () {
    await core.voter.vote(1, [CASHUSDTPair.address], [100]);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.voter.reset(1);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.voter.vote(1, [CASHUSDTPair.address], [100]);

    const n = await bribeCASHUSDT.supplyNumCheckpoints();
    expect(n).is.not.eq(0);
    const checkpoint = await bribeCASHUSDT.supplyCheckpoints(n.sub(2));
    expect(await bribeCASHUSDT.getPriorSupplyIndex(checkpoint.timestamp)).is.eq(1);
    expect(await bribeCASHUSDT.getPriorSupplyIndex(checkpoint.timestamp.add(1))).is.eq(1);
    expect(await bribeCASHUSDT.getPriorSupplyIndex(checkpoint.timestamp.sub(1))).is.eq(0);
  });

  it("cUSDTom reward test", async function () {
    await bribeCASHUSDT.batchUpdateRewardPerToken(CASH.address, 3);

    await core.voter.vote(1, [CASHUSDTPair.address], [100]);
    await CASH.approve(bribeCASHUSDT.address, parseUnits("100"));
    await bribeCASHUSDT.notifyRewardAmount(CASH.address, parseUnits("1"));
    await TimeUtils.advanceBlocksOnTs(1);

    await core.voter.reset(1);

    await bribeCASHUSDT.batchUpdateRewardPerToken(CASH.address, 3);
    await bribeCASHUSDT.notifyRewardAmount(CASH.address, parseUnits("1"));
    await TimeUtils.advanceBlocksOnTs(1);

    await core.voter.vote(1, [CASHUSDTPair.address], [100]);

    await bribeCASHUSDT.notifyRewardAmount(CASH.address, parseUnits("10"));
    await TimeUtils.advanceBlocksOnTs(1);

    await core.voter.reset(1);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.voter.vote(1, [CASHUSDTPair.address], [100]);

    expect(bribeCASHUSDT.supplyNumCheckpoints()).is.not.eq(0);
    expect(bribeCASHUSDT.rewardRate(CASH.address)).is.not.eq(0);

    await bribeCASHUSDT.batchUpdateRewardPerToken(CASH.address, 3);
    await bribeCASHUSDT.batchUpdateRewardPerToken(CASH.address, 3);

    const n = await bribeCASHUSDT.rewardPerTokenNumCheckpoints(CASH.address);
    expect(n).is.not.eq(0);
    const checkpoint = await bribeCASHUSDT.rewardPerTokenCheckpoints(CASH.address, n.sub(1));
    const c = await bribeCASHUSDT.getPriorRewardPerToken(CASH.address, checkpoint.timestamp);
    expect(c[1]).is.not.eq(0);
    expect(c[1]).is.not.eq(0);
    expect(await bribeCASHUSDT.rewardTokensLength()).is.eq(3);
    expect(await bribeCASHUSDT.left(CASH.address)).is.not.eq(0);
  });

  it("getRewardForOwner through voter", async function () {
    await core.voter.vote(1, [CASHUSDTPair.address], [100]);
    await CASH.approve(bribeCASHUSDT.address, parseUnits("100"));
    await bribeCASHUSDT.notifyRewardAmount(CASH.address, parseUnits("10"));

    const balanceBefore = await CASH.balanceOf(owner.address);
    await core.voter.claimBribes([bribeCASHUSDT.address], [[CASH.address]], 1);
    expect((await CASH.balanceOf(owner.address)).sub(balanceBefore)).is.not.eq(0);
  });

  it("reward per token for empty bribe", async function () {
    await core.voter.createGauge(CASHDaiPair.address);
    const gauge = await core.voter.gauges(CASHDaiPair.address);
    const bribe = await core.voter.bribes(gauge);

    expect(await satinBribe.connect(bribe, owner).rewardPerToken(CASH.address)).is.eq(0);
  });

  it("double deposit should not reset rewards", async function () {
    await core.voter.vote(1, [CASHUSDTPair.address], [100]);

    await depositToGauge(core, owner2, CASH.address, USDT.address, gaugeCASHUSDT, 2);
    await depositToGauge(core, owner3, CASH.address, USDT.address, gaugeCASHUSDT, 0);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await core.minter.updatePeriod();
    await core.voter.distributeAll();

    await TimeUtils.advanceBlocksOnTs(WEEK / 2);

    // should not reset rewards after deposit and withdraw
    await gaugeCASHUSDT.connect(owner3).withdrawAll();
    await depositToGauge(core, owner2, CASH.address, USDT.address, gaugeCASHUSDT, 2);

    await gaugeCASHUSDT.connect(owner2).getReward(owner2.address, [core.token.address]);
    await gaugeCASHUSDT.connect(owner3).getReward(owner3.address, [core.token.address]);

    expect(await core.token.balanceOf(owner2.address)).is.above(parseUnits("150000"));
    expect(await core.token.balanceOf(owner3.address)).is.above(parseUnits("150000"));
  });

  it("ve boost test", async function () {
    await core.voter.vote(1, [CASHUSDTPair.address], [100]);
    const veBal = await core.ve.balanceOfNFT(2);
    expect(veBal).is.not.eq(0);
    expect(await core.ve.balanceOf(owner3.address)).is.eq(0);

    await depositToGauge(core, owner2, CASH.address, USDT.address, gaugeCASHUSDT, 2);
    await depositToGauge(core, owner3, CASH.address, USDT.address, gaugeCASHUSDT, 0);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await core.minter.updatePeriod();
    await core.voter.distributeAll();

    await TimeUtils.advanceBlocksOnTs(WEEK);

    await gaugeCASHUSDT.connect(owner2).getReward(owner2.address, [core.token.address]);
    await gaugeCASHUSDT.connect(owner3).getReward(owner3.address, [core.token.address]);

    const balanceWithFullBoost = await core.token.balanceOf(owner2.address);
    const balanceWithoutBoost = await core.token.balanceOf(owner3.address);
    const rewardsSum = balanceWithFullBoost.add(balanceWithoutBoost);
    console.log("veBal 2", formatUnits(veBal));
    console.log("ve total supply", formatUnits(await core.ve.totalSupply()));
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
    await CASH.approve(core.router.address, parseUnits("10000"));
    await core.router.addLiquidityMATIC(CASH.address, true, parseUnits("10000"), 0, 0, owner.address, BigNumber.from("999999999999999999"), { value: parseUnits("10000") });
    const pairAdr = await core.factory.getPair(CASH.address, wmatic.address, true);
    const pair = satinpair.connect(pairAdr, owner);

    await core.voter.createGauge(pairAdr);

    const gaugeAdr = await core.voter.gauges(pairAdr);
    const gauge = await satinGauge.connect(gaugeAdr, owner);

    const bribeAdr = await core.voter.bribes(gaugeAdr);
    const bribe = await satinBribe.connect(bribeAdr, owner);

    await TestHelper.depositToGauge(owner, gauge, pair, await pair.balanceOf(owner.address), 1);
    const fees = await pair.fees();

    expect(await CASH.balanceOf(bribeAdr)).is.eq(0);
    expect(await wmatic.balanceOf(bribeAdr)).is.eq(0);
    expect(await CASH.balanceOf(fees)).is.eq(0);
    expect(await wmatic.balanceOf(fees)).is.eq(0);

    await CASH.approve(core.router.address, parseUnits("99999"));
    await core.router.swapExactTokensForTokens(
      parseUnits("1000"),
      0,
      [{ from: CASH.address, to: wmatic.address, stable: true }],
      owner.address,
      BigNumber.from("999999999999999999")
    );
    await wmatic.approve(core.router.address, parseUnits("99999", 6));
    await core.router.swapExactTokensForTokens(
      parseUnits("1000", 6),
      0,
      [{ to: CASH.address, from: wmatic.address, stable: true }],
      owner.address,
      BigNumber.from("999999999999999999")
    );

    expect(await CASH.balanceOf(fees)).is.eq(parseUnits(EXPECTED_FEE));
    expect(await wmatic.balanceOf(fees)).is.eq(parseUnits(EXPECTED_FEE, 6));

    await gauge.claimFees();

    expect(await CASH.balanceOf(fees)).is.below(2);
    expect(await wmatic.balanceOf(fees)).is.below(2);

    expect(await gauge.fees0()).is.eq(0);
    expect(await gauge.fees1()).is.eq(0);

    expect(await CASH.balanceOf(bribe.address)).is.above(parseUnits(EXPECTED_FEE).sub(2));
    expect(await wmatic.balanceOf(bribe.address)).is.above(parseUnits(EXPECTED_FEE, 6).sub(2));

    expect(await bribe.left(CASH.address)).is.above(100);
    expect(await bribe.left(wmatic.address)).is.above(100);

    const EXPECTED_FEE2 = 3;
    const SWAP_AMOUNT = 10000;

    await core.router.swapExactTokensForTokens(SWAP_AMOUNT, 0, [{ from: CASH.address, to: wmatic.address, stable: true }], owner.address, BigNumber.from("999999999999999999"));
    await core.router.swapExactTokensForTokens(SWAP_AMOUNT, 0, [{ to: CASH.address, from: wmatic.address, stable: true }], owner.address, BigNumber.from("999999999999999999"));

    expect(await CASH.balanceOf(fees)).is.eq(EXPECTED_FEE2 + 1);
    expect(await wmatic.balanceOf(fees)).is.eq(EXPECTED_FEE2 + 1);

    await gauge.claimFees();

    expect(await CASH.balanceOf(fees)).is.below(3);
    expect(await wmatic.balanceOf(fees)).is.below(3);

    expect(await gauge.fees0()).is.eq(EXPECTED_FEE2 - 1);
    expect(await gauge.fees1()).is.eq(EXPECTED_FEE2 - 1);
  });

  it("gauge getReward for not owner or voter should be forbidden", async function () {
    await expect(gaugeCASHUSDT.getReward(owner2.address, [])).revertedWith("Forbidden");
  });

  it("bribe getReward for not owner should reject", async function () {
    await expect(bribeCASHUSDT.getReward(0, [Misc.ZERO_ADDRESS])).revertedWith("Not token owner");
  });

  it("bribe getRewardForOwner for not voter should reject", async function () {
    await expect(bribeCASHUSDT.getRewardForOwner(0, [Misc.ZERO_ADDRESS])).revertedWith("Not voter");
  });

  it("bribe deposit for not voter should reject", async function () {
    await expect(bribeCASHUSDT._deposit(0, 0)).revertedWith("Not voter");
  });

  it("bribe withdraw for not voter should reject", async function () {
    await expect(bribeCASHUSDT._withdraw(0, 0)).revertedWith("Not voter");
  });

  it("bribe deposit with zero amount should reject", async function () {
    const voter = await Misc.impersonate(core.voter.address);
    await expect(bribeCASHUSDT.connect(voter)._deposit(0, 0)).revertedWith("Zero amount");
  });

  it("bribe withdraw with zero amount should reject", async function () {
    const voter = await Misc.impersonate(core.voter.address);
    await expect(bribeCASHUSDT.connect(voter)._withdraw(0, 0)).revertedWith("Zero amount");
  });

  it("bribe tokenIdToAddress should be rejected with too high tokenId", async function () {
    await expect(bribeCASHUSDT.tokenIdToAddress(Misc.MAX_UINT)).revertedWith("Wrong convert");
  });

  it("bribe tokenIdToAddress should be rejected with too high tokenId", async function () {
    expect(await bribeCASHUSDT.addressToTokenId(await bribeCASHUSDT.tokenIdToAddress(1))).is.eq(1);
  });

  it("deposit with another tokenId should be rejected", async function () {
    expect(await gaugeCASHUSDT.tokenIds(owner.address)).is.eq(1);
    await TestHelper.addLiquidity(core.factory, core.router, owner, CASH.address, USDT.address, utils.parseUnits("1"), utils.parseUnits("1", 6), true);
    const pairAdr = await core.factory.getPair(CASH.address, USDT.address, true);
    const pair = satinpair.connect(pairAdr, owner);
    const pairBalance = await pair.balanceOf(owner.address);
    expect(pairBalance).is.not.eq(0);
    await pair.approve(gaugeCASHUSDT.address, pairBalance);
    await expect(gaugeCASHUSDT.deposit(pairBalance, 3)).revertedWith("Wrong token");
  });
});

async function depositToGauge(core, owner, token0, token1, gauge, tokenId) {
  await TestHelper.addLiquidity(core.factory, core.router, owner, token0, token1, utils.parseUnits("1"), utils.parseUnits("1", 6), true);
  const pairAdr = await core.factory.getPair(token0, token1, true);
  const pair = satinpair.connect(pairAdr, owner);
  const pairBalance = await pair.balanceOf(owner.address);
  expect(pairBalance).is.not.eq(0);
  await pair.approve(gauge.address, pairBalance);
  await gauge.connect(owner).deposit(pairBalance, tokenId);
}
