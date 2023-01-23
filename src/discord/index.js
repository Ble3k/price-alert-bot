import { Client, MessageFlags } from "discord.js";

import { doRequestSafeRepeat } from "../utils/fetcher.js";
import { WAIT_PER_REQUEST_TIME, DISCORD_PING_INTERVAL } from "../config.js";

class Discord {
  #client;
  #token;
  #channelId;
  #channel;
  #permissions = [8]; // admin
  #initializing = true;
  #pingInterval = null;

  constructor({ token, channelId }) {
    this.#client = new Client({ intents: this.#permissions });
    this.#token = token;
    this.#channelId = channelId;

    this.init();
    this.#pingInterval = setInterval(this.ping, DISCORD_PING_INTERVAL);
  }

  init = async () => {
    await doRequestSafeRepeat({
      request: async () => {
        await this.#client.login(this.#token);
        this.#channel = await this.#client.channels.fetch(this.#channelId);
        this.#initializing = false;
      },
      onFailedMessaged: "Failed to login in discord or fetch a channel",
      waitTimeMS: WAIT_PER_REQUEST_TIME,
    });
  };

  notify = async (message) => {
    await doRequestSafeRepeat({
      request: async () => {
        if (this.#initializing) {
          throw "Still initializing...";
        }

        await this.#channel.send({ content: message, embeds: null, flags: MessageFlags.SuppressEmbeds });
      },
      onFailedMessaged: `Failed to notify via discord\n\nMessage: ${message}`,
      waitTimeMS: WAIT_PER_REQUEST_TIME,
    });
  };

  ping = async () => {
    const date = new Date();
    await this.notify(`Ping!\nCurrent server time: *${date.toUTCString()} UTC*`);
  };
}

export default Discord;
