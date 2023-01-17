import { ethers } from "ethers";

import ERC20ABI from "./ABI.js";

class ERC20Contract {
  static ABI = ERC20ABI;

  decimals;
  symbol;

  #httpsProvider;
  #address;

  constructor({ httpsProvider, address }) {
    this.#address = address;
    this.#httpsProvider = httpsProvider;
  }

  getTokenInfo = async () => {
    const contract = new ethers.Contract(this.#address, ERC20Contract.ABI, this.#httpsProvider);
    this.decimals = await contract.decimals();
    this.symbol = await contract.symbol();
  };
}

export default ERC20Contract;
