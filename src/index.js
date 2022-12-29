import { ethers } from "ethers";
import { bootstrap } from "global-agent";

import { ACCOUNT_ADDRESS, RPC_API_KEY, WSS_PROVIDER_URL, GLOBAL_AGENT_HTTP_PROXY } from "./init.js";

if (GLOBAL_AGENT_HTTP_PROXY) {
  bootstrap();
}

const provider = new ethers.providers.WebSocketProvider(`${WSS_PROVIDER_URL}/${RPC_API_KEY}`);

const main = async () => {
  const balance = await provider.getBalance(ACCOUNT_ADDRESS);
  console.log(`ETH Balance of ${ACCOUNT_ADDRESS} is: ${ethers.utils.formatEther(balance)} ETH`);
};

main();
