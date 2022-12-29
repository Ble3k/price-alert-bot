import { ethers } from "ethers";

import { ACCOUNT_ADDRESS, RPC_API_KEY, HTTPS_PROVIDE_URL } from "./init.js";

const provider = new ethers.providers.WebSocketProvider(`${HTTPS_PROVIDE_URL}/${RPC_API_KEY}`);

const main = async () => {
  const balance = await provider.getBalance(ACCOUNT_ADDRESS);
  console.log(`ETH Balance of ${ACCOUNT_ADDRESS} is: ${ethers.utils.formatEther(balance)} ETH`);
};

main();
