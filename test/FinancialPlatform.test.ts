import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import { FinancialPlatform, MockToken } from "../typechain-types";

// --- Helper functions ---
async function registerUser(
  contract: FinancialPlatform,
  user: Signer,
  name: string,
  email: string,
  role: number
) {
  await contract.registerUser(await user.getAddress(), name, email, role);
}

async function createTransaction(
  contract: FinancialPlatform,
  from: Signer,
  to: Signer,
  amount: bigint,
  description: string
) {
  await contract
    .connect(from)
    .createTransaction(await to.getAddress(), amount, description);
}

// --- Test suite ---
describe("FinancialPlatform", function () {
  let financialPlatform: FinancialPlatform;
  let mockToken: MockToken;
  let owner: Signer;
  let user1: Signer, user2: Signer, user3: Signer, approver1: Signer;
  let addrs: Signer[];

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [owner, user1, user2, user3, approver1, ...addrs] = signers;

    const FinancialPlatform = await ethers.getContractFactory(
      "FinancialPlatform"
    );
    const MockToken = await ethers.getContractFactory("MockToken");

    financialPlatform = await FinancialPlatform.deploy();
    mockToken = await MockToken.deploy("Platform Token", "PLT", 1000000);

    // Register test users using a loop
    const userInfos = [
      {
        user: user1,
        name: "John Manager",
        email: "john.manager@company.com",
        role: 1,
      },
      {
        user: user2,
        name: "Alice User",
        email: "alice.user@company.com",
        role: 0,
      },
      { user: user3, name: "Bob User", email: "bob.user@company.com", role: 0 },
      {
        user: approver1,
        name: "Sarah Approver",
        email: "sarah.approver@company.com",
        role: 1,
      },
    ];
    for (const info of userInfos) {
      await registerUser(
        financialPlatform,
        info.user,
        info.name,
        info.email,
        info.role
      );
    }
  });

  // --- Deployment ---
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(
        await financialPlatform.hasRole(
          await financialPlatform.DEFAULT_ADMIN_ROLE(),
          await owner.getAddress()
        )
      ).to.equal(true);
    });

    it("Should register deployer as admin user", async function () {
      const user = await financialPlatform.getUser(await owner.getAddress());
      expect(user.name).to.equal("Platform Admin");
      expect(user.role).to.equal(2); // Admin
    });
  });

  // --- User Management ---
  describe("User Management", function () {
    it("Should register new users correctly", async function () {
      const user = await financialPlatform.getUser(await user1.getAddress());
      expect(user.name).to.equal("John Manager");
      expect(user.email).to.equal("john.manager@company.com");
      expect(user.role).to.equal(1); // Manager
      expect(user.isActive).to.equal(true);
    });

    it("Should not allow duplicate user registration", async function () {
      await expect(
        financialPlatform.registerUser(
          await user1.getAddress(),
          "Duplicate User",
          "duplicate@company.com",
          0
        )
      ).to.be.revertedWith("User already registered");
    });

    it("Should update user roles correctly", async function () {
      await financialPlatform.updateUserRole(await user2.getAddress(), 1); // Manager
      const user = await financialPlatform.getUser(await user2.getAddress());
      expect(user.role).to.equal(1);
    });

    it("Should only allow admin to update user roles", async function () {
      await expect(
        financialPlatform
          .connect(user1)
          .updateUserRole(await user2.getAddress(), 1)
      ).to.be.revertedWith("Admin role required");
    });
  });

  // --- Transaction Management ---
  describe("Transaction Management", function () {
    beforeEach(async function () {
      await createTransaction(
        financialPlatform,
        user2,
        user3,
        ethers.parseEther("1000"),
        "Test transaction"
      );
    });

    it("Should create transactions correctly", async function () {
      const transaction = await financialPlatform.getTransaction(1);
      expect(transaction.from).to.equal(await user2.getAddress());
      expect(transaction.to).to.equal(await user3.getAddress());
      expect(transaction.amount).to.equal(ethers.parseEther("1000"));
      expect(transaction.description).to.equal("Test transaction");
      expect(transaction.status).to.equal(0); // Pending
    });

    it("Should not allow non-registered users to create transactions", async function () {
      await expect(
        financialPlatform
          .connect(addrs[0])
          .createTransaction(
            await user3.getAddress(),
            ethers.parseEther("1000"),
            "Test transaction"
          )
      ).to.be.revertedWith("User not registered");
    });

    it("Should not allow zero amount transactions", async function () {
      await expect(
        financialPlatform
          .connect(user2)
          .createTransaction(await user3.getAddress(), 0, "Test transaction")
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should not allow transactions to zero address", async function () {
      await expect(
        financialPlatform
          .connect(user2)
          .createTransaction(
            ethers.ZeroAddress,
            ethers.parseEther("1000"),
            "Test transaction"
          )
      ).to.be.revertedWith("Invalid recipient address");
    });
  });

  // --- Approval Workflow ---
  describe("Approval Workflow", function () {
    beforeEach(async function () {
      await createTransaction(
        financialPlatform,
        user2,
        user3,
        ethers.parseEther("1000"),
        "Test transaction"
      );
      await financialPlatform
        .connect(user2)
        .requestApproval(1, "Need approval");
    });

    it("Should request approval correctly", async function () {
      const approval = await financialPlatform.getApproval(1);
      expect(approval.transactionId).to.equal(1);
      expect(approval.requester).to.equal(await user2.getAddress());
      expect(approval.status).to.equal(0); // Pending
      expect(approval.reason).to.equal("Need approval");
    });

    it("Should only allow transaction owner to request approval", async function () {
      await expect(
        financialPlatform
          .connect(user3)
          .requestApproval(1, "Not my transaction")
      ).to.be.revertedWith("Not transaction owner");
    });

    it("Should process approval correctly", async function () {
      await financialPlatform
        .connect(approver1)
        .processApproval(1, true, "Approved");

      const approval = await financialPlatform.getApproval(1);
      expect(approval.status).to.equal(1); // Approved
      expect(approval.approver).to.equal(await approver1.getAddress());

      const transaction = await financialPlatform.getTransaction(1);
      expect(transaction.status).to.equal(1); // Active
    });

    it("Should reject approval correctly", async function () {
      await financialPlatform
        .connect(approver1)
        .processApproval(1, false, "Rejected");

      const approval = await financialPlatform.getApproval(1);
      expect(approval.status).to.equal(2); // Rejected

      const transaction = await financialPlatform.getTransaction(1);
      expect(transaction.status).to.equal(3); // Rejected
    });

    it("Should only allow approvers to process approvals", async function () {
      await expect(
        financialPlatform
          .connect(user3)
          .processApproval(1, true, "Not authorized")
      ).to.be.revertedWith("Not authorized");
    });

    it("Should not allow processing already processed approvals", async function () {
      await financialPlatform
        .connect(approver1)
        .processApproval(1, true, "Approved");

      await expect(
        financialPlatform
          .connect(approver1)
          .processApproval(1, false, "Already processed")
      ).to.be.revertedWith("Approval already processed");
    });
  });

  // --- Transaction Completion ---
  describe("Transaction Completion", function () {
    beforeEach(async function () {
      await createTransaction(
        financialPlatform,
        user2,
        user3,
        ethers.parseEther("1000"),
        "Test transaction"
      );
      await financialPlatform
        .connect(user2)
        .requestApproval(1, "Need approval");
      await financialPlatform
        .connect(approver1)
        .processApproval(1, true, "Approved");
    });

    it("Should complete approved transactions", async function () {
      await financialPlatform.connect(user2).completeTransaction(1);
      const transaction = await financialPlatform.getTransaction(1);
      expect(transaction.status).to.equal(2); // Completed
    });

    it("Should only allow transaction owner to complete", async function () {
      await expect(
        financialPlatform.connect(user3).completeTransaction(1)
      ).to.be.revertedWith("Not transaction owner");
    });

    it("Should not allow completing non-active transactions", async function () {
      await createTransaction(
        financialPlatform,
        user2,
        user3,
        ethers.parseEther("500"),
        "Another transaction"
      );
      await expect(
        financialPlatform.connect(user2).completeTransaction(2)
      ).to.be.revertedWith("Transaction not active");
    });
  });

  // --- Data Retrieval ---
  describe("Data Retrieval", function () {
    beforeEach(async function () {
      // Create multiple transactions using a loop
      const txInfos = [
        {
          from: user2,
          to: user3,
          amount: ethers.parseEther("1000"),
          desc: "Transaction 1",
        },
        {
          from: user3,
          to: user2,
          amount: ethers.parseEther("500"),
          desc: "Transaction 2",
        },
        {
          from: user2,
          to: user1,
          amount: ethers.parseEther("2000"),
          desc: "Transaction 3",
        },
      ];
      for (const tx of txInfos) {
        await createTransaction(
          financialPlatform,
          tx.from,
          tx.to,
          tx.amount,
          tx.desc
        );
      }
    });

    it("Should get user transactions correctly", async function () {
      const userTransactions = await financialPlatform.getUserTransactions(
        await user2.getAddress()
      );
      expect(userTransactions.length).to.equal(3); // 2 as sender, 1 as recipient
    });

    it("Should get correct transaction count", async function () {
      expect(await financialPlatform.getTransactionCount()).to.equal(3);
    });

    it("Should get correct user count", async function () {
      expect(await financialPlatform.getUserCount()).to.equal(5); // owner + 4 registered users
    });
  });

  // --- Pending Approvals ---
  describe("Pending Approvals", function () {
    beforeEach(async function () {
      // Create transactions and request approvals using a loop
      const approvalInfos = [
        {
          from: user2,
          to: user3,
          amount: ethers.parseEther("1000"),
          desc: "Transaction 1",
          requester: user2,
          reason: "Approval 1",
          id: 1,
        },
        {
          from: user3,
          to: user2,
          amount: ethers.parseEther("500"),
          desc: "Transaction 2",
          requester: user3,
          reason: "Approval 2",
          id: 2,
        },
      ];
      for (const info of approvalInfos) {
        await createTransaction(
          financialPlatform,
          info.from,
          info.to,
          info.amount,
          info.desc
        );
        await financialPlatform
          .connect(info.requester)
          .requestApproval(info.id, info.reason);
      }
      await financialPlatform
        .connect(approver1)
        .processApproval(1, true, "Approved");
    });

    it("Should get pending approvals correctly", async function () {
      const pendingApprovals = await financialPlatform.getPendingApprovals();
      expect(pendingApprovals.length).to.equal(1); // Only approval 2 should be pending
    });
  });

  // --- Events ---
  describe("Events", function () {
    it("Should emit TransactionCreated event", async function () {
      await expect(
        financialPlatform
          .connect(user2)
          .createTransaction(
            await user3.getAddress(),
            ethers.parseEther("1000"),
            "Test transaction"
          )
      )
        .to.emit(financialPlatform, "TransactionCreated")
        .withArgs(
          1,
          await user2.getAddress(),
          await user3.getAddress(),
          ethers.parseEther("1000")
        );
    });

    it("Should emit ApprovalRequested event", async function () {
      await createTransaction(
        financialPlatform,
        user2,
        user3,
        ethers.parseEther("1000"),
        "Test transaction"
      );

      await expect(
        financialPlatform.connect(user2).requestApproval(1, "Need approval")
      )
        .to.emit(financialPlatform, "ApprovalRequested")
        .withArgs(1, 1, await user2.getAddress());
    });

    it("Should emit ApprovalProcessed event", async function () {
      await createTransaction(
        financialPlatform,
        user2,
        user3,
        ethers.parseEther("1000"),
        "Test transaction"
      );
      await financialPlatform
        .connect(user2)
        .requestApproval(1, "Need approval");

      await expect(
        financialPlatform
          .connect(approver1)
          .processApproval(1, true, "Approved")
      )
        .to.emit(financialPlatform, "ApprovalProcessed")
        .withArgs(1, 1, await approver1.getAddress());
    });
  });
});
