const { ethers, upgrades } = require("hardhat");
const { BigNumber, utils, Contract } = require("ethers");
const { TimeUtils } = require("../../test/TimeUtils");

async function main() {
  const MAX_UINT = BigNumber.from("115792089237316195423570985008687907853269984665640564039457584007913129639935");
  [owner, owner2, owner3] = await ethers.getSigners();
  const GenericERC20 = await ethers.getContractFactory("GenericERC20");
  const WETH = await ethers.getContractFactory("WETH");
  wmatic = await WETH.deploy();
  usdt = await GenericERC20.deploy("USDT", "USDT", 6);
  usdc = await GenericERC20.deploy("USDC", "USDC", 6);
  cash = await GenericERC20.deploy("CASH", "CASH", 18);
  dai = await GenericERC20.deploy("DAI", "DAI", 18);

  console.log("wmatic is deployed at", wmatic.address);
  console.log("usdt is deployed at", usdt.address);
  console.log("usdc is deployed at", usdc.address);
  console.log("cash is deployed at", cash.address);
  console.log("dai is deployed at", dai.address);

  await usdt.mint(owner.address, utils.parseUnits("1000000", 6));
  await usdc.mint(owner.address, utils.parseUnits("1000000", 6));
  await dai.mint(owner.address, utils.parseUnits("1000000"));
  await cash.mint(owner.address, utils.parseUnits("1000000"));

  console.log("Minting done");

  const Multicall = await ethers.getContractFactory("Multicall2");
  const multicall = await Multicall.deploy();

  console.log("multicall is deployed at", multicall.address);

  let Factory = await ethers.getContractFactory("BaseV1Factory");
  const factory = await upgrades.deployProxy(Factory, [owner3.address]);
  console.log("factory is deployed at", factory.address);
  let Router = await ethers.getContractFactory("BaseV1Router01");
  const router = await upgrades.deployProxy(Router, [factory.address, wmatic.address]);
  console.log("router is deployed at", router.address);

  const Token = await ethers.getContractFactory("Satin");
  const Gaauges = await ethers.getContractFactory("GaugeFactory");
  const Briibes = await ethers.getContractFactory("BribeFactory");
  const Ve = await ethers.getContractFactory("Ve");
  const Ve_dist = await ethers.getContractFactory("VeDist");
  const BaseV1Voter = await ethers.getContractFactory("SatinVoter");
  const BaseV1Minter = await ethers.getContractFactory("SatinMinter");
  const Controller = await ethers.getContractFactory("Controller");
  const Library = await ethers.getContractFactory("SwapLibrary");

  const controller = await upgrades.deployProxy(Controller);
  console.log("controller is deployed at", controller.address);
  const token = await upgrades.deployProxy(Token);
  console.log("token is deployed at", token.address);
  const gauges = await upgrades.deployProxy(Gaauges);
  console.log("gauges is deployed at", gauges.address);
  const bribes = await upgrades.deployProxy(Briibes);
  console.log("bribes is deployed at", bribes.address);
  const ve = await upgrades.deployProxy(Ve, [controller.address]);
  console.log("ve is deployed at", ve.address);
  const ve_dist = await upgrades.deployProxy(Ve_dist, [ve.address, token.address, cash.address]);
  console.log("ve_dist is deployed at", ve_dist.address);
  const voter = await upgrades.deployProxy(BaseV1Voter, [ve.address, factory.address, gauges.address, bribes.address, token.address, ve_dist.address]);
  console.log("voter is deployed at", voter.address);
  const minter = await upgrades.deployProxy(BaseV1Minter, [ve.address, controller.address, token.address]);
  console.log("minter is deployed at", minter.address);
  const cashAddress = cash.address;
  const library = await Library.deploy(router.address);
  console.log("SatinLibrary is deployed at", library.address);

  const voterTokens = [wmatic.address, usdt.address, usdc.address, dai.address, token.address, cash.address];

  await token.setMinter(minter.address);
  await ve_dist.setDepositor(minter.address);
  await controller.setVeDist(ve_dist.address);
  await controller.setVoter(voter.address);
  console.log("Minter contract initialized");
  const SatinBalance = await token.balanceOf(owner.address);
  console.log("Balance of satin of owner1", SatinBalance);
  await factory.createPair(cashAddress, token.address, false);
  const CashSatinLPAddress = await factory.getPair(cashAddress, token.address, false);
  console.log("CashSatinLPAddress", CashSatinLPAddress);
  
  await ve.postInitialize(CashSatinLPAddress);
  await voter.postInitialize(voterTokens, minter.address);
  console.log("Ve contract initialized");

  await cash.approve(router.address, MAX_UINT);
  await token.approve(router.address, MAX_UINT);

  await router.addLiquidity(token.address, cashAddress, false, utils.parseUnits("1250000"), utils.parseUnits("500"), 1, 1, owner.address, Date.now());

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
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
