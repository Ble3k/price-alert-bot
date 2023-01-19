import { ethers } from "ethers";

const { toUtf8Bytes, keccak256, defaultAbiCoder } = ethers.utils;

export const extractEventsWithHashes = (ABI) =>
  ABI.reduce((memo, curr) => {
    if (curr.type === "event") {
      return {
        ...memo,
        [curr.name]: {
          ...curr,
          hash: keccak256(
            toUtf8Bytes(
              `${curr.name}(${curr.inputs.reduce((memo, curr) => `${memo ? `${memo},` : ""}${curr.type}`, "")})`
            )
          ),
        },
      };
    }

    return memo;
  }, {});

export const decodeEventValues = ({ data, topics, event }) => {
  const [, ...args] = topics;
  const topicArgs = event.inputs.filter((a) => a.indexed);
  const nonTopicArgs = event.inputs.filter((a) => !a.indexed);

  const nonTopicArgsDecoded = defaultAbiCoder.decode(
    nonTopicArgs.map((a) => a.type),
    data
  );

  return {
    ...event,
    inputs: event.inputs.map((input) => ({
      ...input,
      value: input.indexed
        ? defaultAbiCoder.decode([input.type], args[topicArgs.findIndex((a) => a.name === input.name)])[0]
        : nonTopicArgsDecoded[nonTopicArgs.findIndex((a) => a.name === input.name)],
    })),
  };
};
