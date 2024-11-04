import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
} from "@solana/web3.js";

const { Permissions, Period } = multisig.types;

class MultiSigService {
  private connection: Connection;
  private feePayer: Keypair;
  private createKey: Keypair;
  private multisigPda: PublicKey;
  private configTreasury: PublicKey | null = null;
  private agent: PublicKey;
  public vaultPDA: PublicKey | null = null;

  /**
   * Class constructor
   * @param connection - The Solana connection object
   * @param feePayer - The fee payer keypair
   * @param agent - The agent public key
   * @param create_key - The create key keypair (optional). If not provided, a new keypair will be generated.
   */
  constructor(
    connection: Connection,
    feePayer: Keypair,
    agent: PublicKey,
    create_key?: Keypair
  ) {
    this.connection = connection;
    this.feePayer = feePayer;
    this.createKey = create_key ? create_key : Keypair.generate();
    const [pda] = multisig.getMultisigPda({
      createKey: this.createKey.publicKey,
    });
    this.multisigPda = pda;
    const [vaultPDA] = multisig.getVaultPda({
      multisigPda: this.multisigPda,
      index: 0,
    });
    this.vaultPDA = vaultPDA;
    this.agent = agent;
  }

  /**
   * Initializes the MultiSig by creating the multisig account.
   */
  async createMultiSig() {
    const programConfigPda = multisig.getProgramConfigPda({})[0];
    const programConfig =
      await multisig.accounts.ProgramConfig.fromAccountAddress(
        this.connection,
        programConfigPda
      );

    this.configTreasury = programConfig.treasury;

    const ix = multisig.instructions.multisigCreateV2({
      createKey: this.createKey.publicKey,
      creator: this.feePayer.publicKey,
      multisigPda: this.multisigPda,
      configAuthority: this.feePayer.publicKey,
      timeLock: 0,
      members: [
        {
          key: this.feePayer.publicKey,
          permissions: Permissions.all(),
        },
        {
          key: this.agent,
          permissions: Permissions.all(),
        },
      ],
      threshold: 1,
      treasury: this.configTreasury,
      rentCollector: this.feePayer.publicKey,
    });

    return {
      ix: ix,
      create_key: this.createKey,
    };
  }

  /**
   * Adds a spending limit to the MultiSig account.
   */
  async addSpendingLimit() {
    const spendingLimitCreateKey = Keypair.generate().publicKey;

    const spendingLimitPda = multisig.getSpendingLimitPda({
      multisigPda: this.multisigPda,
      createKey: spendingLimitCreateKey,
    })[0];

    const ix = multisig.instructions.multisigAddSpendingLimit({
      multisigPda: this.multisigPda,
      configAuthority: this.feePayer.publicKey,
      spendingLimit: spendingLimitPda,
      rentPayer: this.feePayer.publicKey,
      createKey: spendingLimitCreateKey,
      vaultIndex: 0,
      mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
      amount: BigInt(1_000_000),
      period: Period.Day,
      members: [this.agent],
      destinations: [],
    });

    return {
      ix: ix,
      create_key: spendingLimitCreateKey,
    };
  }

  async sendTx(ix: TransactionInstruction[]) {
    const tx_message = new TransactionMessage({
      payerKey: this.agent,
      recentBlockhash: (await this.connection.getLatestBlockhash()).blockhash,
      instructions: ix,
    });

    console.log("step 1");

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      this.connection,
      this.multisigPda
    );

    console.log("step 2");

    // Get the updated transaction index
    const currentTransactionIndex = Number(multisigInfo.transactionIndex);
    const newTransactionIndex = BigInt(currentTransactionIndex + 1);

    const ix_transfer = multisig.instructions.vaultTransactionCreate({
      multisigPda: this.multisigPda,
      transactionIndex: newTransactionIndex,
      creator: this.agent,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: tx_message,
    });

    console.log("step 3");

    const ix_create = multisig.instructions.proposalCreate({
      multisigPda: this.multisigPda,
      transactionIndex: newTransactionIndex,
      creator: this.agent,
    });

    console.log("step 4");

    const ix_approve = multisig.instructions.proposalApprove({
      multisigPda: this.multisigPda,
      member: this.agent,
      transactionIndex: newTransactionIndex,
    });

    console.log("step 5");

    // const ix_execute = await multisig.instructions.vaultTransactionExecute({
    //   connection: this.connection,
    //   multisigPda: this.multisigPda,
    //   transactionIndex: newTransactionIndex,
    //   member: this.agent,
    // });

    console.log("step 6");

    return {
      transfer_ix: ix_transfer,
      create_ix: ix_create,
      approve_ix: ix_approve,
      // execute_ix: ix_execute,
    };
  }

  async executeTx() {
    const ix_execute = await multisig.instructions.vaultTransactionExecute({
      connection: this.connection,
      multisigPda: this.multisigPda,
      transactionIndex: BigInt(1),
      member: this.agent,
    });

    return ix_execute;
  }
}

export default MultiSigService;
