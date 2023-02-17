const { expect } = require("chai");
const { utils, BigNumber } = require("ethers");
const { parseUnits } = require("ethers/lib/utils");
const { ethers } = require("hardhat");
const { TimeUtils } = require("../TimeUtils");

const MAX_UINT = BigNumber.from(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935"
);
const SECONDS_OF_DAY = 60 * 60 * 24;
const SECONDS_OF_YEAR = SECONDS_OF_DAY * 365;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("pair tests", function () {
  let snapshotBefore;
  let snapshot;

  let owner;
  let owner2;
  let owner3;
  let owner4;
  let owner5;
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
  let veDist;
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
    [owner, owner2, owner3, owner4, owner5] = await ethers.getSigners();

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
    factory = await upgrades.deployProxy(Factory, [owner2.address]);
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
      86400 * 30 * 6,
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

  xit("current twap price test", async function () {
    await cash.approve(router.address, parseUnits("1"));
    await router.swapExactTokensForTokensSimple(
      parseUnits("0.01"),
      BigNumber.from(0),
      cash.address,
      satin.address,
      false,
      owner.address,
      Date.now()
    );
    expect(await pair.current(tokenA.address, parseUnits("1"))).is.eq(BigNumber.from(753733));
  });

  xit("burn test", async function () {
    await pair.approve(router.address, BigNumber.from("70710678118654751440"));
    await router.removeLiquidity(
      tokenA.address,
      tokenB.address,
      false,
      await pair.balanceOf(owner.address),
      0,
      0,
      owner.address,
      Date.now()
    );
    expect(await pair.balanceOf(owner.address)).is.eq(0);
  });

  xit("sync test", async function () {
    await tokenA.transfer(pair.address, parseUnits("1"));
    await tokenB.transfer(pair.address, parseUnits("0.5"));
    await pair.sync();
    expect(await pair.reserve0()).is.not.eq(0);
    expect(await pair.reserve1()).is.not.eq(0);
  });

  xit("metadata test", async function () {
    const d = await pair.metadata();
    expect(d.decimal0).is.not.eq(0);
    expect(d.decimal1).is.not.eq(0);
    expect(d.reserves0).is.not.eq(0);
    expect(d.reserves1).is.not.eq(0);
    expect(d.isStable).is.eq(false);
    expect(d.tokenZero).is.eq(tokenA.address);
    expect(d.tokenOne).is.eq(tokenB.address);
  });

  xit("Swap at very low amount", async function () {
    await tokenA.approve(router.address, parseUnits("1"));
    await tokenB.approve(router.address, parseUnits("1"));
    await router.swapExactTokensForTokensSimple(
      3,
      BigNumber.from("0"),
      tokenA.address,
      tokenB.address,
      false,
      owner.address,
      Date.now()
    );
  });

  xit("revert if insufficient liquidity minted", async function () {
    await expect(pair1.mint(owner3.address)).revertedWith("BaseV1: INSUFFICIENT_LIQUIDITY_MINTED");
  });

  xit("revert if insufficient liquidity burned", async function () {
    await expect(pair.burn(owner2.address)).revertedWith("BaseV1: INSUFFICIENT_LIQUIDITY_BURNED");
  });

  xit("Swap should not work is paused", async function () {
    await factory.setPause(true);
    await expect(pair.swap(1, 1, owner.address, "0x")).to.be.reverted;
  });

  xit("Should revert If Insufficient Output Amount", async function () {
    await expect(pair.swap(0, 0, owner.address, "0x")).revertedWith(
      "BaseV1: INSUFFICIENT_OUTPUT_AMOUNT"
    );
  });

  xit("Should revert when liquidity is not sufficient", async function () {
    await expect(pair.swap(MAX_UINT, MAX_UINT, owner.address, "0x")).revertedWith(
      "BaseV1: INSUFFICIENT_LIQUIDITY"
    );
  });

  xit("Should revert if Invalid to address", async function () {
    await expect(pair.swap(1, 1, tokenA.address, "0x")).revertedWith("BaseV1: INVALID_TO");
  });

  xit("flash swap", async function () {
    const amount = parseUnits("0.1");
    await tokenC.transfer(pair1.address, amount.div(9000)); //fee
    await tokenD.transfer(pair1.address, amount.div(9000)); //fee
    const r = await pair1.getReserves();
    const TestFlashSwap = await ethers.getContractFactory("TestFlashSwap");
    const testFlashSwap = await TestFlashSwap.deploy(tokenC.address, tokenD.address, pair1.address);
    await pair1.swap(
      amount,
      amount,
      testFlashSwap.address,
      ethers.utils.defaultAbiCoder.encode(["address"], [pair1.address])
    );

    const r0 = await pair1.getReserves();
    // expect(r[0]).eq(r0[0]);
    // expect(r[1]).eq(r0[1]);
  });

  xit("reentrancy should revert", async () => {
    await expect(
      pair1.swap(
        1000,
        1000,
        tokenA.address,
        ethers.utils.defaultAbiCoder.encode(["address"], [pair.address])
      )
    ).to.be.reverted;
  });

  xit("insufficient input amount", async () => {
    await expect(pair1.swap(10000000, 1000000, owner.address, "0x")).revertedWith("IIA");
  });

  xit("k revert", async () => {
    await tokenA.transfer(pair1.address, 1);
    await expect(pair1.swap(10000000, 1000000, owner.address, "0x")).revertedWith("");
  });

  xit("permit should expire", async () => {
    const { v, r, s } = await permitForPair(owner, pair, pair.address, parseUnits("1"), "1");

    await expect(
      pair.permit(owner.address, pair.address, parseUnits("1"), "1", v, r, s)
    ).revertedWith("BaseV1: EXPIRED");
  });

  xit("permit function should revert", async function () {
    const { v, r, s } = await permitForPair(
      owner,
      pair,
      pair.address,
      parseUnits("1"),
      "999999999999"
    );
    await expect(
      pair.permit(pair.address, pair.address, parseUnits("1"), "999999999999", v, r, s)
    ).revertedWith("BaseV1: INVALID_SIGNATURE");
  });

  xit("Should transfer to self wihout approve", async function () {
    await pair.transferFrom(owner.address, owner.address, 1);
  });

  xit("should panic revert when try to transfer without allowance", async function () {
    await expect(pair.transferFrom(owner2.address, owner.address, 1)).revertedWithPanic;
  });

  xit("should revert panic when transfer exceed balance", async function () {
    await expect(pair.transfer(owner.address, parseUnits("9999999999999999999"))).revertedWithPanic;
  });

  xit("swap values and fees check", async function () {
    o1 = await tokenA.balanceOf(owner3.address);
    o2 = await tokenB.balanceOf(owner3.address);
    console.log("pair.address", pair.address);
    await factory.setPartnerAddresses(pair.address, [owner4.address]);
    console.log("TokenA", o1);
    console.log("TokenB", o2);
    console.log("---------------------------------------------");
    await tokenB.approve(router.address, parseUnits("1"));
    await router.swapExactTokensForTokensSimple(
      parseUnits("0.01"),
      BigNumber.from(0),
      tokenB.address,
      tokenA.address,
      false,
      owner.address,
      Date.now()
    );

    o1 = await tokenA.balanceOf(owner3.address);
    o2 = await tokenB.balanceOf(owner3.address);
    console.log("TokenA", o1);
    console.log("TokenB", o2);
  });

  async function permitForPair(owner, pair, spender, amount, deadline = "99999999999") {
    const name = await pair.name();
    const nonce = await pair.nonces(owner.address);
    const { chainId } = await ethers.provider.getNetwork();

    const signature = await owner._signTypedData(
      {
        name,
        version: "1",
        chainId: chainId + "",
        verifyingContract: pair.address,
      },
      {
        Permit: [
          {
            name: "owner",
            type: "address",
          },
          {
            name: "spender",
            type: "address",
          },
          {
            name: "value",
            type: "uint256",
          },
          {
            name: "nonce",
            type: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
          },
        ],
      },
      {
        owner: owner.address,
        spender,
        value: amount.toString(),
        nonce: nonce.toHexString(),
        deadline,
      }
    );

    return ethers.utils.splitSignature(signature);
  }

  xit("Swap fee of priority pairs should be less", async function () {
    console.log("SWAP FEE BEFORE", await SatinCashPair.swapFee());
    await factory.setIfPriorityPair(SatinCashPair.address, true);
    console.log("SWAP FEE After", await SatinCashPair.swapFee());
  });

  xit("Swapp fee of stable priority pairs should be less", async function () {
    await router.addLiquidity(
      cash.address,
      dai.address,
      true,
      utils.parseUnits("1000"),
      utils.parseUnits("1000"),
      1,
      1,
      owner2.address,
      Date.now()
    );

    const DaiCashPairAddress = await router.pairFor(dai.address, cash.address, true);
    const DaiCashPair = pair.attach(DaiCashPairAddress);
    console.log("SWAP FEE BEFORE", await DaiCashPair.swapFee());
    await factory.setIfPriorityPair(DaiCashPairAddress, true);
    console.log("SWAP FEE After", await DaiCashPair.swapFee());
  });

  xit("Check partnerFee", async function () {
    await factory.setPartnerAddresses(SatinCashPair.address, [
      owner3.address,
      owner4.address,
      owner5.address,
    ]);

    await router.swapExactTokensForTokensSimple(
      parseUnits("3"),
      BigNumber.from("0"),
      cash.address,
      token.address,
      false,
      owner.address,
      Date.now()
    );

    console.log("PartnerClaimable0", await SatinCashPair.partnerClaimable0());
    console.log("PartnerClaimable1", await SatinCashPair.partnerClaimable1());

    console.log("Owner4 partner fee before", await cash.balanceOf(owner4.address));

    await SatinCashPair.claimPartnerFee();

    console.log("Owner4 partner fee After", await cash.balanceOf(owner4.address));
  });

  xit("Check treasuryFee with partner", async function () {
    await factory.setPartnerAddresses(SatinCashPair.address, [
      owner3.address,
      owner4.address,
      owner5.address,
    ]);

    console.log("treasury  fee before", await cash.balanceOf(await SatinCashPair.treasury()));

    await router.swapExactTokensForTokensSimple(
      parseUnits("3"),
      BigNumber.from("0"),
      cash.address,
      token.address,
      false,
      owner.address,
      Date.now()
    );

    console.log("treasury fee After", await cash.balanceOf(await SatinCashPair.treasury()));
  });

  xit("Check treasuryFee without partner", async function () {
    console.log("treasury  fee before", await cash.balanceOf(await SatinCashPair.treasury()));

    await router.swapExactTokensForTokensSimple(
      parseUnits("3"),
      BigNumber.from("0"),
      cash.address,
      token.address,
      false,
      owner.address,
      Date.now()
    );

    console.log("treasury fee After", await cash.balanceOf(await SatinCashPair.treasury()));
  });

  it("Check for reserves", async function () {
    console.log("reserve0", await SatinCashPair.reserve0());
    console.log("reserve1", await SatinCashPair.reserve1());
  })
});
