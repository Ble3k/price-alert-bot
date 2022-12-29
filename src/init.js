import * as dotenv from "dotenv";

dotenv.config();

export const {
  ACCOUNT_ADDRESS,
  ACCOUNT_PRIVATE_KEY,
  RPC_API_KEY,
  WSS_PROVIDER_URL,
  HTTPS_PROVIDER_URL,
  GLOBAL_AGENT_HTTP_PROXY,
} = process.env;
