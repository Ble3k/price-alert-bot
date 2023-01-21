import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { ethers } from "ethers";
import { bootstrap } from "global-agent";

import getTokenContracts from "./getTokenContractsByChain/ethereum.js";
import {
  RPC_API_KEY,
  HTTPS_PROVIDER_URL,
  WSS_PROVIDER_URL,
  GLOBAL_AGENT_HTTP_PROXY,
  DISCORD_API_KEY,
  DISCORD_CHANNEL_ID,
} from "./init.js";
import wait from "./utils/wait.js";
import { FETCH_POOLS_PER_TIME, WAIT_PER_REQUEST_TIME, LOCAL_PING_INTERVAL } from "./config.js";
import Store from "./store/index.js";
import Discord from "./discord/index.js";
import UniV2Contract from "./contracts/uniV2/index.js";

if (GLOBAL_AGENT_HTTP_PROXY) {
  bootstrap();
}

const date = new Date();
// getTokenContracts();
setInterval(getTokenContracts, FETCH_POOLS_PER_TIME);
setInterval(() => inspect(`Ping! - ${date.toString()}`), LOCAL_PING_INTERVAL);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wssProvider = new ethers.providers.WebSocketProvider(`${WSS_PROVIDER_URL}/${RPC_API_KEY}`);
const httpsProvider = new ethers.providers.JsonRpcProvider(`${HTTPS_PROVIDER_URL}/${RPC_API_KEY}`);
const blockRequestMap = {};

const store = new Store();
const discord = new Discord({ token: DISCORD_API_KEY, channelId: DISCORD_CHANNEL_ID });

const doFetchBlockLogs = async (blockNumber) => {
  try {
    await wait(WAIT_PER_REQUEST_TIME);
    return await wssProvider.getLogs({ fromBlock: blockNumber });
  } catch (e) {
    console.log(`Failed on Block #${blockNumber}, trying again...`);
    await wait(WAIT_PER_REQUEST_TIME);
    return await doFetchBlockLogs(blockNumber);
  }
};

wssProvider.on("block", async (blockNumber) => {
  if (!blockRequestMap[blockNumber]) {
    try {
      blockRequestMap[blockNumber] = true;
      const logs = await doFetchBlockLogs(blockNumber);
      const ethPools = JSON.parse(fs.readFileSync(__dirname + "/getTokenContractsByChain/ethPools.json", "utf8"));
      const ethPoolsArray = Object.values(ethPools).flatMap((item) => item.pools.map((p) => p.address));
      logs.forEach(({ address, data, topics }) => {
        const [eventSignature] = topics;
        if (UniV2Contract.events.Swap.hash === eventSignature && ethPoolsArray.includes(address.toLowerCase())) {
          new UniV2Contract({ httpsProvider, discord, address, data, topics, event: UniV2Contract.events.Swap, store });
        }
      });
    } catch (e) {
      inspect(e);
    }
  }
});
