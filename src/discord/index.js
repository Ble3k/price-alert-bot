import { Client } from "discord.js";

import wait from "../utils/wait.js";
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
    try {
      await this.#client.login(this.#token);
      this.#channel = await this.#client.channels.fetch(this.#channelId);
      this.#initializing = false;
    } catch (e) {
      inspect(e);
      inspect("Failed to login in discord or fetch a channel, trying again...");
      await wait(WAIT_PER_REQUEST_TIME);
      await this.init();
    }
  };

  notify = async (message) => {
    try {
      if (this.#initializing) {
        throw "Still initializing...";
      }

      await this.#channel.send(message);
    } catch (e) {
      inspect(e);
      await wait(WAIT_PER_REQUEST_TIME);
      return await this.notify(message);
    }
  };

  ping = () => {
    const date = new Date();
    this.notify(`Ping!\nCurrent server time: *${date.toUTCString()} UTC*`);
  };
}

export default Discord;
