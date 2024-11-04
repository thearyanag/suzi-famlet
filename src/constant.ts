import { Connection } from "@solana/web3.js";

export const connection = new Connection(
  process.env.NETWORK! === "devnet"
    ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
);
