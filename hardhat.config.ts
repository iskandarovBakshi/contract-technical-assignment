import "@typechain/hardhat";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

const signers = JSON.parse(process.env.PRIVATE_KEYS ?? "[]");

const config = {
  solidity: {
    version: "0.8.22",
    settings: {
      viaIR: true, // Enable viaIR to handle stack too deep errors
      optimizer: {
        enabled: true,
        runs: 1, // Optimize for size instead of runtime gas efficiency
      },
    },
  },
  networks: {
    holesky: {
      url:
        process.env.HOLESKY_RPC_URL ||
        "https://ethereum-holesky.publicnode.com",
      accounts: signers,
      chainId: 17000,
      timeout: 120000, // 2 minutes timeout
      gasPrice: "auto",
      gas: "auto",
    },
  },
  etherscan: {
    apiKey: {
      holesky: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};

module.exports = config;
