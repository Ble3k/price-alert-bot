import { MARKET_CAP_PRICE_CHANGE_TRIGGER, MAX_PRICE_DIFF_VALUES_TO_STORE } from "../config.js";

const percentageChangeByMCap = ({ address, ethPools }) => {
  const pool = ethPools.find((p) => p.tokens.some((t) => t.address === address));
  const token = pool.tokens.find((t) => t.address === address);
  const { marketCap } = token;

  if (marketCap <= MARKET_CAP_PRICE_CHANGE_TRIGGER.LOW.MCAP) {
    return MARKET_CAP_PRICE_CHANGE_TRIGGER.LOW.PERCENT;
  }

  if (marketCap <= MARKET_CAP_PRICE_CHANGE_TRIGGER.MEDIUM.MCAP) {
    return MARKET_CAP_PRICE_CHANGE_TRIGGER.MEDIUM.PERCENT;
  }

  return MARKET_CAP_PRICE_CHANGE_TRIGGER.DEFAULT.PERCENT;
};

class Store {
  prices = {};

  set = ({ address, baseAddress, ethPools, value, prevValue, notifyCallback }) => {
    if (!this.prices[address]) {
      this.prices[address] = [prevValue, value];
    } else {
      this.prices[address] = [...this.prices[address].slice(-MAX_PRICE_DIFF_VALUES_TO_STORE), value];
    }

    this.checkPercentage({ address, baseAddress, ethPools, value, notifyCallback });
  };

  checkPercentage = ({ address, baseAddress, ethPools, value, notifyCallback }) => {
    let maxAbsValue = Number.NEGATIVE_INFINITY;
    let maxValue;
    const valueDiffs = this.prices[address].reduce((memo, curr) => {
      const pricePercentChanged = value.div(curr).times(100).minus(100).toNumber();

      if (pricePercentChanged !== 0) return memo.concat(pricePercentChanged);

      return memo;
    }, []);

    for (let i = 0; i < valueDiffs.length; i++) {
      if (Math.abs(valueDiffs[i]) > maxAbsValue) {
        maxAbsValue = Math.abs(valueDiffs[i]);
        maxValue = valueDiffs[i];
      }
    }

    inspect(`Base: ${baseAddress}, valueDiffs:`);
    inspect(valueDiffs);
    const targetPercentage = percentageChangeByMCap({ address: baseAddress, ethPools });
    inspect(`Target P: ${targetPercentage}%`);
    inspect("-----------------------------------------------------------");

    if (Math.abs(maxValue) >= targetPercentage) {
      delete this.prices[address];
      notifyCallback({ value, percentChanged: maxValue });
    }
  };
}

export default Store;
