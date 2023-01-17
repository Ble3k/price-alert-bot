import * as dotenv from "dotenv";
import { inspect } from "util";

dotenv.config();
global.inspect = (data, options = {}) => console.log(inspect(data, { colors: true, ...options }));

export const {
  ACCOUNT_ADDRESS,
  ACCOUNT_PRIVATE_KEY,
  RPC_API_KEY,
  WSS_PROVIDER_URL,
  HTTPS_PROVIDER_URL,
  GLOBAL_AGENT_HTTP_PROXY,
  DISCORD_API_KEY,
  DISCORD_CHANNEL_ID,
} = process.env;
