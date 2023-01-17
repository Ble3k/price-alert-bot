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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const notifyRequestMap = {};

class UniV2Contract {
  static ABI = uniV2ABI;
  static events = extractEventsWithHashes(uniV2ABI);

  #httpsProvider;
  #address;
  #discord;
  #eventsDecoded = {};

  constructor({ httpsProvider, discord, address, data, topics, event, store }) {
    this.#address = address;
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
    const contract = new ethers.Contract(this.#address, UniV2Contract.ABI, this.#httpsProvider);
    const [reserve0, reserve1] = await contract.getReserves();

    const { inputs } = this.#eventsDecoded[eventName];
    const eventValues = inputs.reduce((memo, curr) => ({ ...memo, [curr.name]: curr.value }), {});
    const { amount0In, amount0Out, amount1In, amount1Out } = eventValues;

    const baseAmount = {
      current: reserve0.toString(),
      prev: reserve0.add(amount0In).sub(amount0Out).toString(),
    };
    const quoteAmount = {
      current: reserve1.toString(),
      prev: reserve1.add(amount1In).sub(amount1Out).toString(),
    };

    const doNotify = async (percentageChanged) => {
      try {
        const ethPools = JSON.parse(
          fs.readFileSync(path.join(__dirname, "../..", "getTokenContractsByChain", "ethPools.json"), "utf8")
        );
        const baseAddress = await contract.token0();
        const baseContract = new ERC20Contract({ httpsProvider: this.#httpsProvider, address: baseAddress });
        await baseContract.getTokenInfo();
        const { symbol: baseSymbol, decimals: baseDecimal } = baseContract;
        const quoteAddress = await contract.token1();
        const quoteContract = new ERC20Contract({ httpsProvider: this.#httpsProvider, address: quoteAddress });
        await quoteContract.getTokenInfo();
        const { symbol: quoteSymbol, decimals: quoteDecimal } = quoteContract;

        const baseAmount = new Big(ethers.utils.formatUnits(reserve0, baseDecimal));
        const quoteAmount = new Big(ethers.utils.formatUnits(reserve1, quoteDecimal));
        const currentPrice = quoteAmount.div(baseAmount);

        const morePools = ethPools[baseAddress.toLowerCase()].filter((a) => a !== this.#address.toLowerCase());
        let poolsMessagePart = `${baseSymbol} is trading only in 1 pool`;

        if (morePools.length !== 0) {
          const poolsString = morePools.reduce((memo, curr) => (memo ? `${memo}\n*${curr}*` : `*${curr}*`), "");
          poolsMessagePart = `${baseSymbol} is also trading in:\n\n${poolsString}`;
        }

        const message = `**${baseSymbol}/${quoteSymbol}**\n\nPrice changed in pool ${
          this.#address
        } on ***${percentageChanged}%*** for the last 10 minutes.\nCurrent price: ***${currentPrice.toFixed(
          quoteDecimal
        )} ${quoteSymbol}***.\n${poolsMessagePart}`;

        this.#discord.notify(message);
      } catch (e) {
        inspect(`Failed to notify on ${this.#address}, trying again...`);
        await wait(3000);
        return await doNotify(percentageChanged);
      }
    };

    const notify = async (percentageChanged) => {
      const notifyRequestKey = `${this.#address}_${percentageChanged}`;
      if (!notifyRequestMap[notifyRequestKey]) {
        notifyRequestMap[notifyRequestKey] = true;
        await doNotify(percentageChanged);
      }
    };

    store.set({
      address: this.#address,
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
  };
}

export default UniV2Contract;
