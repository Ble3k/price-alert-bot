import { ethers } from "ethers";

import uniV2ABI from "./ABI.js";

import { extractEventsWithHashes, decodeEventValues } from "../../utils/contract.js";

class UniV2Contract {
  static ABI = uniV2ABI;
  static events = extractEventsWithHashes(uniV2ABI);

  #httpsProvider;
  #address;
  #eventsDecoded = {};

  constructor({ httpsProvider, address, data, topics, event }) {
    this.#address = address;
    this.#httpsProvider = httpsProvider;

    try {
      this.#eventsDecoded[event.name] = decodeEventValues({ event, data, topics });

      this.checkReserves();
    } catch (e) {
      inspect(e);
    }
  }

  checkReserves = async () => {
    const contract = new ethers.Contract(this.#address, UniV2Contract.ABI, this.#httpsProvider);
    const [reserve0, reserve1] = await contract.getReserves();
    inspect(reserve0.toString());
    inspect(reserve1.toString());
    inspect(this.#eventsDecoded, { depth: 4 });
  };
}

export default UniV2Contract;
