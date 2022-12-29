import * as dotenv from "dotenv";

dotenv.config();

export const {
  ACCOUNT_ADDRESS,
  ACCOUNT_PRIVATE_KEY,
  RPC_API_KEY,
  WSS_PROVIDER_URL,
  HTTPS_PROVIDE_URL,
  AXIOS_PROXY_HOST,
  AXIOS_PROXY_PORT,
} = process.env;
