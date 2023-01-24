import { ethers } from "ethers";
import Big from "big.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

import uniV2ABI from "./ABI.js";

import { extractEventsWithHashes, decodeEventValues } from "../../utils/contract.js";
import { doRequestSafeRepeat } from "../../utils/fetcher.js";
import { wETH, wBTC } from "../../constants.js";
import { WAIT_PER_REQUEST_TIME, MAX_PRICE_DIFF_VALUES_TO_STORE } from "../../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const notifyRequestMap = {};
const { formatUnits } = ethers.utils;

class UniV2Contract {
  static ABI = uniV2ABI;
  static events = extractEventsWithHashes(uniV2ABI);

  #httpsProvider;
  #address;
  #poolInfo;
  #discord;
  #eventsDecoded = {};
  #contract;
  #base;
  #quote;
  #isPairInverted;

  constructor({ httpsProvider, discord, address, ethPools, poolInfo, data, topics, event, store }) {
    this.#address = address;
    this.#poolInfo = poolInfo;
    this.#httpsProvider = httpsProvider;
    this.#discord = discord;
    this.#contract = new ethers.Contract(this.#address, UniV2Contract.ABI, this.#httpsProvider);

    try {
      this.#eventsDecoded[event.name] = decodeEventValues({ event, data, topics });

      this.checkReserves({ eventName: event.name, store, ethPools });
    } catch (e) {
      inspect(e);
    }
  }

  checkReserves = async ({ eventName, store, ethPools }) => {
    try {
      const ethStableCoins = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../..", "getTokenContractsByChain", "ethStableCoins.json"), "utf8")
      );
      const baseAddress = (await this.#contract.token0()).toLowerCase();
      const quoteAddress = (await this.#contract.token1()).toLowerCase();
      const [baseAmount, quoteAmount] = await this.#contract.getReserves();
      this.#base = this.#poolInfo.tokens.find((t) => t.address === baseAddress);
      this.#quote = this.#poolInfo.tokens.find((t) => t.address === quoteAddress);
      const isWETHBase = this.#base.address === wETH;
      const isWBTCBase = this.#base.address === wBTC;
      const isStableBase = ethStableCoins.some((sc) => sc.address === this.#base.address);
      const isStableQuote = ethStableCoins.some((sc) => sc.address === this.#quote.address);
      this.#isPairInverted = ((isWETHBase || isWBTCBase) && !isStableQuote) || (isStableBase && !isStableBase);
      const currentBaseAmount = new Big(formatUnits(baseAmount, this.#base.decimals));
      const currentQuoteAmount = new Big(formatUnits(quoteAmount, this.#quote.decimals));
      const currentPrice = this.#isPairInverted
        ? currentBaseAmount.div(currentQuoteAmount)
        : currentQuoteAmount.div(currentBaseAmount);

      const { inputs } = this.#eventsDecoded[eventName];
      const eventValues = inputs.reduce((memo, curr) => ({ ...memo, [curr.name]: curr.value }), {});
      const { amount0In, amount0Out, amount1In, amount1Out } = eventValues;
      const baseIn = new Big(formatUnits(amount0In, this.#base.decimals));
      const baseOut = new Big(formatUnits(amount0Out, this.#base.decimals));
      const quoteIn = new Big(formatUnits(amount1In, this.#quote.decimals));
      const quoteOut = new Big(formatUnits(amount1Out, this.#quote.decimals));

      const prevBaseAmount = currentBaseAmount.plus(baseIn).minus(baseOut);
      const prevQuoteAmount = currentQuoteAmount.plus(quoteIn).minus(quoteOut);
      const prevPrice = this.#isPairInverted
        ? prevBaseAmount.div(prevQuoteAmount)
        : prevQuoteAmount.div(prevBaseAmount);

      const notify = async ({ value, prevValue, percentChanged }) => {
        if (!notifyRequestMap[this.#address]) {
          notifyRequestMap[this.#address] = true;
          await this.doNotify({ value, prevValue, percentChanged, eventName, ethStableCoins, ethPools });
          delete notifyRequestMap[this.#address];
        }
      };

      inspect(`${eventName} - ${this.#address}`);
      store.set({
        address: this.#address,
        baseAddress: this.#isPairInverted ? this.#quote.address : this.#base.address,
        ethPools,
        value: currentPrice,
        prevValue: prevPrice,
        notifyCallback: notify,
      });
    } catch (e) {
      inspect(e);
    }
  };

  doNotify = async ({ value, percentChanged, eventName, ethStableCoins, ethPools }) => {
    const request = () => {
      const priceSymbol = this.#isPairInverted ? this.#base.symbol : this.#quote.symbol;
      const priceDecimals = this.#isPairInverted ? this.#base.decimals : this.#quote.decimals;
      const morePoolsForAddress = this.#isPairInverted ? this.#quote.address : this.#base.address;
      const morePoolsForSymbol = this.#isPairInverted ? this.#quote.symbol : this.#base.symbol;
      const poolName = `${this.#base.symbol}/${this.#quote.symbol}${this.#isPairInverted ? " (Inverted)" : ""}`;
      let poolsMessagePart = `${morePoolsForSymbol} is trading on in 1 pool`;

      if (morePoolsForAddress !== wETH && !ethStableCoins.some((sc) => sc.address === morePoolsForAddress)) {
        const morePools = ethPools.filter(
          (p) => p.address !== this.#address && p.tokens.some((t) => t.address === morePoolsForAddress)
        );

        if (morePools.length !== 0) {
          poolsMessagePart = `${morePoolsForSymbol} is also trading in:\n\n`;
          morePools.forEach(
            ({ link, dex, tokens }) =>
              (poolsMessagePart = `${poolsMessagePart}${tokens[0].symbol}/${tokens[1].symbol} - ${link} (${dex})\n`)
          );
        }
      }
      const message = `${eventName} in **${poolName}**\n\nPrice changed in ${this.#poolInfo.link} (${
        this.#poolInfo.dex
      }) on ***${percentChanged.toFixed(
        2
      )}%*** for the last ${MAX_PRICE_DIFF_VALUES_TO_STORE} swaps.\nCurrent price: ***${value.toFixed(
        priceDecimals
      )} ${priceSymbol}***\n${poolsMessagePart}\n\n=============================================================`;

      return this.#discord.notify(message);
    };

    await doRequestSafeRepeat({
      request,
      onFailedMessaged: `Failed to notify on ${this.#address}, trying again...`,
      waitTimeMS: WAIT_PER_REQUEST_TIME,
    });
  };
}

export default UniV2Contract;
