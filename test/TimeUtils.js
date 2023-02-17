const { ethers } = require("hardhat");

class TimeUtils {
  static async advanceBlocksOnTs(add) {
    const start = Date.now();
    // const block = await TimeUtils.currentBlock();
    await ethers.provider.send("evm_increaseTime", [add]);
    await ethers.provider.send("evm_mine", []);
    // await TimeUtils.mineAndCheck();
  }

  static async advanceNBlocks() {
    const start = Date.now();
    await ethers.provider.send("evm_increaseTime", [+(n * 2.35).toFixed(0)]);
    for (let i = 0; i < n; i++) {
      await ethers.provider.send("evm_mine", []);
    }
  }

  static async mineAndCheck() {
    const start = ethers.provider.blockNumber;
    while (true) {
      await ethers.provider.send("evm_mine", []);
      if (ethers.provider.blockNumber > start) {
        break;
      }
      console.log("waite mine 10sec");
    }
  }

  static async setNextBlockTime(ts) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [ts]);
    await ethers.provider.send("evm_mine", []);
  }

  static async snapshot() {
    const id = await ethers.provider.send("evm_snapshot", []);
    console.log("made snapshot", id);
    return id;
  }

  static async rollback(id) {
    console.log("restore snapshot", id);
    return ethers.provider.send("evm_revert", [id]);
  }
}

module.exports = {
  TimeUtils,
};
