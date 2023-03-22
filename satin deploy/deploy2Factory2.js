const { ethers } = require("hardhat");
const { BigNumber, utils } = require("ethers");

const voterTokens = [
  "0xACFDeCB377e7A8b26ce033BDb01cb7630Ef07809", //CASH
  "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", //WETH
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", //USDC
  "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", //DAI
  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", //USDT
  "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", //WMATIC
  "0x327beEDB8926232B33b1f1a78856c7A27B443a74", //4poolLPToken
  "0xa3fa99a148fa48d14ed51d610c367c61876997f1", //Mim
  "0x3A58a54C066FdC0f2D55FC9C89F0415C92eBf3C4", //stMatic
];

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  const signer = (await ethers.getSigners())[0];

  console.log("Deploying from address", signer.address);
  console.log("Account balance", await signer.getBalance());

  const tresuryAddress = "0xb2a39c7CD710f9Cd9c86a75ab84a563Bb67d6EFD";
  const WethAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"; //CHANGE THIS
  const warmupPeriod = 1;
  const fourPoolAddress = "0xBd422978E222C626b94e66f33791a61FbE662115";
  const fourPoolLPTokenAddress = "0xd670c78E29c47eb091687C71Ed16b9B3BDf75Da0";
  const cashAddress = "0xACFDeCB377e7A8b26ce033BDb01cb7630Ef07809";

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
  const proxyFactory = await ProxyFactory_factory.attach("0xD74Cb4064eD75F4F74771d4Cb786adFf11586CEf");
  console.log("proxyFactory is deployed at address", proxyFactory.address);
  const proxyAdmin = "0x099212d125E349eBA51E0cC1F761156fd37adc14";
  console.log("proxyAdmin is deployed at address", proxyAdmin);
//   const poolImplementation = await pairContract.deploy();
  const BaseV1Factory_Factory = await ethers.getContractFactory("BaseV1Factory", {
    libraries: {
      ProxyFactory: proxyFactory.address,
    },
  });
  const _gaugeContract = await ethers.getContractFactory("Gauge");
//   const gaugeImplementation = await _gaugeContract.deploy();

  const _internalBribeContract = await ethers.getContractFactory("InternalBribe");
//   const internalBribeImplementation = await _internalBribeContract.deploy();

  const _externalBribeContract = await ethers.getContractFactory("ExternalBribe");
//   const externalBribeImplementation = await _externalBribeContract.deploy();

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

  const controller = await Controller.attach("0x5799cdDCF67B0F049010D66ADC4C4c3431518ebA");
  console.log("Controller is deployed at:", controller.address);
//   const factory = await upgrades.deployProxy(BaseV1Factory_Factory, [tresuryAddress, proxyAdmin, poolImplementation.address], {
//     unsafeAllowLinkedLibraries: true,
//   });
  const factory = BaseV1Factory_Factory.attach("0xD18FEA9fE31E090240eb5056Ce105ec32039B1D2");
  console.log("BaseV1Factory is deployed at:", factory.address);
  const router = await Router.attach("0x5A2B829F2bd02148B5b6C50b028467F6F584EE25");
  console.log("BaseV1Router01 is deployed at:", router.address);
//   const library = await Library.deploy(router.address);
  console.log("SatinLibrary is deployed at 0xE64f39922D7B370332601f760d1eAc68BbAa39AD");
  const token = await Token.attach("0x740d3aB670a593D4981F7DC128B9d337215d741A");
  console.log("Satin token is deployed at:", token.address);
//   const gaugeFactory = await upgrades.deployProxy(GaugeFactory_Factory, [proxyAdmin, gaugeImplementation.address], {
//     unsafeAllowLinkedLibraries: true,
//   });
  console.log("GaugeFactory is deployed at: 0x59c91A255b3e33B9BA4D489fED7629084fc94251");
//   const bribeFactory = await upgrades.deployProxy(BribeFactory_Factory, [proxyAdmin, internalBribeImplementation.address, externalBribeImplementation.address], {
//     unsafeAllowLinkedLibraries: true,
//   });
  console.log("BribeFactory is deployed at: 0xb0ef69C13ECff28A86d72baf6974Ce0C09dE6334");

  const ve = await Ve.attach("0x3c79c9b8e357730425b5198941AA4cEA84da012c");
  console.log("ve is deployed at address:", ve.address);

  const ve_dist = await upgrades.deployProxy(Ve_dist, [ve.address, token.address, cashAddress]);
  console.log("ve_dist is deployed at address:", ve_dist.address);

  const voter = await upgrades.deployProxy(BaseV1Voter, [ve.address, factory.address, "0x59c91A255b3e33B9BA4D489fED7629084fc94251", "0xb0ef69C13ECff28A86d72baf6974Ce0C09dE6334", token.address, ve_dist.address]);

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
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
