import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { ethers } from "ethers";
import { bootstrap } from "global-agent";

// import getTokenContracts from "./getTokenContractsByChain/ethereum.js";
import wait from "./utils/wait.js";
import { RPC_API_KEY, HTTPS_PROVIDER_URL, WSS_PROVIDER_URL, GLOBAL_AGENT_HTTP_PROXY } from "./init.js";

import UniV2Contract from "./contracts/uniV2/index.js";

if (GLOBAL_AGENT_HTTP_PROXY) {
  bootstrap();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wssProvider = new ethers.providers.WebSocketProvider(`${WSS_PROVIDER_URL}/${RPC_API_KEY}`);
const httpsProvider = new ethers.providers.JsonRpcProvider(`${HTTPS_PROVIDER_URL}/${RPC_API_KEY}`);
const blockRequestMap = {};

const doFetchBlockLogs = async (blockNumber) => {
  try {
    await wait(3000);
    return await wssProvider.getLogs({ fromBlock: blockNumber });
  } catch (e) {
    console.log(`Failed on Block #${blockNumber}, trying again...`);
    await wait(1000);
    return await doFetchBlockLogs(blockNumber);
  }
};

wssProvider.on("block", async (blockNumber) => {
  if (!blockRequestMap[blockNumber]) {
    blockRequestMap[blockNumber] = true;
    const logs = await doFetchBlockLogs(blockNumber);
    const ethPools = JSON.parse(fs.readFileSync(__dirname + "/getTokenContractsByChain/ethPools.json", "utf8"));
    const ethPoolsArray = Object.values(ethPools).flat();
    const logsFiltered = logs.filter(({ address, topics }) => {
      const [eventSignature] = topics;
      return UniV2Contract.events.Swap.hash === eventSignature && ethPoolsArray.includes(address.toLowerCase());
    });
    logsFiltered.forEach(({ address, data, topics }) => {
      new UniV2Contract({ httpsProvider, address, data, topics, event: UniV2Contract.events.Swap });
    });

    inspect(`Block #${blockNumber} has ${logsFiltered.length} logs filtered...`);
  }
});
