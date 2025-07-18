import { ethers } from "hardhat";
import fs from "fs";
import { FinancialPlatform, MockToken } from "../typechain-types";
import { Signer } from "ethers";

enum UserRoles {
  Regular = 0,
  Manager = 1,
}

interface ISignerInfo {
  key: string;
  address: string;
  role: UserRoles;
  fullName: string;
  email: string;
  etherSigner: Signer;
}

type TUserNames = "user1" | "user2" | "user3" | "approver";

type TSignerInfos = Record<TUserNames, ISignerInfo>;

const TOKEN_AMOUNT = ethers.parseEther("10000"); // 10,000 tokens each

async function registerUser(
  platform: FinancialPlatform,
  signerInfo: ISignerInfo
) {
  const tx = await platform.registerUser(
    signerInfo.address,
    signerInfo.fullName,
    signerInfo.email,
    signerInfo.role
  );
  await tx.wait();
  console.log(`Registered ${signerInfo.key} as ${UserRoles[signerInfo.role]}`);
}

async function mintToken(mockToken: MockToken, signerInfo: ISignerInfo) {
  const tx = await mockToken.mint(signerInfo.address, TOKEN_AMOUNT);
  await tx.wait();
}

async function createSampleTransactions(
  platform: FinancialPlatform,
  signerInfos: TSignerInfos
) {
  // Connect as user2 and create transactions
  const user2Platform = platform.connect(signerInfos.user2.etherSigner);
  // Transaction 1
  const createTransaction1 = await user2Platform.createTransaction(
    signerInfos.user2.address,
    ethers.parseEther("1000"),
    "Payment for services for transaction 1"
  );
  await createTransaction1.wait();
  console.log("Created transaction 1");

  // Transaction 2
  const createTransaction2 = await user2Platform.createTransaction(
    signerInfos.user1.address,
    ethers.parseEther("2500"),
    "Payment for services for transaction 2"
  );
  await createTransaction2.wait();
  console.log("Created transaction 2");

  // Connect as user3 and create transactions
  const user3Platform = platform.connect(signerInfos.user3.etherSigner);

  // Transaction 3
  const createTransaction3 = await user3Platform.createTransaction(
    signerInfos.user2.address,
    ethers.parseEther("500"),
    "Payment for services for transaction 3"
  );
  await createTransaction3.wait();
  console.log("Created transaction 3");

  return { user2Platform, user3Platform };
}
async function doRequestApprovals(
  financialPlatform: FinancialPlatform,
  user2Platform: FinancialPlatform,
  user3Platform: FinancialPlatform,
  signerInfos: TSignerInfos
) {
  // Request approval for transaction 1
  const approval1 = await user2Platform.requestApproval(
    1,
    "Requesting approval for transaction 1"
  );
  await approval1.wait();
  console.log("Requested approval for transaction 1");

  // Request approval for transaction 2
  const approval2 = await user2Platform.requestApproval(
    2,
    "Requesting approval for transaction 2"
  );
  await approval2.wait();
  console.log("Requested approval for transaction 2");

  // Request approval for transaction 3
  const approval3 = await user3Platform.requestApproval(
    3,
    "Requesting approval for transaction 3"
  );
  await approval3.wait();
  console.log("Requested approval for transaction 3");

  // Process some approvals
  console.log("Processing approvals...");
  const approver1Platform = financialPlatform.connect(
    signerInfos.approver.etherSigner
  );

  // Approve transaction 1
  const processApproval1 = await approver1Platform.processApproval(
    1,
    true,
    "Approving transaction 1"
  );
  await processApproval1.wait();
  console.log("Approved transaction 1");

  // Reject transaction 2
  const processRejecting1 = await approver1Platform.processApproval(
    2,
    false,
    "Rejecting transaction 2"
  );
  await processRejecting1.wait();
  console.log("Rejected transaction 2");

  // Complete approved transaction
  const processApproval3 = await user2Platform.completeTransaction(1);
  await processApproval3.wait();
  console.log("Completed transaction 1");
}

