import { calcPercentChanged } from "../utils/math.js";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import { MARKET_CAP_PRICE_CHANGE_TRIGGER, MAX_PRICE_DIFF_VALUES_TO_STORE } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const percentageChangeByMCap = (address) => {
  const ethPools = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "getTokenContractsByChain", "ethPools.json"), "utf8")
  );
  const { marketCap } = ethPools[address];

  if (marketCap <= MARKET_CAP_PRICE_CHANGE_TRIGGER.LOW.MCAP) {
    return MARKET_CAP_PRICE_CHANGE_TRIGGER.LOW.PERCENT;
  }

  if (marketCap <= MARKET_CAP_PRICE_CHANGE_TRIGGER.MEDIUM.MCAP) {
    return MARKET_CAP_PRICE_CHANGE_TRIGGER.MEDIUM.PERCENT;
  }

  if (marketCap <= MARKET_CAP_PRICE_CHANGE_TRIGGER.HIGH.MCAP) {
    return MARKET_CAP_PRICE_CHANGE_TRIGGER.HIGH.PERCENT;
  }

  return MARKET_CAP_PRICE_CHANGE_TRIGGER.DEFAULT.PERCENT;
};

class Store {
  prices = {};

  set = ({ address, baseAddress, value, prevValue, notifyCallback }) => {
    if (!this.prices[address]) {
      this.prices[address] = [prevValue, value];
    } else {
      // Only keep the last 100 prices
      this.prices[address] = [...this.prices[address].slice(-MAX_PRICE_DIFF_VALUES_TO_STORE), value];
    }

    this.checkPercentage({ address, baseAddress, value, notifyCallback });
  };

  checkPercentage = ({ address, baseAddress, value, notifyCallback }) => {
    const valueDiffs = this.prices[address].reduce((memo, curr) => {
      const basePercentChanged = calcPercentChanged(curr.base, value.base);
      const quotePercentChanged = calcPercentChanged(curr.quote, value.quote);
      const pricePercentChanged = (Math.abs(basePercentChanged) + Math.abs(quotePercentChanged)).toFixed(5);

      if (+pricePercentChanged !== 0) return memo.concat(pricePercentChanged);

      return memo;
    }, []);

    const maxPercentageBetweenSwaps = Math.max(...valueDiffs);
    inspect(`Pool: ${address}, Base: ${baseAddress}, valueDiffs:`);
    inspect(valueDiffs);
    inspect(`Target P: ${percentageChangeByMCap(baseAddress)}`);
    inspect("-----------------------------------------------------------");

    if (maxPercentageBetweenSwaps >= percentageChangeByMCap(baseAddress)) {
      this.prices[address] = undefined;
      notifyCallback(maxPercentageBetweenSwaps);
    }
  };
}

export default Store;
