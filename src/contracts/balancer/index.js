import balancerABI from "./ABI.js";

import { extractEventsWithHashes, decodeEventValues } from "../../utils/contract.js";

class BalancerContract {
  static ABI = balancerABI;
  static events = extractEventsWithHashes(balancerABI);

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

export default BalancerContract;
