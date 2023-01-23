import { generalRequest } from "./index.js";
import { API_METHODS } from "./constants.js";

const dexScreenerSource = "https://api.dexscreener.com/latest/dex";
const request = generalRequest(dexScreenerSource);

class classAPI {
  maxRequestsPerTime = 250;
  ethPoolsLink = (chain) => `https://dexscreener.com/${chain}`;
  poolsResolver = (data) => data.pairs;

  getTokenById = (contractAddress) =>
    request({
      endpoint: `tokens/${contractAddress}`,
      method: API_METHODS.GET,
      addToResponse: { contractAddress },
    });
}

const API = new classAPI();

export default API;
