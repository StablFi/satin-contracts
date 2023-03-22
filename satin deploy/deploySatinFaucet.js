const { ethers, upgrades } = require("hardhat");
const { BigNumber, utils, Contract } = require("ethers");

async function main() {
  const signer = (await ethers.getSigners())[0];
  console.log("Deploying from address", signer.address);
  console.log("Account balance", await signer.getBalance());
  const tokenAddress = "0x91b0811bc1dB10cF51c4D77593296449c1982Dc1";
  const GenericERC20 = await ethers.getContractFactory("GenericERC20");
  const satinContract = await ethers.getContractFactory("Satin");
  const token = satinContract.attach(tokenAddress);

  const faucetContract = await ethers.getContractFactory("Faucet");

  const faucet =  faucetContract.attach("0x3f95218CFd55DF5a0787E463c90C40c54DC33774");

  await token.ownerMint(faucet.address, utils.parseUnits("200000"));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
