import wait from "./wait.js";

const doChunkRequest = async ({ chunk, chunkName, chunkFetcher, chunkIndex, waitTimeMS }) => {
  const chunkNameComposed = `${chunkName}-chunk #${chunkIndex + 1}`;
  try {
    console.log(`Loading ${chunkNameComposed}`);
    return await Promise.all(chunk.map(chunkFetcher));
  } catch ({ request, ...e }) {
    console.log(`Failed to load ${chunkNameComposed}`);

    if (e?.message) {
      console.log(`Error message: ${e.message}`);
    } else {
      console.log(e);
    }

    console.log(`Waiting for next ${waitTimeMS / 1000} seconds to try again...`);

    await wait(waitTimeMS);
    return await doChunkRequest({ chunk, chunkName, chunkFetcher, chunkIndex, waitTimeMS: waitTimeMS + 5000 });
  }
};

const chunkFetcher = async ({ chunks, chunkName, chunkFetcher, waitTimeMS }) => {
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
    console.log(`Successfully loaded ${+chunkIndex + 1} of ${chunks.length} ${chunkName} chunks`);

    if (chunks[+chunkIndex + 1]) {
      console.log(`Waiting for next ${waitTimeMS / 1000} seconds...`);
      await wait(waitTimeMS);
    }
  }

  return response;
};

export default chunkFetcher;
