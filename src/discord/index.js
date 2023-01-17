import { Client } from "discord.js";

import wait from "../utils/wait.js";

class Discord {
  #client;
  #token;
  #channelId;
  #channel;
  #permissions = [8]; // admin
  #initializing = true;

  constructor({ token, channelId }) {
    this.#client = new Client({ intents: this.#permissions });
    this.#token = token;
    this.#channelId = channelId;

    this.init();
  }

  init = async () => {
    try {
      await this.#client.login(this.#token);
      this.#channel = await this.#client.channels.fetch(this.#channelId);
      this.#initializing = false;
    } catch (e) {
      inspect(e);
      inspect("Failed to login in discord or fetch a channel, trying again...");
      await wait(3000);
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
      await wait(3000);
      return await this.notify(message);
    }
  };
}

export default Discord;
