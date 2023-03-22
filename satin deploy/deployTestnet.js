const { ethers } = require("hardhat");
const { BigNumber, utils } = require("ethers");

// const proxyAdminOwner = "Some EOA goes here";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  const signer = (await ethers.getSigners())[0];

  console.log("Deploying from address", signer.address);
  console.log("Account balance", await signer.getBalance());

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

  console.log("wmatic is deployed at address", wmatic.address);
  console.log("usdt is deployed at address", usdt.address);
  console.log("usdc is deployed at address", usdc.address);
  console.log("cash is deployed at address", cash.address);
  console.log("dai is deployed at address", dai.address);
  console.log("stMatic is deployed at address", stMatic.address);
  console.log("mai is deployed at address", mai.address);
  console.log("weth is deployed at address", weth.address);

  const voterTokens = [wmatic.address, usdt.address, usdc.address, cash.address, dai.address, stMatic.address, mai.address, weth.address];

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

  console.log("Waiting additional 10s");
  await delay(10000);
  console.log("Waited an additional 10s");

  const CashSatinLPAddress = await factory.getPair(cashAddress, token.address, false);

  console.log("CashSatinLPAddress", CashSatinLPAddress);

  await ve.postInitialize(CashSatinLPAddress);
  await voter.postInitialize([...voterTokens, token.address], minter.address);
  console.log("Voter contract initialized");
  await factory.setPause(CashSatinLPAddress, true);
  console.log("SATIN-CASH TRADING PAUSED");

  // SATIN is ownable
  // await token.transferOwnership(proxyAdminOwner);

  // Owner could be same or different
  // await upgrades.admin.transferProxyAdminOwnership(proxyAdminOwner);
  // Import any one of the contract deployed using the external proxyAdmin, then transfer its owner
  // await upgrades.forceImport(CashSatinLPAddress, pairContract);
  // await upgrades.admin.transferProxyAdminOwnership(proxyAdminOwner);

  // ...import any other ownable tokens that might be needing a change of owner
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
