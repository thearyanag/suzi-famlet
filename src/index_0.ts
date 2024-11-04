import MultiSigService from "@/services/multisig";
import { connection } from "@/constant";
import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const feePayer = Keypair.fromSecretKey(bs58.decode(process.env.FEE_PAYER_KEY!));
const agent = Keypair.fromSecretKey(bs58.decode(process.env.AGENT_KEY!));

console.log(feePayer.publicKey.toBase58());
console.log(agent.publicKey.toBase58());

const multisigService = new MultiSigService(
  connection,
  feePayer,
  agent.publicKey
);

const { ix, create_key } = await multisigService.createMultiSig();

const { ix: addSpendingLimitIx } = await multisigService.addSpendingLimit();

let tx = new Transaction();
tx.add(ix);
tx.add(addSpendingLimitIx);

tx.feePayer = feePayer.publicKey;
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
tx.sign(feePayer, create_key);
// tx.partialSign(agent);

let txHash = await connection.sendRawTransaction(tx.serialize());

console.log(txHash);

await connection.confirmTransaction(txHash, "finalized");

const transfer_ix = SystemProgram.transfer({
  fromPubkey: multisigService.vaultPDA!,
  toPubkey: agent.publicKey,
  lamports: 0.5 * LAMPORTS_PER_SOL,
});

await connection.requestAirdrop(
  multisigService.vaultPDA!,
  1 * LAMPORTS_PER_SOL
);

let {
  create_ix,
  transfer_ix: transfer_ix_2,
  approve_ix,
  // execute_ix,
} = await multisigService.sendTx([transfer_ix]);

const message = new TransactionMessage({
  payerKey: agent.publicKey,
  recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  instructions: [transfer_ix_2, create_ix, approve_ix],
}).compileToV0Message();

let ex_tx = new VersionedTransaction(message);

// tx.feePayer = agent.publicKey;
// tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
ex_tx.sign([agent]);

txHash = await connection.sendRawTransaction(ex_tx.serialize());

console.log(txHash);

await connection.confirmTransaction(txHash, "finalized");

let ix_execute = await multisigService.executeTx();

const ix_msg_execute = new TransactionMessage({
  payerKey: agent.publicKey,
  recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  instructions: [ix_execute.instruction],
}).compileToV0Message(ix_execute.lookupTableAccounts);

let ex_tx_execute = new VersionedTransaction(ix_msg_execute);
ex_tx_execute.sign([agent]);

txHash = await connection.sendRawTransaction(ex_tx_execute.serialize());

console.log(txHash);

// tx = new Transaction();
// tx.add(execute_ix.instruction);

// tx.feePayer = agent.publicKey;
// tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
// tx.sign(agent);

// console.log(txHash);
