import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import lodash from "lodash";

import chunkFetcher from "../utils/chunkFetcher.js";

import coinGeckoAPI from "../web2API/coingecko.js";
import geckoTerminalAPI from "../web2API/geckoTerminal.js";
import dexScreenerAPI from "../web2API/dexScreener.js";

const { chunk, uniq } = lodash;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const minCoinMarketCapValue = 500000;
const minLiquidityInPool = 100000;
const ethAddressMaxLength = 42;
const waitTimeMS = 1000 * 60 + 1000; // plus one more second, to be sure

const coinConditionCheck = (coin) => {
  const { current_price, market_cap, fully_diluted_valuation, circulating_supply, total_supply, max_supply } = coin;

  if (market_cap) {
    return market_cap > minCoinMarketCapValue;
  }

  if (current_price && circulating_supply) {
    const currentMCapManuallyCalculated = current_price * circulating_supply;
    return currentMCapManuallyCalculated > minCoinMarketCapValue;
  }

  if (fully_diluted_valuation) {
    return fully_diluted_valuation > minCoinMarketCapValue;
  }

  if (current_price && (total_supply || max_supply)) {
    const currentFDVManuallyCalculated = current_price * (total_supply || max_supply);
    return currentFDVManuallyCalculated > minCoinMarketCapValue;
  }

  return false;
};

// const allCoins = JSON.parse(fs.readFileSync(__dirname + "/allCoins.json", "utf8"));
// const ethMarkets = JSON.parse(fs.readFileSync(__dirname + "/ethMarketsStatic.json", "utf8"));

const getTokenContracts = async () => {
  try {
    console.log("Loading all coins...");
    const { data: allCoins } = await coinGeckoAPI.getCoins({ include_platform: true });
    fs.writeFile(__dirname + "/allCoins.json", JSON.stringify(allCoins), "utf8", () => {});

    console.log("All coins loaded. Processing data...");
    const ethereumCoinIds = allCoins.reduce(
      (memo, curr) => (curr.platforms.ethereum ? memo.concat(curr.id) : memo),
      []
    );
    const ethereumCoinIdChunks = chunk(ethereumCoinIds, coinGeckoAPI.maxPageSize).flatMap((idsArray) =>
      idsArray.join()
    );
    const ethereumCoinIdRequestChunks = chunk(ethereumCoinIdChunks, coinGeckoAPI.maxRequestsPerTime);

    console.log("Loading markets...");
    const marketsResponse = await chunkFetcher({
      chunks: ethereumCoinIdRequestChunks,
      chunkName: "Market",
      chunkFetcher: (ids) =>
        coinGeckoAPI.getMarkets({
          vs_currency: "usd",
          ids,
          order: "id_asc",
          per_page: coinGeckoAPI.maxPageSize,
          page: 1,
        }),
      waitTimeMS,
    });

    console.log("All markets loaded. Processing data...");
    const ethMarkets = marketsResponse.flatMap(({ data }) =>
      data.reduce((memo, item) => {
        const coin = allCoins.find((c) => c.id === item.id);
        const result = {
          ...item,
          contractAddress: coin.platforms.ethereum,
        };

        if (coinConditionCheck(result)) {
          return memo.concat(result);
        }

        return memo;
      }, [])
    );
    fs.writeFile(__dirname + "/ethMarketsStatic.json", JSON.stringify(ethMarkets), "utf8", () => {});
    console.log(`All ${ethMarkets.length} markets, filtered by MCap or FDV (whatever exists), are ready to use.`);

    const ethMarketRequestChunks = chunk(ethMarkets, geckoTerminalAPI.maxRequestsPerTime);
    const geckoTerminalPoolIndex = 0;
    const dexScreenerPoolIndex = 1;

    console.log("Loading pools...");
    const poolsResponses = await Promise.all([
      chunkFetcher({
        chunks: ethMarketRequestChunks,
        chunkName: "GeckoTerminalPool",
        chunkFetcher: (market) => geckoTerminalAPI.getSearch({ query: market.contractAddress }),
        waitTimeMS,
      }),
      chunkFetcher({
        chunks: ethMarketRequestChunks,
        chunkName: "DexScreenerPool",
        chunkFetcher: (market) => dexScreenerAPI.getTokenById(market.contractAddress),
        waitTimeMS,
      }),
    ]);
    const ethPools = {};

    console.log("All pools loaded. Processing data...");
    poolsResponses[geckoTerminalPoolIndex].flat().forEach(({ response, contractAddress }) => {
      const pools = geckoTerminalAPI.poolsResolver(response.data) || [];
      const poolsFormatted = pools.reduce((memo, curr) => {
        if (curr?.reserve_in_usd >= minLiquidityInPool) {
          return memo.concat(curr.address.slice(0, ethAddressMaxLength));
        }

        return memo;
      }, []);

      if (poolsFormatted.length !== 0) {
        ethPools[contractAddress] = poolsFormatted;
      }
    });
    poolsResponses[dexScreenerPoolIndex].flat().forEach(({ response, contractAddress }) => {
      const existingPools = ethPools[contractAddress];
      const newPools = dexScreenerAPI.poolsResolver(response.data) || [];
      const newPoolsFormatted = newPools.reduce((memo, curr) => {
        if (curr?.liquidity?.usd >= minLiquidityInPool) {
          return memo.concat(curr.pairAddress.toLowerCase().slice(0, ethAddressMaxLength));
        }

        return memo;
      }, []);
      const pools = uniq(existingPools?.length ? existingPools.concat(newPoolsFormatted) : newPoolsFormatted);

      if (pools.length !== 0) {
        ethPools[contractAddress] = pools;
      }
    });

    fs.writeFile(__dirname + "/ethPools.json", JSON.stringify(ethPools), "utf8", () => {});
    console.log(
      `All ${Object.values(ethPools).flat().length} pools for ${
        Object.keys(ethPools).length
      } tokens found and ready to use.`
    );
  } catch (e) {
    console.log(e);
  }
};

export default getTokenContracts;
