const { expect } = require("chai");
const { Contract } = require("ethers");
const { parseEther, formatEther } = require("ethers/lib/utils");
const { ethers, network } = require("hardhat");

describe("Splitter", function () {
  /** @type {Contract} */
  let splitter;
  /** @type {Contract} */
  let vester;
  /** @type {Contract} */
  let token;

  /** @type{number} */
  let blockTime;

  async function updateBlockTime() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();
    const { timestamp } = await ethers.provider.getBlock(currentBlockNumber);
    blockTime = timestamp;
  }

  /** @param {number} duration */
  async function forwardAndUpdateBlockTime(duration) {
    await network.provider.send("evm_setNextBlockTimestamp", [blockTime + duration]);
    await network.provider.send("evm_mine");
    await updateBlockTime();
  }

  this.beforeAll(async function () {
    const signers = await ethers.getSigners();

    const splitterFactory = await ethers.getContractFactory("Splitter");
    splitter = await splitterFactory.deploy(
      signers.slice(0, 5).map(({ address }) => address),
      [100, 200, 300, 400, 500]
    );

    await updateBlockTime();
    const vesterFactory = await ethers.getContractFactory("Vester");
    vester = await vesterFactory.deploy(splitter.address);

    const _token = await ethers.getContractFactory("TestToken");
    token = await _token.deploy();
  });

  it("Deploys", async function () {
    expect(splitter.address).to.be.properAddress;
    expect(vester.address).to.be.properAddress;
    expect(await vester.beneficiary()).eq(splitter.address);
  });

  it("Vests", async function () {
    const [alice, bob, carl, dev, evan] = await ethers.getSigners();
    await token.mint(vester.address, parseEther("100"));

    {
      const released = await vester["releasable(address)"](token.address);
      console.log({ released: formatEther(released) });
      await vester["release(address)"](token.address);
      await vester["released(address)"](token.address);
      const splitterBalance = await token.balanceOf(splitter.address);
      console.log("splitterBalance:", formatEther(splitterBalance));
      console.log(
        "Total Share:",
        formatEther(
          (await splitter["releasable(address,address)"](token.address, alice.address))
            .add(await splitter["releasable(address,address)"](token.address, bob.address))
            .add(await splitter["releasable(address,address)"](token.address, carl.address))
            .add(await splitter["releasable(address,address)"](token.address, dev.address))
            .add(await splitter["releasable(address,address)"](token.address, evan.address))
        )
      );

      // console.log(await splitter["releasable(address,address)"](token.address, alice.address));
      // console.log(await splitter["releasable(address,address)"](token.address, bob.address));
      // console.log(await splitter["releasable(address,address)"](token.address, carl.address));
      // console.log(await splitter["releasable(address,address)"](token.address, dev.address));
      // console.log(await splitter["releasable(address,address)"](token.address, evan.address));

      await splitter["release(address,address)"](token.address, bob.address);
      await splitter["release(address,address)"](token.address, carl.address);
      await splitter["release(address,address)"](token.address, dev.address);
      await splitter["release(address,address)"](token.address, alice.address);
      await splitter["release(address,address)"](token.address, evan.address);
    }

    await forwardAndUpdateBlockTime(86400 * 7); // 1 week

    {
      const released = await vester["releasable(address)"](token.address);
      console.log({ released: formatEther(released) });
      await vester["release(address)"](token.address);
      await vester["released(address)"](token.address);
      const splitterBalance = await token.balanceOf(splitter.address);
      console.log("splitterBalance:", formatEther(splitterBalance));
      console.log(
        "Total Share:",
        formatEther(
          (await splitter["releasable(address,address)"](token.address, alice.address))
            .add(await splitter["releasable(address,address)"](token.address, bob.address))
            .add(await splitter["releasable(address,address)"](token.address, carl.address))
            .add(await splitter["releasable(address,address)"](token.address, dev.address))
            .add(await splitter["releasable(address,address)"](token.address, evan.address))
        )
      );

      // console.log(await splitter["releasable(address,address)"](token.address, alice.address));
      // console.log(await splitter["releasable(address,address)"](token.address, bob.address));
      // console.log(await splitter["releasable(address,address)"](token.address, carl.address));
      // console.log(await splitter["releasable(address,address)"](token.address, dev.address));
      // console.log(await splitter["releasable(address,address)"](token.address, evan.address));

      await splitter["release(address,address)"](token.address, bob.address);
      await splitter["release(address,address)"](token.address, carl.address);
      await splitter["release(address,address)"](token.address, dev.address);
      await splitter["release(address,address)"](token.address, alice.address);
      await splitter["release(address,address)"](token.address, evan.address);
    }

    await forwardAndUpdateBlockTime(86400 * 7 * 3); // + 3 weeks = 1 month

    {
      const released = await vester["releasable(address)"](token.address);
      console.log({ released: formatEther(released) });
      await vester["release(address)"](token.address);
      await vester["released(address)"](token.address);
      const splitterBalance = await token.balanceOf(splitter.address);
      console.log("splitterBalance:", formatEther(splitterBalance));
      console.log(
        "Total Share:",
        formatEther(
          (await splitter["releasable(address,address)"](token.address, alice.address))
            .add(await splitter["releasable(address,address)"](token.address, bob.address))
            .add(await splitter["releasable(address,address)"](token.address, carl.address))
            .add(await splitter["releasable(address,address)"](token.address, dev.address))
            .add(await splitter["releasable(address,address)"](token.address, evan.address))
        )
      );

      // console.log(await splitter["releasable(address,address)"](token.address, alice.address));
      // console.log(await splitter["releasable(address,address)"](token.address, bob.address));
      // console.log(await splitter["releasable(address,address)"](token.address, carl.address));
      // console.log(await splitter["releasable(address,address)"](token.address, dev.address));
      // console.log(await splitter["releasable(address,address)"](token.address, evan.address));

      await splitter["release(address,address)"](token.address, bob.address);
      await splitter["release(address,address)"](token.address, carl.address);
      await splitter["release(address,address)"](token.address, dev.address);
      await splitter["release(address,address)"](token.address, alice.address);
      await splitter["release(address,address)"](token.address, evan.address);
    }

    await forwardAndUpdateBlockTime(86400 * 7 * 4 * 3); // + 3 months = 4 months

    {
      const released = await vester["releasable(address)"](token.address);
      console.log({ released: formatEther(released) });
      await vester["release(address)"](token.address);
      await vester["released(address)"](token.address);
      const splitterBalance = await token.balanceOf(splitter.address);
      console.log("splitterBalance:", formatEther(splitterBalance));
      console.log(
        "Total Share:",
        formatEther(
          (await splitter["releasable(address,address)"](token.address, alice.address))
            .add(await splitter["releasable(address,address)"](token.address, bob.address))
            .add(await splitter["releasable(address,address)"](token.address, carl.address))
            .add(await splitter["releasable(address,address)"](token.address, dev.address))
            .add(await splitter["releasable(address,address)"](token.address, evan.address))
        )
      );

      // console.log(await splitter["releasable(address,address)"](token.address, alice.address));
      // console.log(await splitter["releasable(address,address)"](token.address, bob.address));
      // console.log(await splitter["releasable(address,address)"](token.address, carl.address));
      // console.log(await splitter["releasable(address,address)"](token.address, dev.address));
      // console.log(await splitter["releasable(address,address)"](token.address, evan.address));

      await splitter["release(address,address)"](token.address, bob.address);
      await splitter["release(address,address)"](token.address, carl.address);
      await splitter["release(address,address)"](token.address, dev.address);
      await splitter["release(address,address)"](token.address, alice.address);
      await splitter["release(address,address)"](token.address, evan.address);
    }

    await forwardAndUpdateBlockTime(86400 * 7 * 4 * 5); // + 5 months = 9 months

    {
      const released = await vester["releasable(address)"](token.address);
      console.log({ released: formatEther(released) });
      await vester["release(address)"](token.address);
      await vester["released(address)"](token.address);
      const splitterBalance = await token.balanceOf(splitter.address);
      console.log("splitterBalance:", formatEther(splitterBalance));
      console.log(
        "Total Share:",
        formatEther(
          (await splitter["releasable(address,address)"](token.address, alice.address))
            .add(await splitter["releasable(address,address)"](token.address, bob.address))
            .add(await splitter["releasable(address,address)"](token.address, carl.address))
            .add(await splitter["releasable(address,address)"](token.address, dev.address))
            .add(await splitter["releasable(address,address)"](token.address, evan.address))
        )
      );

      // console.log(await splitter["releasable(address,address)"](token.address, alice.address));
      // console.log(await splitter["releasable(address,address)"](token.address, bob.address));
      // console.log(await splitter["releasable(address,address)"](token.address, carl.address));
      // console.log(await splitter["releasable(address,address)"](token.address, dev.address));
      // console.log(await splitter["releasable(address,address)"](token.address, evan.address));

      await splitter["release(address,address)"](token.address, bob.address);
      await splitter["release(address,address)"](token.address, carl.address);
      await splitter["release(address,address)"](token.address, dev.address);
      await splitter["release(address,address)"](token.address, alice.address);
      await splitter["release(address,address)"](token.address, evan.address);
    }

    await forwardAndUpdateBlockTime(86400 * 7 * 4 * 5); // + 5 months = 12 months + > 1 month lost in calculations

    {
      const released = await vester["releasable(address)"](token.address);
      console.log({ released: formatEther(released) });
      await vester["release(address)"](token.address);
      await vester["released(address)"](token.address);
      const splitterBalance = await token.balanceOf(splitter.address);
      console.log("splitterBalance:", formatEther(splitterBalance));
      console.log(
        "Total Share:",
        formatEther(
          (await splitter["releasable(address,address)"](token.address, alice.address))
            .add(await splitter["releasable(address,address)"](token.address, bob.address))
            .add(await splitter["releasable(address,address)"](token.address, carl.address))
            .add(await splitter["releasable(address,address)"](token.address, dev.address))
            .add(await splitter["releasable(address,address)"](token.address, evan.address))
        )
      );

      // console.log(await splitter["releasable(address,address)"](token.address, alice.address));
      // console.log(await splitter["releasable(address,address)"](token.address, bob.address));
      // console.log(await splitter["releasable(address,address)"](token.address, carl.address));
      // console.log(await splitter["releasable(address,address)"](token.address, dev.address));
      // console.log(await splitter["releasable(address,address)"](token.address, evan.address));

      await splitter["release(address,address)"](token.address, bob.address);
      await splitter["release(address,address)"](token.address, carl.address);
      await splitter["release(address,address)"](token.address, dev.address);
      await splitter["release(address,address)"](token.address, alice.address);
      await splitter["release(address,address)"](token.address, evan.address);
    }

    console.log("After all withdraws...");

    console.log("Balance:alice:", formatEther(await token.balanceOf(alice.address)));
    console.log("Balance:bob:", formatEther(await token.balanceOf(bob.address)));
    console.log("Balance:carl:", formatEther(await token.balanceOf(carl.address)));
    console.log("Balance:dev:", formatEther(await token.balanceOf(dev.address)));
    console.log("Balance:evan:", formatEther(await token.balanceOf(evan.address)));
  });
});
