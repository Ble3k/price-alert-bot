import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { ethers } from "ethers";
import { bootstrap } from "global-agent";

import getTokenContracts from "./getTokenContractsByChain/ethereum.js";
import { RPC_API_KEY, GLOBAL_AGENT_HTTP_PROXY, DISCORD_API_KEY, DISCORD_CHANNEL_ID } from "./init.js";
import wait from "./utils/wait.js";
import { doRequestSafeRepeat } from "./utils/fetcher.js";
import { FETCH_POOLS_PER_TIME, WAIT_PER_REQUEST_TIME, LOCAL_PING_INTERVAL } from "./config.js";
import Store from "./store/index.js";
import Discord from "./discord/index.js";
import UniV2Contract from "./contracts/uniV2/index.js";

if (GLOBAL_AGENT_HTTP_PROXY) {
  bootstrap();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const provider = new ethers.providers.AnkrProvider({ name: "homestead", chainId: 1 }, RPC_API_KEY);
let isBlockProcessing = false;

const store = new Store();
const discord = new Discord({ token: DISCORD_API_KEY, channelId: DISCORD_CHANNEL_ID });

// getTokenContracts(provider);
setInterval(() => getTokenContracts(provider), FETCH_POOLS_PER_TIME);
setInterval(() => {
  const date = new Date();
  inspect(`Ping! - ${date.toString()}`);
}, LOCAL_PING_INTERVAL);

provider.on("block", async (blockNumber) => {
  inspect(`Processing a block: #${blockNumber}. In progress: ${isBlockProcessing}`);
  if (!isBlockProcessing) {
    try {
      inspect(blockNumber);
      isBlockProcessing = true;
      const logs = await doRequestSafeRepeat({
        request: async () => {
          await wait(WAIT_PER_REQUEST_TIME); // wait before request
          return await provider.getLogs({ fromBlock: blockNumber });
        },
        onFailedMessaged: `Failed on Block #${blockNumber}`,
        unsafe: true,
        waitTimeMS: WAIT_PER_REQUEST_TIME, // wait after failed request to try again
      });

      const ethPools = JSON.parse(fs.readFileSync(__dirname + "/getTokenContractsByChain/ethPools.json", "utf8"));

      logs.forEach(({ address, data, topics }) => {
        const [eventSignature] = topics;
        const addressFormatted = address.toLowerCase();
        const poolInfo = ethPools.find((ep) => ep.address === addressFormatted);

        if (UniV2Contract.events.Swap.hash === eventSignature && poolInfo) {
          new UniV2Contract({
            httpsProvider: provider,
            discord,
            address: addressFormatted,
            ethPools,
            poolInfo,
            data,
            topics,
            event: UniV2Contract.events.Swap,
            store,
          });
        }
      });
    } catch (e) {
      inspect(e);
    } finally {
      isBlockProcessing = false;
    }
  }
});
