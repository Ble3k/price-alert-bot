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
  const [_, ...args] = topics; // eslint-disable-line
  const topicArgs = [];
  const nonTopicArgs = [];

  for (let inputIndex in event.inputs) {
    if (event.inputs[inputIndex].indexed) {
      topicArgs.push(event.inputs[inputIndex]);
    } else {
      nonTopicArgs.push(event.inputs[inputIndex]);
    }
  }

  const nonTopicArgsDecoded = defaultAbiCoder.decode(
    nonTopicArgs.map((a) => a.type),
    data
  );
  const nonTopicArgsWithValue = nonTopicArgs.map((a, index) => ({ ...a, value: nonTopicArgsDecoded[index] }));

  return {
    ...event,
    inputs: event.inputs.map((input) => ({
      ...input,
      value: input.indexed
        ? defaultAbiCoder.decode([input.type], args[topicArgs.findIndex((a) => a.name === input.name)])[0]
        : nonTopicArgsWithValue.find((a) => a.name === input.name).value,
    })),
  };
};
