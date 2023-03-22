const { ethers, upgrades } = require("hardhat");
const { BigNumber, utils, Contract } = require("ethers");
const { parseUnits } = require("ethers/lib/utils");

async function main() {
  const signer = (await ethers.getSigners())[0];
  console.log("Deploying from address", signer.address);
  console.log("Account balance", await signer.getBalance());
  const routerAddr = "0x5A2B829F2bd02148B5b6C50b028467F6F584EE25";

  const lib = await ethers.getContractFactory("SwapLibrary");
  const library = await lib.deploy(routerAddr);

  console.log("library is deployed at", library.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
