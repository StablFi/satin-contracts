// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { ethers, upgrades } = require("hardhat");

async function main() {
  // const Satin = await ethers.getContractFactory("Satin");
  // const instance = await upgrades.deployProxy(Satin, [1663444647852,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266','0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266','0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']);
  // await instance.deployed();

  const [deployer] = await ethers.getSigners();

  console.log("Deploying Contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const TOKEN_ADDRESSES = [
    "0x194Aef38C240004fd521d6C7b66539b1eEdc2e3F", //DAI
    "0x99dAA49c64dA2BEC7Aa6e2fCC1D533293b68CE70", //USDC
    "0x030fe947d0F1938BE86ade87DE8924d79622E48E", //USDT
    "0x6b0388D7db861b034a6cF90494921Bf501b82E10", //CASH
  ];
  const TOKEN_DECIMALS = [18, 6, 6, 18];
  const LP_TOKEN_NAME = "Satin DAI/USDC/USDT/CASH";
  const LP_TOKEN_SYMBOL = "satinCash";
  const INITIAL_A = 2000;
  const SWAP_FEE = 5e5; //0.5bps
  const ADMIN_FEE = 1e9; //10% od swap fee

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

  const SwapContract = await upgrades.deployProxy(Swap, arguments, {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["external-library-linking"],
  });

  await SwapContract.deployed();

  console.log("SwapContract deployed at:", SwapContract.address);
  LPTokenAddress = await SwapContract.swapStorage();

  console.log("INITIALIZED");
  console.log("LP Token deployed at address:", LPTokenAddress.lpToken);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
