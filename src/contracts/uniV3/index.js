import uniV3ABI from "./ABI.js";

import { extractEventsWithHashes, decodeEventValues } from "../../utils/contract.js";

class UniV3Contract {
  static ABI = uniV3ABI;
  static events = extractEventsWithHashes(uniV3ABI);

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
    // TODO
    inspect(this.#eventsDecoded, { depth: 4 });
  };
}

export default UniV3Contract;
