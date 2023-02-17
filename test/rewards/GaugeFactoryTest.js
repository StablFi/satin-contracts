const { expect } = require("chai");
const { ethers } = require("hardhat");
const { factory } = require("typescript");
const { TimeUtils } = require("../TimeUtils");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const { formatUnits, parseUnits } = require("ethers/lib/utils");
const { BigNumber, utils } = require("ethers");
const amount1000At6 = parseUnits("1000", 6);
const WEEK = 60 * 60 * 24 * 7;

describe("gauge factory tests", function () {
  let snapshotBefore;
  let snapshot;

  let owner;
  let owner2;
  let gaugeFactory;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2] = await ethers.getSigners();
    const GaugeFactory = await ethers.getContractFactory("GaugeFactory");
    gaugeFactory = await GaugeFactory.deploy();
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

  it("create single test", async function () {
    await gaugeFactory.createGaugeSingle(
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      []
    );
  });
});
