import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import lodash from "lodash";

import { chunkFetcher } from "../utils/fetcher.js";
import {
  REQUEST_TRY_AGAIN_TIME,
  MIN_COIN_MARKET_CAP,
  MIN_LIQUIDITY_IN_POOL,
  ETH_ADDRESS_MAX_LENGTH,
} from "../config.js";

import coinGeckoAPI from "../web2API/coingecko.js";
import geckoTerminalAPI from "../web2API/geckoTerminal.js";
import dexScreenerAPI from "../web2API/dexScreener.js";

import ERC20Contract from "../contracts/erc20/index.js";

const { chunk } = lodash;

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

const getTokenContracts = async (httpsProvider) => {
  try {
    inspect("Loading all coins...");
    const { data: allCoins } = await coinGeckoAPI.getCoins({ include_platform: true });
    const { data: allStableCoins } = await coinGeckoAPI.getMarkets({
      vs_currency: "usd",
      category: "stablecoins",
      order: "id_asc",
      per_page: coinGeckoAPI.maxPageSize,
      page: 1,
    });
    const ethStableCoins = allStableCoins.reduce((memo, curr) => {
      const coin = allCoins.find((c) => c.id === curr.id);

      if (coin.platforms.ethereum) {
        return memo.concat({
          name: curr.name,
          symbol: curr.symbol.toUpperCase(),
          address: coin.platforms.ethereum.toLowerCase(),
          marketCap: calculateMarketCap(curr),
        });
      }

      return memo;
    }, []);
    fs.writeFile(__dirname + "/ethStableCoins.json", JSON.stringify(ethStableCoins), "utf8", () => {});

    inspect("All coins loaded. Processing data...");
    const ethereumCoinIds = allCoins.reduce(
      (memo, curr) => (curr.platforms.ethereum ? memo.concat(curr.id) : memo),
      []
    );
    const ethereumCoinIdChunks = chunk(ethereumCoinIds, coinGeckoAPI.maxPageSize).flatMap((idsArray) =>
      idsArray.join()
    );
    const ethereumCoinIdRequestChunks = chunk(ethereumCoinIdChunks, coinGeckoAPI.maxRequestsPerTime);

    inspect("Loading markets...");
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
      waitTimeMS: REQUEST_TRY_AGAIN_TIME,
    });

    inspect("All markets loaded. Processing data...");
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
    inspect(`All ${ethMarkets.length} markets, filtered by MCap or FDV (whatever exists), are ready to use.`);

    const ethMarketRequestChunks = chunk(ethMarkets, geckoTerminalAPI.maxRequestsPerTime);
    const dexScreenerPoolIndex = 0;
    const geckoTerminalPoolIndex = 1;

    inspect("Loading pools...");
    const poolsResponses = await Promise.all([
      chunkFetcher({
        chunks: ethMarketRequestChunks,
        chunkName: "DexScreenerPool",
        chunkFetcher: (market) => dexScreenerAPI.getTokenById(market.contractAddress),
        waitTimeMS: REQUEST_TRY_AGAIN_TIME,
      }),
      chunkFetcher({
        chunks: ethMarketRequestChunks,
        chunkName: "GeckoTerminalPool",
        chunkFetcher: (market) => geckoTerminalAPI.getSearch({ query: market.contractAddress }),
        waitTimeMS: REQUEST_TRY_AGAIN_TIME,
      }),
    ]);
    const ethPools = [];

    inspect("All pools loaded. Processing data...");
    const dexScreenerResponse = poolsResponses[dexScreenerPoolIndex].flat();
    let dsResponseIndex = 0;
    for (const { response } of dexScreenerResponse) {
      dsResponseIndex++;
      const dsPools = (dexScreenerAPI.poolsResolver(response.data) || []).filter((p) => p.chainId === "ethereum");

      let dsPoolIndex = 0;
      for (const pool of dsPools) {
        dsPoolIndex++;
        const dsPoolAddress = pool.pairAddress.toLowerCase().slice(0, ETH_ADDRESS_MAX_LENGTH);
        const { baseToken, quoteToken } = pool;
        const baseInfo = ethMarkets.find((m) => m.contractAddress === baseToken.address.toLowerCase());
        const quoteInfo = ethMarkets.find((m) => m.contractAddress === quoteToken.address.toLowerCase());

        if (
          !ethPools.some((ep) => ep.address === dsPoolAddress) &&
          baseInfo &&
          quoteInfo &&
          pool?.liquidity?.usd >= MIN_LIQUIDITY_IN_POOL
        ) {
          inspect(
            `Processing: ${dsPoolAddress} DS pool ${dsPoolIndex}/${dsPools.length} of ${dsResponseIndex}/${dexScreenerResponse.length}`
          );
          const baseContract = new ERC20Contract({ httpsProvider, address: baseToken.address });
          const quoteContract = new ERC20Contract({ httpsProvider, address: quoteToken.address });
          await baseContract.getDecimals();
          await quoteContract.getDecimals();

          ethPools.push({
            address: dsPoolAddress,
            link: `${dexScreenerAPI.ethPoolsLink(pool.chainId)}/${pool.pairAddress}`,
            dex: pool.dexId,
            tokens: [
              {
                name: baseToken.name,
                symbol: baseToken.symbol.toUpperCase(),
                address: baseToken.address.toLowerCase(),
                marketCap: baseInfo?.marketCap,
                decimals: baseContract.decimals,
              },
              {
                name: quoteToken.name,
                symbol: quoteToken.symbol.toUpperCase(),
                address: quoteToken.address.toLowerCase(),
                marketCap: quoteInfo?.marketCap,
                decimals: quoteContract.decimals,
              },
            ],
          });
        }
      }
    }

    const geckoTerminalResponse = poolsResponses[geckoTerminalPoolIndex].flat();
    let geckoTerminalResponseIndex = 0;
    for (const { response } of geckoTerminalResponse) {
      geckoTerminalResponseIndex++;
      const gtPools = (geckoTerminalAPI.poolsResolver(response.data) || []).filter(
        (p) => p.network.identifier === "eth"
      );

      let gtPoolIndex = 0;
      for (const pool of gtPools) {
        gtPoolIndex++;
        const gtPoolAddress = pool.address.toLowerCase().slice(0, ETH_ADDRESS_MAX_LENGTH);
        const baseToken = pool.tokens.find((t) => t.is_base_token);
        const quoteTokens = pool.tokens.filter((t) => !t.is_base_token);
        const baseTokenInfo = ethMarkets.find((m) => m.symbol.toLowerCase() === baseToken.symbol.toLowerCase());
        const quoteTokensInfo = ethMarkets.filter(
          (m) => !!quoteTokens.find((qt) => m.symbol.toLowerCase() === qt.symbol.toLowerCase())
        );

        if (
          !ethPools.some((ep) => ep.address === gtPoolAddress) &&
          baseTokenInfo &&
          quoteTokensInfo.length &&
          pool?.reserve_in_usd >= MIN_LIQUIDITY_IN_POOL
        ) {
          inspect(
            `Processing: ${gtPoolAddress} GT pool ${gtPoolIndex}/${gtPools.length} of ${geckoTerminalResponseIndex}/${geckoTerminalResponse.length}`
          );
          const baseContract = new ERC20Contract({
            httpsProvider,
            address: baseTokenInfo.contractAddress,
          });
          const quoteContracts = quoteTokensInfo.map(
            (qt) => new ERC20Contract({ httpsProvider, address: qt.contractAddress })
          );
          await baseContract.getDecimals();
          await Promise.all(quoteContracts.map((qc) => qc.getDecimals()));

          ethPools.push({
            address: gtPoolAddress,
            link: `${geckoTerminalAPI.ethPoolsLink(pool.network.identifier)}/${pool.address}`,
            dex: pool.dex.identifier,
            tokens: [
              {
                name: baseTokenInfo.name,
                symbol: baseTokenInfo.symbol.toUpperCase(),
                address: baseTokenInfo.contractAddress,
                marketCap: baseTokenInfo.marketCap,
                decimals: baseContract.decimals,
              },
              ...quoteTokensInfo.map((qt) => ({
                name: qt.name,
                symbol: qt.symbol.toUpperCase(),
                address: qt.contractAddress,
                marketCap: qt.marketCap,
                decimals: quoteContracts.find((qc) => qc.address === qt.contractAddress).decimals,
              })),
            ],
          });
        }
      }
    }

    fs.writeFile(__dirname + "/ethPools.json", JSON.stringify(ethPools), "utf8", () => {});
    inspect(`All ${ethPools.length} pools found and ready to use.`);
  } catch (e) {
    inspect(e);
  }
};

export default getTokenContracts;
