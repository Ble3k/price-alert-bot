import { ethers } from "ethers";

import ERC20ABI from "./ABI.js";

class ERC20Contract {
  static ABI = ERC20ABI;

  address;
  decimals;
  symbol;

  #httpsProvider;
  #contract;

  constructor({ httpsProvider, address }) {
    this.address = address;
    this.#httpsProvider = httpsProvider;
    this.#contract = new ethers.Contract(this.address, ERC20Contract.ABI, this.#httpsProvider);
  }

  getSymbol = async () => {
    this.symbol = await this.#contract.symbol();
  };

  getDecimals = async () => {
    this.decimals = await this.#contract.decimals();
  };
}

export default ERC20Contract;
