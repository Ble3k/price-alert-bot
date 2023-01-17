import { calcPercentChanged } from "../utils/math.js";

class Store {
  prices = {};

  set = ({ address, value, prevValue, notifyCallback }) => {
    if (!this.prices[address]) {
      this.prices[address] = [prevValue, value];
    } else {
      this.prices[address] =
        this.prices[address].length <= 100
          ? this.prices[address].concat(value)
          : this.prices[address].slice(1).concat(value);
    }

    this.checkPercentage({ address, value, notifyCallback });
  };

  checkPercentage = ({ address, value, notifyCallback }) => {
    const valueDiffs = [];

    for (let index in this.prices[address]) {
      const prevAmount = this.prices[address][index];
      const basePercentChanged = calcPercentChanged(prevAmount.base, value.base);
      const quotePercentChanged = calcPercentChanged(prevAmount.quote, value.quote);
      const pricePercentChanged = (Math.abs(basePercentChanged) + Math.abs(quotePercentChanged)).toFixed(5);

      if (+pricePercentChanged !== 0) valueDiffs.push(pricePercentChanged);
    }

    const maxPercentageBetweenSwaps = Math.max(...valueDiffs);
    inspect(`${address} valueDiffs:`);
    inspect(valueDiffs);
    inspect("-----------------------------------------------------------");

    if (maxPercentageBetweenSwaps >= 10) {
      this.prices[address] = undefined;
      notifyCallback(maxPercentageBetweenSwaps);
    }
  };
}

export default Store;
