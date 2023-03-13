const { expect } = require("chai");
const { ethers } = require("hardhat");
const { factory } = require("typescript");
const { TimeUtils } = require("../TimeUtils");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const { formatUnits, parseUnits } = require("ethers/lib/utils");
const { BigNumber, utils, Contract } = require("ethers");
const { parse } = require("typechain");
const MAX_UINT = BigNumber.from("115792089237316195423570985008687907853269984665640564039457584007913129639935");
const amount1000At6 = parseUnits("1000", 6);
const WEEK = 60 * 60 * 24 * 7;

describe("ve tests", function () {
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
  let gaugeSatinCash;
  let bribeSatinCash;

  before(async function () {
    [owner, owner2, owner3] = await ethers.getSigners();

    console.log("Deploying from address", owner.address);
    console.log("Account balance", await owner.getBalance());

    //   stmatic, mai, weth

    const GenericERC20 = await ethers.getContractFactory("GenericERC20");
    const WETH = await ethers.getContractFactory("WETH");
    const wmatic = await WETH.deploy();
    const usdt = await GenericERC20.deploy("mUSDT", "mUSDT", 6);
    const usdc = await GenericERC20.deploy("mUSDC", "mUSDC", 6);
    const cash = await GenericERC20.deploy("mCASH", "mCASH", 18);
    const dai = await GenericERC20.deploy("mDAI", "mDAI", 18);
    const stMatic = await GenericERC20.deploy("mstMATIC", "mstMATIC", 18);
    const mai = await GenericERC20.deploy("mMAI", "mMAI", 18);
    const weth = await GenericERC20.deploy("mWETH", "mWETH", 18);

    const voterTokens = [wmatic.address, usdt.address, usdc.address, cash.address, dai.address, stMatic.address, mai.address, weth.address];

    console.log("wmatic is deployed at address", wmatic.address);
    console.log("usdt is deployed at address", usdt.address);
    console.log("usdc is deployed at address", usdc.address);
    console.log("cash is deployed at address", cash.address);
    console.log("dai is deployed at address", dai.address);
    console.log("stMatic is deployed at address", stMatic.address);
    console.log("mai is deployed at address", mai.address);
    console.log("weth is deployed at address", weth.address);

    const tresuryAddress = "0xb2a39c7CD710f9Cd9c86a75ab84a563Bb67d6EFD";
    const WethAddress = wmatic.address; //CHANGE THIS
    const cashAddress = cash.address;

    const ProxyFactory_factory = await ethers.getContractFactory("ProxyFactory");
    const Router = await ethers.getContractFactory("BaseV1Router01");
    const Library = await ethers.getContractFactory("SwapLibrary");
    const Token = await ethers.getContractFactory("Satin");
    const Ve = await ethers.getContractFactory("Ve");
    const pairContract = await ethers.getContractFactory("BaseV1Pair");
    const Ve_dist = await ethers.getContractFactory("VeDist");
    const BaseV1Voter = await ethers.getContractFactory("SatinVoter");
    const BaseV1Minter = await ethers.getContractFactory("SatinMinter");
    const Controller = await ethers.getContractFactory("Controller");
    const proxyFactory = await ProxyFactory_factory.deploy();
    console.log("proxyFactory is deployed at address", proxyFactory.address);
    const proxyAdmin = await upgrades.deployProxyAdmin();
    console.log("proxyAdmin is deployed at address", proxyAdmin);
    const poolImplementation = await pairContract.deploy();
    console.log("poolImplementation is deployed at", poolImplementation.address);
    const BaseV1Factory_Factory = await ethers.getContractFactory("BaseV1Factory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });
    const _gaugeContract = await ethers.getContractFactory("Gauge");
    const gaugeImplementation = await _gaugeContract.deploy();
    console.log("gaugeImplementation is deployed at", gaugeImplementation.address);

    const _internalBribeContract = await ethers.getContractFactory("InternalBribe");
    const internalBribeImplementation = await _internalBribeContract.deploy();
    console.log("internalBribeImplementation is deployed at", internalBribeImplementation.address);

    const _externalBribeContract = await ethers.getContractFactory("ExternalBribe");
    const externalBribeImplementation = await _externalBribeContract.deploy();
    console.log("externalBribeImplementation is deployed at", externalBribeImplementation.address);

    const BribeFactory_Factory = await ethers.getContractFactory("BribeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    const GaugeFactory_Factory = await ethers.getContractFactory("GaugeFactory", {
      libraries: {
        ProxyFactory: proxyFactory.address,
      },
    });

    const controller = await upgrades.deployProxy(Controller);
    console.log("Controller is deployed at:", controller.address);
    const factory = await upgrades.deployProxy(BaseV1Factory_Factory, [tresuryAddress, proxyAdmin, poolImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });
    console.log("BaseV1Factory is deployed at:", factory.address);
    const router = await upgrades.deployProxy(Router, [factory.address, WethAddress]);
    console.log("BaseV1Router01 is deployed at:", router.address);
    const library = await Library.deploy(router.address);
    console.log("SatinLibrary is deployed at", library.address);
    const token = await upgrades.deployProxy(Token);
    console.log("Satin token is deployed at:", token.address);
    const gaugeFactory = await upgrades.deployProxy(GaugeFactory_Factory, [proxyAdmin, gaugeImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });
    console.log("GaugeFactory is deployed at:", gaugeFactory.address);
    const bribeFactory = await upgrades.deployProxy(BribeFactory_Factory, [proxyAdmin, internalBribeImplementation.address, externalBribeImplementation.address], {
      unsafeAllowLinkedLibraries: true,
    });
    console.log("BribeFactory is deployed at:", bribeFactory.address);

    const ve = await upgrades.deployProxy(Ve, [controller.address]);
    console.log("ve is deployed at address:", ve.address);

    const ve_dist = await upgrades.deployProxy(Ve_dist, [ve.address, token.address, cashAddress]);
    console.log("ve_dist is deployed at address:", ve_dist.address);

    const voter = await upgrades.deployProxy(BaseV1Voter, [ve.address, factory.address, gaugeFactory.address, bribeFactory.address, token.address, ve_dist.address]);

    console.log("voter is deployed at address:", voter.address);

    const minter = await upgrades.deployProxy(BaseV1Minter, [ve.address, controller.address, token.address]);
    console.log("minter is deployed at address:", minter.address);

    await token.setMinter(minter.address);
    console.log("Token contract initialized");
    await ve_dist.setDepositor(minter.address);
    await ve_dist.setVoter(voter.address);
    console.log("Ve Dist contract initialized");
    await controller.setVeDist(ve_dist.address);
    console.log("Controller contract setVeDist initialized");
    await controller.setVoter(voter.address);
    console.log("Controller contract setVoter initialized");
    console.log("Minter contract initialized");
    console.log("cashAddress", cashAddress);
    console.log("tokenAddress", token.address);
    //   const GenericERC20 = await ethers.getContractFactory("GenericERC20");
    //   const cash = GenericERC20.attach(cashAddress);
    await factory.createPair(cashAddress, token.address, false);

    console.log("Waiting additional 5s");
    // await delay(5000);
    console.log("Waited an additional 5s");

    const CashSatinLPAddress = await factory.getPair(cashAddress, token.address, false);

    console.log("CashSatinLPAddress", CashSatinLPAddress);

    await ve.postInitialize(CashSatinLPAddress);
    await voter.postInitialize([...voterTokens, token.address], minter.address);
    console.log("Voter contract initialized");
    await factory.setPause(CashSatinLPAddress, true);
    console.log("SATIN-CASH TRADING PAUSED");

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

    const arguments = [TOKEN_ADDRESSES, TOKEN_DECIMALS, LP_TOKEN_NAME, LP_TOKEN_SYMBOL, INITIAL_A, SWAP_FEE, ADMIN_FEE];

    const SwapContract = await upgrades.deployProxy(Swap, arguments, {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["external-library-linking"],
    });

    console.log("SwapContract is deployed at", SwapContract.address);

    await SwapContract.deployed();

    LPTokenAddress = await SwapContract.swapStorage();

    console.log("INITIALIZED");
    console.log("LP Token deployed at address:", LPTokenAddress.lpToken);
  });

  it("Check voting power max ", async function () {});
});
