
import { useEffect, useState } from "react";
import {
  BrowserProvider,
  Contract,
  formatEther,
  parseEther,
} from "ethers";
import "./App.css";
import contractArtifact from "./FundTracker.json";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const LOCAL_CHAIN_ID = "0x7a69"; // Hardhat local chain: 31337
const ABI = contractArtifact.abi;
type ContributionRecord = {
    contributor: string;
    amount: string;
    blockNumber: number;
    transactionHash: string;
  };
declare global {
  interface Window {
    ethereum?: {
      request: (args: {
        method: string;
        params?: unknown[];
      }) => Promise<unknown>;
      on?: (
        event: string,
        callback: (...args: unknown[]) => void
      ) => void;
      removeListener?: (
        event: string,
        callback: (...args: unknown[]) => void
      ) => void;
    };
  }
}

function App() {
  const [account, setAccount] = useState("");
  const [total, setTotal] = useState("0");
  const [myContribution, setMyContribution] = useState("0");
  const [amount, setAmount] = useState("0.1");
  const [status, setStatus] = useState(
    "Connect your wallet to get started."
  );
  const [busy, setBusy] = useState(false);

  // Live ETH/USD market price
  const [ethUsdPrice, setEthUsdPrice] = useState<number | null>(null);
  const [priceUpdatedAt, setPriceUpdatedAt] = useState<Date | null>(null);
  const [priceError, setPriceError] = useState("");
  const [contributionHistory, setContributionHistory] =
    useState<ContributionRecord[]>([]);
  // Fetch the ETH price and refresh it every 60 seconds.
  useEffect(() => {
    let active = true;

    async function fetchEthPrice() {
      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );

        if (!response.ok) {
          throw new Error("Price service temporarily unavailable.");
        }

        const data = await response.json();
        const price = data.ethereum?.usd;

        if (typeof price !== "number" || !Number.isFinite(price)) {
          throw new Error("Invalid price response.");
        }

        if (active) {
          setEthUsdPrice(price);
          setPriceUpdatedAt(new Date());
          setPriceError("");
        }
      } catch {
        if (active) {
          setPriceError("Unable to fetch the latest ETH price.");
        }
      }
    }

    void fetchEthPrice();

    const intervalId = window.setInterval(() => {
      void fetchEthPrice();
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  // Convert an ETH amount into an estimated USD value.
  function formatUsd(ethAmount: string) {
    if (ethUsdPrice === null) {
      return "Price unavailable";
    }

    const usdValue = Number(ethAmount) * ethUsdPrice;

    return usdValue.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  }

  async function readData(address?: string) {
    if (!window.ethereum) return;

    const provider = new BrowserProvider(window.ethereum);
    const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

    const totalWei = await contract.totalContributions();
    setTotal(formatEther(totalWei));

    const selected = address || account;

    if (selected) {
      const contributionWei = await contract.contributions(selected);
      setMyContribution(formatEther(contributionWei));
    }
      try {
    const events = await contract.queryFilter(
      contract.filters.ContributionReceived(),
      0,
      "latest"
    );

    const records: ContributionRecord[] = events
      .filter((event) => "args" in event)
      .map((event) => {
        const args = "args" in event ? event.args : undefined;

        return {
          contributor: String(args?.[0] ?? ""),
          amount: formatEther(args?.[1] ?? 0n),
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
        };
      })
      .sort((a, b) => b.blockNumber - a.blockNumber);

    setContributionHistory(records);
  } catch (error) {
    console.error("Could not load contribution history:", error);
  }
  }

  async function connectWallet() {
    try {
      if (!window.ethereum) {
        setStatus("MetaMask was not detected. Install MetaMask first.");
        return;
      }

      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!accounts.length) return;

      const chainId = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;

      if (chainId !== LOCAL_CHAIN_ID) {
        setStatus(
          "Switch MetaMask to the local Hardhat network first."
        );
        return;
      }

      setAccount(accounts[0]);
      await readData(accounts[0]);
      setStatus("Wallet connected to the local test network.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Wallet connection failed."
      );
    }
  }

  async function contribute() {
    try {
      if (!window.ethereum || !account) {
        setStatus("Connect your wallet first.");
        return;
      }

      if (
        !amount.trim() ||
        !Number.isFinite(Number(amount)) ||
        Number(amount) <= 0
      ) {
        setStatus("Enter a contribution greater than zero.");
        return;
      }

      setBusy(true);
      setStatus("Waiting for MetaMask approval...");

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const transaction = await contract.contribute({
        value: parseEther(amount),
      });

      setStatus(
        "Transaction submitted. Waiting for confirmation..."
      );

      await transaction.wait();
      await readData(account);

      setStatus(
        "Contribution confirmed on your local blockchain!"
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Contribution failed."
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!window.ethereum?.on) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];

      setAccount(accounts?.[0] || "");

      if (accounts?.[0]) {
        void readData(accounts[0]).catch(() => {
          setStatus("Could not refresh contribution data.");
        });
      } else {
        setMyContribution("0");
        setStatus("Wallet disconnected.");
      }
    };

    const onChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);

    return () => {
      window.ethereum?.removeListener?.(
        "accountsChanged",
        onAccountsChanged
      );
      window.ethereum?.removeListener?.(
        "chainChanged",
        onChainChanged
      );
    };
  }, [account]);

  const transactionCount = contributionHistory.length;

  const averageContribution =
    transactionCount > 0 ? Number(total) / transactionCount : 0;

  const recentContributions = contributionHistory.slice(0, 8);

  const maxContribution = Math.max(
    ...recentContributions.map((item) => Number(item.amount)),
    0
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">F</span>
          FundTracker
        </a>

        <button className="connect-button" onClick={connectWallet}>
          {account
            ? `${account.slice(0, 6)}...${account.slice(-4)}`
            : "Connect Wallet"}
        </button>
      </header>

      <section className="hero">
        <span className="eyebrow">
          DECENTRALIZED FUND TRACKER
        </span>

        <h1>
          Every contribution.
          <br />
          <span>On the record.</span>
        </h1>

        <p>
          Explore transparent contributions on your local blockchain.
          Connect a test wallet to get started.
        </p>

        <span className="network-pill">
          <span className="status-dot" />
          Local Hardhat Network
        </span>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-label">
            TOTAL CONTRIBUTIONS
          </span>

          <strong>
            {Number(total).toLocaleString(undefined, {
              maximumFractionDigits: 4,
            })}{" "}
            <small>ETH</small>
          </strong>

          <p>Combined amount received by the contract</p>

          <div className="detail-row">
            <span>Estimated value</span>
            <strong>{formatUsd(total)}</strong>
          </div>
        </article>

        <article className="stat-card">
          <span className="stat-label">
            YOUR CONTRIBUTION
          </span>

          <strong>
            {Number(myContribution).toLocaleString(undefined, {
              maximumFractionDigits: 4,
            })}{" "}
            <small>ETH</small>
          </strong>

          <p>
            {account
              ? "Recorded for your connected account"
              : "Connect a wallet to view your total"}
          </p>

          <div className="detail-row">
            <span>Estimated value</span>
            <strong>{formatUsd(myContribution)}</strong>
          </div>
        </article>

        <article className="stat-card">
          <span className="stat-label">LIVE ETH PRICE</span>

          <strong>
            {ethUsdPrice !== null
              ? ethUsdPrice.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 2,
                })
              : "--"}
          </strong>

          <p>
            {priceError ||
              (priceUpdatedAt
                ? `Updated ${priceUpdatedAt.toLocaleTimeString()}`
                : "Fetching market price...")}
          </p>

          <div className="detail-row">
            <span>Price source</span>
            <strong>CoinGecko</strong>
          </div>
        </article>
      </section>

      <section className="analytics-grid">
        <article className="panel analytics-summary">
          <span className="eyebrow">TRANSACTION ANALYTICS</span>
          <h2>Contribution overview</h2>

          <div className="detail-row">
            <span>Total transactions</span>
            <strong>{transactionCount}</strong>
          </div>

          <div className="detail-row">
            <span>Average contribution</span>
            <strong>
              {averageContribution.toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })} ETH
            </strong>
          </div>

          <div className="detail-row">
            <span>Average estimated value</span>
            <strong>
              {ethUsdPrice !== null
                ? (averageContribution * ethUsdPrice).toLocaleString(
                    "en-US",
                    {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 2,
                    }
                  )
                : "--"}
            </strong>
          </div>
        </article>

        <article className="panel contribution-chart">
          <span className="eyebrow">ON-CHAIN ACTIVITY</span>
          <h2>Recent contributions</h2>
          <p>Latest 8 contribution events</p>

          {recentContributions.length === 0 ? (
            <p className="hint">
              No contribution events yet. Make a test contribution to populate
              the chart.
            </p>
          ) : (
            <div className="chart-list">
              {recentContributions.map((item) => (
                <div className="chart-item" key={item.transactionHash}>
                  <div className="chart-item-header">
                    <span>
                      {item.contributor.slice(0, 6)}...
                      {item.contributor.slice(-4)}
                    </span>
                    <strong>
                      {Number(item.amount).toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })} ETH
                    </strong>
                  </div>

                  <div className="chart-track">
                    <div
                      className="chart-bar"
                      style={{
                        width: `${
                          maxContribution > 0
                            ? (Number(item.amount) / maxContribution) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <span className="chart-caption">
                    Block {item.blockNumber}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="content-grid">
        <article className="panel contribution-panel">
          <span className="eyebrow">
            MAKE A CONTRIBUTION
          </span>

          <h2>Put your test ETH to work.</h2>

          <p>
            This sends a transaction to the FundTracker smart contract.
          </p>

          <label htmlFor="amount">Contribution amount</label>

          <div className="amount-input">
            <input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.1"
            />
            <span>ETH</span>
          </div>

          <button
            className="submit-button"
            disabled={busy || !account}
            onClick={contribute}
          >
            {busy ? "Processing..." : "Contribute ETH"}
          </button>

          {!account && (
            <p className="hint">
              Connect your local test wallet to enable contributions.
            </p>
          )}

          <div className="status-message" role="status">
            {status}
          </div>
        </article>

        <article className="panel details-panel">
          <span className="eyebrow">CONTRACT DETAILS</span>

          <h2>Transparent by design.</h2>

          <div className="detail-row">
            <span>Network</span>
            <strong>Hardhat Local</strong>
          </div>

          <div className="detail-row">
            <span>Chain ID</span>
            <strong>31337</strong>
          </div>

          <div className="detail-row">
            <span>Contract</span>
            <strong className="address">
              {CONTRACT_ADDRESS.slice(0, 10)}...
              {CONTRACT_ADDRESS.slice(-8)}
            </strong>
          </div>

          <button
            className="copy-button"
            onClick={() =>
              void navigator.clipboard.writeText(CONTRACT_ADDRESS)
            }
          >
            Copy contract address
          </button>

          <p className="hint">
            Local demonstration only. Do not send real funds.
          </p>
        </article>
      </section>

      <footer>
        FundTracker · Educational dApp · Local test network only
      </footer>
    </main>
  );
}

export default App;
