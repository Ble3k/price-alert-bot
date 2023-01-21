import { ethers } from "ethers";
import Big from "big.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

import uniV2ABI from "./ABI.js";

import ERC20Contract from "../erc20/index.js";
import { extractEventsWithHashes, decodeEventValues } from "../../utils/contract.js";
import wait from "../../utils/wait.js";
import { WAIT_PER_REQUEST_TIME } from "../../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const notifyRequestMap = {};
const wETHAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

class UniV2Contract {
  static ABI = uniV2ABI;
  static events = extractEventsWithHashes(uniV2ABI);

  #httpsProvider;
  #address;
  #discord;
  #eventsDecoded = {};
  #baseAddress;
  #quoteAddress;
  #reserve0;
  #reserve1;
  #isWETHBase;

  constructor({ httpsProvider, discord, address, data, topics, event, store }) {
    this.#address = address.toLowerCase();
    this.#httpsProvider = httpsProvider;
    this.#discord = discord;

    try {
      this.#eventsDecoded[event.name] = decodeEventValues({ event, data, topics });

      this.checkReserves({ eventName: event.name, store });
    } catch (e) {
      inspect(e);
    }
  }

  checkReserves = async ({ eventName, store }) => {
    try {
      const contract = new ethers.Contract(this.#address, UniV2Contract.ABI, this.#httpsProvider);
      const [reserve0, reserve1] = await contract.getReserves();
      this.#reserve0 = reserve0;
      this.#reserve1 = reserve1;
      this.#baseAddress = (await contract.token0()).toLowerCase();
      this.#quoteAddress = (await contract.token1()).toLowerCase();
      this.#isWETHBase = this.#baseAddress === wETHAddress;

      const { inputs } = this.#eventsDecoded[eventName];
      const eventValues = inputs.reduce((memo, curr) => ({ ...memo, [curr.name]: curr.value }), {});
      const { amount0In, amount0Out, amount1In, amount1Out } = eventValues;

      const baseAmount = {
        current: this.#reserve0.toString(),
        prev: this.#reserve0.add(amount0In).sub(amount0Out).toString(),
      };
      const quoteAmount = {
        current: this.#reserve1.toString(),
        prev: this.#reserve1.add(amount1In).sub(amount1Out).toString(),
      };

      const notify = async (percentageChanged) => {
        if (!notifyRequestMap[this.#address]) {
          notifyRequestMap[this.#address] = true;
          await this.doNotify(percentageChanged);
          notifyRequestMap[this.#address] = false;
        }
      };

      inspect(`${eventName} - ${this.#address}`);
      store.set({
        address: this.#address,
        baseAddress: this.#isWETHBase ? this.#quoteAddress : this.#baseAddress,
        value: {
          base: baseAmount.current,
          quote: quoteAmount.current,
        },
        prevValue: {
          base: baseAmount.prev,
          quote: quoteAmount.prev,
        },
        notifyCallback: notify,
      });
    } catch (e) {
      inspect(e);
    }
  };

  doNotify = async (percentageChanged) => {
    try {
      const ethPools = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../..", "getTokenContractsByChain", "ethPools.json"), "utf8")
      );

      const baseContract = new ERC20Contract({ httpsProvider: this.#httpsProvider, address: this.#baseAddress });
      await baseContract.getTokenInfo();
      const { symbol: baseSymbol, decimals: baseDecimal } = baseContract;
      const quoteContract = new ERC20Contract({ httpsProvider: this.#httpsProvider, address: this.#quoteAddress });
      await quoteContract.getTokenInfo();
      const { symbol: quoteSymbol, decimals: quoteDecimal } = quoteContract;

      const baseAmount = new Big(ethers.utils.formatUnits(this.#reserve0, baseDecimal));
      const quoteAmount = new Big(ethers.utils.formatUnits(this.#reserve1, quoteDecimal));
      const currentPrice = quoteAmount.div(baseAmount);
      const baseMarkets = ethPools[this.#isWETHBase ? this.#quoteAddress : this.#baseAddress];

      const currentPool = baseMarkets.pools.find((p) => p.address === this.#address);
      const morePools = baseMarkets.pools.filter((p) => p.address !== this.#address);
      let poolsMessagePart = `${this.#isWETHBase ? quoteSymbol : baseSymbol} is trading only in 1 pool`;

      if (morePools.length !== 0) {
        const poolsString = morePools.reduce((memo, curr) => {
          const { address, dex, tokens } = curr;
          const [base, quote] = tokens;
          const message = `${base}/${quote} - *${address}* - ${dex}`;

          return memo ? `${memo}\n${message}` : `${message}`;
        }, "");
        poolsMessagePart = `${this.isWETHBase ? quoteSymbol : baseSymbol} is also trading in:\n\n${poolsString}`;
      }

      const message = `**${baseSymbol}/${quoteSymbol}**\n\nPrice changed in pool ${this.#address} (${
        currentPool.dex
      }) on ***${percentageChanged}%*** for the last 10 minutes.\nCurrent price: ***${currentPrice.toFixed(
        quoteDecimal
      )} ${quoteSymbol}***.\n${poolsMessagePart}\n\n=============================================================`;

      return this.#discord.notify(message);
    } catch (e) {
      inspect(`Failed to notify on ${this.#address}, trying again...`);
      await wait(WAIT_PER_REQUEST_TIME);
      return await this.doNotify(percentageChanged);
    }
  };
}

export default UniV2Contract;
