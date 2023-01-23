import { v4 as uuidV4 } from "uuid";

import wait from "./wait.js";
import { MAX_REQUEST_REPEAT_TIME } from "../config.js";

export const doRequestSafeRepeat = async ({ request, onFailedMessaged, unsafe, waitTimeMS }) => {
  const uniqId = uuidV4();
  const requestTryCount = {};

  const doRequest = async () => {
    try {
      requestTryCount[uniqId] = (requestTryCount[uniqId] || 0) + 1;
      return await request();
    } catch (e) {
      inspect(onFailedMessaged);
      inspect(`Current repeat try number is: ${requestTryCount[uniqId]}`);

      if (e?.message) {
        inspect(`Error message: ${e.message}`);
      } else {
        inspect(e);
      }

      if (!unsafe && requestTryCount[uniqId] < MAX_REQUEST_REPEAT_TIME) {
        inspect(`Waiting for next ${waitTimeMS / 1000} seconds to try again...`);
        await wait(waitTimeMS);
        return await doRequest();
      }
    }
  };

  return await doRequest();
};

const doChunkRequest = async ({ chunk, chunkName, chunkFetcher, chunkIndex, waitTimeMS }) => {
  const chunkNameComposed = `${chunkName}-chunk #${chunkIndex + 1}`;
  return await doRequestSafeRepeat({
    request: () => Promise.all(chunk.map(chunkFetcher)),
    onFailedMessaged: `Failed to load ${chunkNameComposed}`,
    waitTimeMS,
  });
};

export const chunkFetcher = async ({ chunks, chunkName, chunkFetcher, waitTimeMS }) => {
  const response = [];

  for (let chunkIndex in chunks) {
    const chunkResponse = await doChunkRequest({
      chunk: chunks[chunkIndex],
      chunkName,
      chunkFetcher,
      chunkIndex: +chunkIndex,
      waitTimeMS,
    });
    response.push(...chunkResponse);
    inspect(`Successfully loaded ${+chunkIndex + 1} of ${chunks.length} ${chunkName} chunks`);

    if (chunks[+chunkIndex + 1]) {
      inspect(`Waiting for next ${waitTimeMS / 1000} seconds...`);
      await wait(waitTimeMS);
    }
  }

  return response;
};
