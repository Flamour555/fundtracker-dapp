
import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("FundTracker", function () {
  async function deployFundTracker() {
    const [owner, alice, bob] = await ethers.getSigners();

    const fundTracker = await ethers.deployContract("FundTracker");
    await fundTracker.waitForDeployment();

    return { fundTracker, owner, alice, bob };
  }

  it("records the deployer as owner", async function () {
    const { fundTracker, owner } = await deployFundTracker();

    expect(await fundTracker.owner()).to.equal(owner.address);
  });

  it("records a contribution", async function () {
    const { fundTracker, alice } = await deployFundTracker();
    const amount = ethers.parseEther("1");

    await fundTracker.connect(alice).contribute({ value: amount });

    expect(await fundTracker.totalContributions()).to.equal(amount);
    expect(await fundTracker.contributions(alice.address)).to.equal(amount);
  });

  it("tracks contributions from multiple accounts", async function () {
    const { fundTracker, alice, bob } = await deployFundTracker();
    const aliceAmount = ethers.parseEther("1");
    const bobAmount = ethers.parseEther("2");

    await fundTracker.connect(alice).contribute({ value: aliceAmount });
    await fundTracker.connect(bob).contribute({ value: bobAmount });

    expect(await fundTracker.contributions(alice.address)).to.equal(aliceAmount);
    expect(await fundTracker.contributions(bob.address)).to.equal(bobAmount);
    expect(await fundTracker.totalContributions()).to.equal(
      aliceAmount + bobAmount
    );
  });

  it("rejects a zero-value contribution", async function () {
    const { fundTracker, alice } = await deployFundTracker();

    await expect(
      fundTracker.connect(alice).contribute({ value: 0 })
    ).to.be.revertedWith("Contribution must be greater than zero");
  });

  it("emits an event when a contribution is received", async function () {
    const { fundTracker, alice } = await deployFundTracker();
    const amount = ethers.parseEther("1");

    await expect(
      fundTracker.connect(alice).contribute({ value: amount })
    )
      .to.emit(fundTracker, "ContributionReceived")
      .withArgs(alice.address, amount);
  });
});
