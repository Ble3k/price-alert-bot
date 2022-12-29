import { generalRequest } from "./index.js";
import { API_METHODS } from "./constants.js";

const coinGeckoSource = "https://api.coingecko.com/api/v3";
const request = generalRequest(coinGeckoSource);

class classAPI {
  maxPageSize = 250;
  maxRequestsPerTime = 8;

  getCoins = (params) =>
    request({
      endpoint: "coins/list",
      method: API_METHODS.GET,
      params,
    });

  getMarkets = (params) =>
    request({
      endpoint: "coins/markets",
      method: API_METHODS.GET,
      params,
    });
}

const API = new classAPI();

export default API;
