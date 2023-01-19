import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import lodash from "lodash";

import chunkFetcher from "../utils/chunkFetcher.js";
import {
  REQUEST_TRY_AGAIN_TIME,
  MIN_COIN_MARKET_CAP,
  MIN_LIQUIDITY_IN_POOL,
  ETH_ADDRESS_MAX_LENGTH,
} from "../config.js";
console.log(REQUEST_TRY_AGAIN_TIME);

import coinGeckoAPI from "../web2API/coingecko.js";
import geckoTerminalAPI from "../web2API/geckoTerminal.js";
import dexScreenerAPI from "../web2API/dexScreener.js";

const { chunk, uniqBy } = lodash;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const calculateMarketCap = (coin) => {
  const { current_price, market_cap, fully_diluted_valuation, circulating_supply, total_supply, max_supply } = coin;

  if (market_cap) {
    return market_cap;
  }

  if (current_price && circulating_supply) {
    return current_price * circulating_supply;
  }

  if (fully_diluted_valuation) {
    return fully_diluted_valuation;
  }

  if (current_price && (total_supply || max_supply)) {
    return current_price * (total_supply || max_supply);
  }

  return false;
};

const getTokenContracts = async () => {
  try {
    console.log("Loading all coins...");
    const { data: allCoins } = await coinGeckoAPI.getCoins({ include_platform: true });

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
      REQUEST_TRY_AGAIN_TIME,
    });

    console.log("All markets loaded. Processing data...");
    const ethMarkets = marketsResponse.flatMap(({ data }) =>
      data.reduce((memo, item) => {
        const coin = allCoins.find((c) => c.id === item.id);
        const result = {
          ...item,
          marketCap: calculateMarketCap(item),
          contractAddress: coin.platforms.ethereum.toLowerCase(),
        };

        if (result.marketCap > MIN_COIN_MARKET_CAP) {
          return memo.concat(result);
        }

        return memo;
      }, [])
    );
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
        REQUEST_TRY_AGAIN_TIME,
      }),
      chunkFetcher({
        chunks: ethMarketRequestChunks,
        chunkName: "DexScreenerPool",
        chunkFetcher: (market) => dexScreenerAPI.getTokenById(market.contractAddress),
        REQUEST_TRY_AGAIN_TIME,
      }),
    ]);
    const ethPools = {};

    console.log("All pools loaded. Processing data...");
    poolsResponses[geckoTerminalPoolIndex].flat().forEach(({ response, contractAddress }) => {
      const pools = geckoTerminalAPI.poolsResolver(response.data) || [];
      const poolsFormatted = pools.reduce((memo, curr) => {
        if (curr?.reserve_in_usd >= MIN_LIQUIDITY_IN_POOL) {
          return memo.concat({
            address: curr.address.toLowerCase().slice(0, ETH_ADDRESS_MAX_LENGTH),
            dex: curr.dex.identifier,
            tokens: curr.tokens.reduce((memo, curr) => {
              memo[curr.is_base_token ? 0 : 1] = curr.symbol;
              return memo;
            }, []),
          });
        }

        return memo;
      }, []);

      if (poolsFormatted.length !== 0) {
        ethPools[contractAddress] = {
          pools: poolsFormatted,
          marketCap: ethMarkets.find((m) => m.contractAddress === contractAddress).marketCap,
        };
      }
    });
    poolsResponses[dexScreenerPoolIndex].flat().forEach(({ response, contractAddress }) => {
      const existingPools = ethPools[contractAddress]?.pools;
      const newPools = dexScreenerAPI.poolsResolver(response.data) || [];
      const newPoolsFormatted = newPools.reduce((memo, curr) => {
        if (curr?.liquidity?.usd >= MIN_LIQUIDITY_IN_POOL) {
          return memo.concat({
            address: curr.pairAddress.toLowerCase().slice(0, ETH_ADDRESS_MAX_LENGTH),
            dex: curr.dexId,
            tokens: [curr.baseToken.symbol, curr.quoteToken.symbol],
          });
        }

        return memo;
      }, []);
      const pools = uniqBy(
        existingPools?.length ? existingPools.concat(newPoolsFormatted) : newPoolsFormatted,
        "address"
      );

      if (pools.length !== 0) {
        ethPools[contractAddress] = { ...ethPools[contractAddress], pools };
      }
    });

    fs.writeFile(__dirname + "/ethPools.json", JSON.stringify(ethPools), "utf8", () => {});
    console.log(
      `All ${Object.values(ethPools).flatMap((item) => item.pools).length} pools for ${
        Object.keys(ethPools).length
      } tokens found and ready to use.`
    );
  } catch (e) {
    console.log(e);
  }
};

export default getTokenContracts;
