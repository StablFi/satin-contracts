require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-interface-generator");
require("hardhat-tracer");
require("@typechain/hardhat");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require("solidity-coverage");

/** @type import('hardhat/config').HardhatUserConfig */
// const RINKEBY_RPC_URL = process.env.RINKEBY_RPC_URL
// const GOERLI_RPC_URL = process.env.RINKEBY_RPC_URL
// const MATIC_RPC_URL = process.env.MATIC_RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY;
// const PRIVATE_KEY2 = process.env.PRIVATE_KEY2 ? process.env.PRIVATE_KEY2 : process.env.PRIVATE_KEY

module.exports = {
  localhost: {
    timeout: 1000000000,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  solidity: {
    compilers: [
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 5000,
            details: {
              yul: true,
              yulDetails: {
                stackAllocation: true,
                optimizerSteps: "dhfoDgvulfnTUtnIf",
              },
            },
          },
        },
      },
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 5000,
            details: {
              yul: true,
              yulDetails: {
                stackAllocation: true,
                optimizerSteps: "dhfoDgvulfnTUtnIf",
              },
            },
          },
        },
      },
      {
        version: "0.8.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 5000,
            details: {
              yul: true,
              yulDetails: {
                stackAllocation: true,
                optimizerSteps: "dhfoDgvulfnTUtnIf",
              },
            },
          },
        },
      },
      {
        version: "0.8.13",
        settings: {
          optimizer: {
            enabled: true,
            runs: 50,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.RPC,
      },
      mining: {
        auto: true,
        interval: 2000,
      },
    },
    //     rinkeby: {
    //       url: RINKEBY_RPC_URL,
    //       accounts: [PRIVATE_KEY],
    //       chainId: 4,
    //     },
    //     goerli: {
    //       url: GOERLI_RPC_URL,
    //       accounts: [PRIVATE_KEY],
    //       chainId: 5,
    //     },
    polygon: {
      url: process.env.RPC,
      chainId: 137,
      accounts: [PRIVATE_KEY],
      gasPrice: 300e9, // in wei
      gasMultiplier: 1.2,
    },
    mumbai: {
      url: process.env.TESTNET_RPC,
      chainId: 80001,
      accounts: [PRIVATE_KEY],
    },
    tenderly: {
      url: "https://rpc.tenderly.co/fork/10703085-2bad-4f77-b0c8-a4a41f8bada6",
      chainId: 137,
      accounts: [PRIVATE_KEY],
    },
    stabl: {
      url: "https://internal-rpc.stabl.fi",
      accounts: [PRIVATE_KEY],
      gasPrice: 4000e9, // in wei
      gasMultiplier: 1.2,
    },
  },
  mocha: {
    timeout: 100000000,
  },
  typechain: {
    outDir: "typechain",
  },
  paths: {
    sources: "./contracts",
  },
  gasReporter: {
    enabled: true,
  },
};
