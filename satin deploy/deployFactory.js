const { ethers } = require("hardhat");
const { BigNumber, utils } = require("ethers");

const voterTokens = [
  "0x1a3acf6D19267E2d3e7f898f42803e90C9219062", //FXS
  "0xe5417af564e4bfda1c483642db72007871397896", //GNS
  "0xfa68fb4628dff1028cfec22b4162fccd0d45efb6", //MATICX
  "0x434e7bbbc9ae9f4ffade0b3175fef6e8a4a1c505", //LQDR
  "0xb5DFABd7fF7F83BAB83995E72A52B97ABb7bcf63", //USDR
  "0xbC2b48BC930Ddc4E5cFb2e87a45c379Aab3aac5C", //DOLA
  "0xFbdd194376de19a88118e84E279b977f165d01b8", //BIFI
  "0x596eBE76e2DB4470966ea395B0d063aC6197A8C5", //JRT
  "0xbd1fe73e1f12bd2bc237de9b626f056f21f86427", //jMXN
  "0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6", //EURe
  "0x491a4eB4f1FC3BfF8E1d2FC856a6A46663aD556f", //BRZ
  "0x62F594339830b90AE4C084aE7D223fFAFd9658A7", //SPHERE
  "0xd23Ed8cA350CE2631F7EcDC5E6bf80D0A1DeBB7B", //TAROT
  "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1", //MAI
  "0x1e3c6c53F9f60BF8aAe0D7774C21Fa6b1afddC57", //SHRAP
  "0x80487b4f8f70e793A81a42367c225ee0B94315DF", //CASH
  "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", //WMATIC
  "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", //WETH
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", //USDC
  "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", //DAI
  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", //USDT
];

const proxyAdminOwner = "Some EOA goes here";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  const signer = (await ethers.getSigners())[0];

  console.log("Deploying from address", signer.address);
  console.log("Account balance", await signer.getBalance());

  const tresuryAddress = "0x9c4927530B1719e063D7E181C6c2e56353204e64";
  const WethAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"; //CHANGE THIS
  const cashAddress = "0x80487b4f8f70e793A81a42367c225ee0B94315DF";

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
  const GenericERC20 = await ethers.getContractFactory("GenericERC20");
  const cash = GenericERC20.attach(cashAddress);
  await factory.createPair(cashAddress, token.address, false);

  console.log("Waiting additional 5s");
  await delay(5000);
  console.log("Waited an additional 5s");

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
