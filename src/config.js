export const FETCH_POOLS_PER_TIME = 1000 * 3600 * 24;
export const REQUEST_TRY_AGAIN_TIME = 1000 * 60 + 1000;
export const WAIT_PER_REQUEST_TIME = 3000;
export const MIN_COIN_MARKET_CAP = 1000000;
export const MIN_LIQUIDITY_IN_POOL = 300000;
export const ETH_ADDRESS_MAX_LENGTH = 42;
export const MARKET_CAP_PRICE_CHANGE_TRIGGER = {
  LOW: {
    MCAP: 5000000,
    PERCENT: 30,
  },
  MEDIUM: {
    MCAP: 20000000,
    PERCENT: 15,
  },
  HIGH: {
    MCAP: 100000000,
    PERCENT: 7.5,
  },
  DEFAULT: {
    PERCENT: 5,
  },
};
export const MAX_PRICE_DIFF_VALUES_TO_STORE = 100;