async function saveDeploymentInfo(
  platformAddress: string,
  tokenAddress: string,
  deployerAddress: string,
  signerInfos: TSignerInfos
) {
  // Save deployment info for frontend
  const deploymentInfo = {
    network: "localhost",
    contracts: {
      FinancialPlatform: platformAddress,
      MockToken: tokenAddress,
    },
    testAccounts: {
      deployer: deployerAddress,
      user1: signerInfos.user1.address,
      user2: signerInfos.user2.address,
      user3: signerInfos.user3.address,
      approver1: signerInfos.approver.address,
    },
  };

  fs.writeFileSync(
    "deployment-info.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
}

async function main() {
  console.log("Deploying contracts...");

  // Get the contract factories
  const FinancialPlatform = await ethers.getContractFactory(
    "FinancialPlatform"
  );
  const MockToken = await ethers.getContractFactory("MockToken");

  // Deploy FinancialPlatform
  console.log("Deploying FinancialPlatform...");
  const financialPlatform = await FinancialPlatform.deploy();
  await financialPlatform.waitForDeployment();
  const platformAddress = await financialPlatform.getAddress();
  console.log("FinancialPlatform deployed to:", platformAddress);

  // Deploy MockToken
  console.log("Deploying MockToken...");
  const mockToken = await MockToken.deploy("Platform Token", "PLT", 1000000); // 1M tokens
  await mockToken.waitForDeployment();
  const tokenAddress = await mockToken.getAddress();
  console.log("MockToken deployed to:", tokenAddress);

  const signers = await ethers.getSigners();

  if (signers.length < 5) {
    throw new Error(
      `Expected 5 signers, but got ${signers.length}. Please make sure you passed at least 5 private keys in .env file`
    );
  }

  const [deployer, user1, user2, user3, approver] = signers;

  const deployerAddress = await deployer.getAddress();

  const signerInfos: TSignerInfos = {
    user1: {
      key: "user1",
      address: await user1.getAddress(),
      role: UserRoles.Manager,
      fullName: "John Manager",
      email: "john.manager@company.com",
      etherSigner: user1,
    },
    user2: {
      key: "user2",
      address: await user2.getAddress(),
      role: UserRoles.Regular,
      fullName: "Alice User",
      email: "alice.user@company.com",
      etherSigner: user2,
    },
    user3: {
      key: "user3",
      address: await user3.getAddress(),
      role: UserRoles.Regular,
      fullName: "Bob User",
      email: "bob.user@company.com",
      etherSigner: user3,
    },
    approver: {
      key: "approver",
      address: await approver.getAddress(),
      role: UserRoles.Manager,
      fullName: "Sarah Approver",
      email: "sarah.approver@company.com",
      etherSigner: approver,
    },
  };

  for (const k in signerInfos) {
    const key = k as TUserNames;
    await registerUser(financialPlatform, signerInfos[key]);
  }

  // Mint tokens to users for testing
  console.log("Minting tokens to users...");

  for (const k in signerInfos) {
    const key = k as TUserNames;
    await mintToken(mockToken, signerInfos[key]);
  }

  console.log("Minted 10,000 tokens to each user");

  // Create some sample transactions
  console.log("Creating sample transactions...");

  const { user2Platform, user3Platform } = await createSampleTransactions(
    financialPlatform,
    signerInfos
  );

  // Request approvals for transactions
  console.log("Requesting approvals...");

  await doRequestApprovals(
    financialPlatform,
    user2Platform,
    user3Platform,
    signerInfos
  );

  // Log results.
  console.log("\nDeployment and setup completed successfully!");
  console.log("\nContract Addresses:");
  console.log("FinancialPlatform:", platformAddress);
  console.log("MockToken:", tokenAddress);
  console.log("\nTest Accounts:");
  console.log("Deployer (Admin):", deployerAddress);
  console.log("User1 (Manager):", signerInfos.user1.address);
  console.log("User2 (Regular):", signerInfos.user2.address);
  console.log("User3 (Regular):", signerInfos.user3.address);
  console.log("Approver1 (Manager):", signerInfos.approver.address);

  await saveDeploymentInfo(
    platformAddress,
    tokenAddress,
    deployerAddress,
    signerInfos
  );

  console.log("\nDeployment info saved to deployment-info.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
