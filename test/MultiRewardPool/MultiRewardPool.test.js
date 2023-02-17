// tested on testnet
// added exactly 2 pools
// assuming acc2 and acc3 already deposited at least once in both pools
// allowances
// run multiple times for a robust testing

const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { promisify } = require("util");

const TIMEOUT = 10 * 60 * 100000;

const config = {
  multiRewardPoolContract: "MultiRewardPool",
  token0Address: "0xcc7415510B3425903942F1097E26909aB5282DB6",
  token1Address: "0x2F32DeA0F53F997D543e06a2b7516A726EBE9d8e",
  multiRewardPoolAddress: "0x3C862456530BBDb83B9aB315ac5761FcC03542d0",
  satinAddress: "0x6950C025459F0565DB2728562EEF4680e0784C57",
  cashAddress: "0xb5Ba74F44Fd405730F61bF0865B36a5f5888bE8e",
  pool0DepositAmount: 300,
  pool1DepositAmount: 200,
};

describe("Test", () => {
  // deployer is acc2
  let multiRewardPool, token0, token1, satin, cash;
  let deployer, acc2, acc3;
  let BIG_TEN;
  let sleep;

  before(async () => {
    [deployer, acc3] = await ethers.getSigners();
    multiRewardPool = await ethers.getContractAt(config.multiRewardPoolContract, config.multiRewardPoolAddress);
    token0 = await ethers.getContractAt("@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol:IERC20Upgradeable", config.token0Address);
    token1 = await ethers.getContractAt("@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol:IERC20Upgradeable", config.token1Address);
    satin = await ethers.getContractAt("@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol:IERC20Upgradeable", config.satinAddress);
    cash = await ethers.getContractAt("@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol:IERC20Upgradeable", config.cashAddress);

    BIG_TEN = BigNumber.from(10);

    sleep = promisify(setTimeout);
  });

  async function checkSatinReward() {
    const availableReward = await satin.balanceOf(multiRewardPool.address);
    console.log("availableReward = ", availableReward);

    const satinEndTime = await multiRewardPool.satinEndTime();

    let totalPendingRewards = BigNumber.from(0);
    let totalFutureRewards = BigNumber.from(0);
    // assuming 2 pools
    for (let i = 0; i < 2; i++) {
      totalPendingRewards = totalPendingRewards.add((await multiRewardPool.pendingSatinRewards(i, deployer.address)).add(await multiRewardPool.pendingSatinRewards(i, acc3.address)));
    }
    totalFutureRewards = totalFutureRewards.add(await multiRewardPool.getSatinReward((await hre.ethers.provider.getBlock("latest")).timestamp, satinEndTime));
    console.log("totalPendingRewards = ", totalPendingRewards);
    console.log("totalFutureRewards = ", totalFutureRewards);
    console.log("totalFutureRewards + totalPendingRewards = ", totalFutureRewards.add(totalPendingRewards));

    expect(availableReward).to.be.gte(totalFutureRewards.add(totalPendingRewards));
  }

  async function checkCashReward() {
    const availableReward = await cash.balanceOf(multiRewardPool.address);
    console.log("availableReward = ", availableReward);

    const cashEndTime = await multiRewardPool.cashEndTime();

    let totalPendingRewards = BigNumber.from(0);
    let totalFutureRewards = BigNumber.from(0);
    // assuming 2 pools
    for (let i = 0; i < 2; i++) {
      totalPendingRewards = totalPendingRewards.add((await multiRewardPool.pendingCashRewards(i, deployer.address)).add(await multiRewardPool.pendingCashRewards(i, acc3.address)));

      totalFutureRewards = totalFutureRewards.add(await multiRewardPool.getCashReward(i, (await hre.ethers.provider.getBlock("latest")).timestamp, cashEndTime));
    }
    console.log("totalPendingRewards = ", totalPendingRewards);
    console.log("totalFutureRewards = ", totalFutureRewards);
    console.log("totalFutureRewards + totalPendingRewards = ", totalFutureRewards.add(totalPendingRewards));

    expect(availableReward).to.be.gte(totalFutureRewards.add(totalPendingRewards));
  }

  async function getState(account, pid) {
    let userInfo = await multiRewardPool.userInfo(pid, account.address);
    let poolInfo = await multiRewardPool.poolInfo(pid);
    return {
      userBalance: {
        token0: await token0.balanceOf(account.address),
        token1: await token1.balanceOf(account.address),
        cash: await cash.balanceOf(account.address),
        satin: await satin.balanceOf(account.address),
        amount: userInfo[0],
      },

      accSatinPerShare: poolInfo[2],
      accCashPerShare: poolInfo[3],
      multiRewardPoolToken1Balance: await token1.balanceOf(multiRewardPool.address),
      satinRewardDebt: userInfo[1],
      cashRewardDebt: userInfo[2],
    };
  }

  it("notifySatinReward", async () => {
    const initSatinReward = await multiRewardPool.initSatinReward();

    if (!initSatinReward) {
      const TOTAL_SATIN_REWARDS = await multiRewardPool.TOTAL_SATIN_REWARDS();
      const acc2SatinBefore = await satin.balanceOf(deployer.address);
      const multiRewardPoolSatinBefore = await satin.balanceOf(multiRewardPool.address);

      await multiRewardPool.notifySatinReward();
      await sleep(15000);

      const acc2SatinAfter = await satin.balanceOf(deployer.address);
      const multiRewardPoolSatinAfter = await satin.balanceOf(multiRewardPool.address);

      expect(acc2SatinAfter).to.equal(acc2SatinBefore.sub(TOTAL_SATIN_REWARDS));
      expect(multiRewardPoolSatinAfter).to.equal(multiRewardPoolSatinBefore.add(TOTAL_SATIN_REWARDS));
      expect(await multiRewardPool.initSatinReward()).to.equal(true);
    } else {
      console.log("notifySatinReward:: require does not meet");
    }
    await checkSatinReward();
  });

  it("notifyCashReward", async () => {
    // acc2: cash--100
    // multiRewardPool: cash++100
    // pool0: cashPerSecond =  45/86400
    // pool1: cashPerSecond =  55/86400

    const cashEndTime = await multiRewardPool.cashEndTime();
    if ((await hre.ethers.provider.getBlock("latest")).timestamp > cashEndTime) {
      const acc2CashBefore = await cash.balanceOf(deployer.address);
      const multiRewardPoolCashBefore = await cash.balanceOf(multiRewardPool.address);

      const pool0CashReward = ethers.utils.parseUnits((0.045).toString(), "ether");
      const pool1CashReward = ethers.utils.parseUnits((0.055).toString(), "ether");
      const duration = 86400;

      await multiRewardPool.notifyCashReward([0, 1], [pool0CashReward, pool1CashReward], duration); // 86400 sec = 24 hrs
      await sleep(15000);

      const acc2CashAfter = await cash.balanceOf(deployer.address);
      const multiRewardPoolCashAfter = await cash.balanceOf(multiRewardPool.address);
      const pool0CashPerSecond = (await multiRewardPool.poolInfo(0))[7];
      const pool1CashPerSecond = (await multiRewardPool.poolInfo(1))[7];

      expect(acc2CashAfter).to.equal(acc2CashBefore.sub(pool0CashReward.add(pool1CashReward)));
      expect(multiRewardPoolCashAfter).to.equal(multiRewardPoolCashBefore.add(pool0CashReward.add(pool1CashReward)));
      expect(pool0CashPerSecond).to.equal(pool0CashReward.div(duration));
      expect(pool1CashPerSecond).to.equal(pool1CashReward.div(duration));
    } else {
      console.log("notifyCashReward:: require does not meet");
    }

    await checkCashReward();
  });

  it("notifyCashRewardOngoing", async () => {
    const cashEndTime = await multiRewardPool.cashEndTime();
    if ((await hre.ethers.provider.getBlock("latest")).timestamp <= cashEndTime) {
      const acc2CashBefore = await cash.balanceOf(deployer.address);
      const multiRewardPoolCashBefore = await cash.balanceOf(multiRewardPool.address);

      console.log("acc2CashBefore", acc2CashBefore);
      console.log("multiRewardPoolCashBefore", multiRewardPoolCashBefore);

      const pool0CashReward = ethers.utils.parseUnits((0.045).toString(), "ether");
      const pool1CashReward = ethers.utils.parseUnits((0.055).toString(), "ether");

      await multiRewardPool.notifyCashRewardOngoing([0, 1], [pool0CashReward, pool1CashReward]);
      await sleep(15000);

      const acc2CashAfter = await cash.balanceOf(deployer.address);
      const multiRewardPoolCashAfter = await cash.balanceOf(multiRewardPool.address);
      const pool0CashPerSecond = (await multiRewardPool.poolInfo(0))[7];
      const pool1CashPerSecond = (await multiRewardPool.poolInfo(1))[7];

      console.log("acc2CashAfter", acc2CashAfter);
      console.log("multiRewardPoolCashAfter", multiRewardPoolCashAfter);
      console.log("pool0CashPerSecond", pool0CashPerSecond);
      console.log("pool1CashPerSecond", pool1CashPerSecond);

      expect(acc2CashAfter).to.equal(acc2CashBefore.sub(pool0CashReward.add(pool1CashReward)));
      expect(multiRewardPoolCashAfter).to.equal(multiRewardPoolCashBefore.add(pool0CashReward.add(pool1CashReward)));
    } else {
      console.log("notifyCashRewardOngoing:: require does not meet");
    }

    await checkCashReward();
  });

  it("Deposit to pool 1 + claimReward from acc2", async () => {
    // accSatinPerShare++
    // accCashPerShare++
    // acc2: satin++
    // acc2: cash++
    // acc2: `x` token1--
    // MultiRewardPool: `x` token1++
    // user.satinRewardDebt = (user.amount * accSatinPerShare) / 1e18;
    // user.cashRewardDebt = (user.amount * accCashPerShare) / 1e18;

    const pid = 1;

    const before = await getState(deployer, pid);
    console.log("before-------", before);

    await multiRewardPool.deposit(pid, config.pool1DepositAmount);
    await sleep(15000);

    const after = await getState(deployer, pid);
    console.log("after-------", after);

    expect(after.accSatinPerShare).to.be.above(before.accSatinPerShare);
    expect(after.accCashPerShare).to.be.above(before.accCashPerShare);
    expect(after.userBalance.satin).to.be.above(before.userBalance.satin);
    expect(after.userBalance.cash).to.be.above(before.userBalance.cash);
    expect(after.userBalance.token1).to.be.equal(before.userBalance.token1.sub(config.pool1DepositAmount));
    expect(after.multiRewardPoolToken1Balance).to.be.equal(before.multiRewardPoolToken1Balance.add(config.pool1DepositAmount));

    expect(after.satinRewardDebt).to.equal(after.userBalance.amount.mul(after.accSatinPerShare).div(BIG_TEN.pow(18)));
    expect(after.cashRewardDebt).to.equal(after.userBalance.amount.mul(after.accCashPerShare).div(BIG_TEN.pow(18)));
  }).timeout(TIMEOUT);

  it("Withdraw from pool 1 + claimReward from acc2", async () => {
    // accSatinPerShare++
    // accCashPerShare++
    // acc2: satin++
    // acc2: cash++
    // acc2: `x` token1++
    // MultiRewardPool: `x` token1--
    // user.satinRewardDebt = (user.amount * accSatinPerShare) / 1e18;
    // user.cashRewardDebt = (user.amount * accCashPerShare) / 1e18;

    const pid = 1;

    const before = await getState(deployer, pid);
    console.log("before-------", before);

    await multiRewardPool.withdraw(pid, config.pool1DepositAmount);
    await sleep(15000);

    const after = await getState(deployer, pid);
    console.log("after-------", after);

    expect(after.accSatinPerShare).to.be.above(before.accSatinPerShare);
    expect(after.accCashPerShare).to.be.above(before.accCashPerShare);
    expect(after.userBalance.satin).to.be.above(before.userBalance.satin);
    expect(after.userBalance.cash).to.be.above(before.userBalance.cash);
    expect(after.userBalance.token1).to.be.equal(before.userBalance.token1.add(config.pool1DepositAmount));
    expect(after.multiRewardPoolToken1Balance).to.be.equal(before.multiRewardPoolToken1Balance.sub(config.pool1DepositAmount));

    expect(after.satinRewardDebt).to.equal(after.userBalance.amount.mul(after.accSatinPerShare).div(BIG_TEN.pow(18)));
    expect(after.cashRewardDebt).to.equal(after.userBalance.amount.mul(after.accCashPerShare).div(BIG_TEN.pow(18)));
  }).timeout(TIMEOUT);
});
