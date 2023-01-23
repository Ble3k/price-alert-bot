import { generalRequest } from "./index.js";
import { API_METHODS } from "./constants.js";

const geckoTerminalSource = "https://app.geckoterminal.com/api/p1";
const request = generalRequest(geckoTerminalSource);

class classAPI {
  maxRequestsPerTime = 80;
  ethPoolsLink = (chain) => `https://www.geckoterminal.com/${chain}/pools`;
  poolsResolver = (data) => data.data.attributes.pools;

  getSearch = (params) =>
    request({
      endpoint: "search",
      method: API_METHODS.GET,
      params,
      addToResponse: { contractAddress: params.query },
    });
}

const API = new classAPI();

export default API;
