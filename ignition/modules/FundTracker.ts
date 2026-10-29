
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const FundTrackerModule = buildModule("FundTrackerModule", (m) => {
  const fundTracker = m.contract("FundTracker");

  return { fundTracker };
});

export default FundTrackerModule;
