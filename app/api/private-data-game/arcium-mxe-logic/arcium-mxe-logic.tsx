import { supabase } from "@/lib/supabase";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { VotingIDL } from "./program-idl/voting";
import {
  awaitComputationFinalization,
  getCompDefAccOffset,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getMXEPublicKey,
  getClusterAccAddress,
  deserializeLE,
} from "@arcium-hq/client";

// const ENCRYPTION_KEY_MESSAGE = process.env.ARCIUM_ENCRYPTION_KEY_MESSAGE;
const CLUSTER_OFFSET = 456; // Devnet cluster offset

/** Error message returned when finalization wait exceeds ARCIUM_FINALIZATION_TIMEOUT_MS. Caller can revert to non-Arcium daily poll. */
export const ARCIUM_FINALIZATION_TIMEOUT_MSG =
  "Arcium poll creation timed out, reverting to a non-Arcium poll";

const ARCIUM_FINALIZATION_TIMEOUT_MS = 120_000;

/**
 * Generates random bytes using Web Crypto API.
 * Works in both Node.js and edge runtimes.
 */
function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

// Singleton pattern for Arcium interface initialization
let arciumInitialized = false;
let owner: anchor.web3.Keypair | null = null;
let provider: anchor.AnchorProvider | null = null;
let program: Program<anchor.Idl> | null = null;
let clusterAccount: PublicKey | null = null;
let mxePublicKey: Uint8Array | null = null;

/**
 * Initializes the Arcium interface with Solana connection and program setup.
 * Uses lazy initialization pattern - only initializes once on first use.
 */
async function initArciumInterface(): Promise<void> {
  if (arciumInitialized) {
    return;
  }

  try {
    console.log("ARCIUM: Initializing Arcium interface");

    // Get RPC URL from environment
    const rpcUrl = process.env.SOLANA_PRC_URL_PRIVATE;
    if (!rpcUrl || rpcUrl === "") {
      throw new Error("ERR-ARCIUM-001: SOLANA_PRC_URL_PRIVATE is not set");
    }

    // Get wallet from environment (base64 encoded)
    const walletBase64 = process.env.ARCIUM_POLL_AUTHORITY_WALLET;
    if (!walletBase64 || walletBase64 === "") {
      throw new Error(
        "ERR-ARCIUM-002: ARCIUM_POLL_AUTHORITY_WALLET is not set"
      );
    }

    // Decode base64 wallet to Keypair
    let walletBytes: Uint8Array;
    try {
      walletBytes = Uint8Array.from(Buffer.from(walletBase64, "base64"));
    } catch (err) {
      throw new Error(
        "ERR-ARCIUM-003: Failed to decode ARCIUM_POLL_AUTHORITY_WALLET from base64"
      );
    }

    if (walletBytes.length !== 64) {
      throw new Error(
        "ERR-ARCIUM-004: Invalid wallet secret key length (expected 64 bytes)"
      );
    }

    owner = anchor.web3.Keypair.fromSecretKey(walletBytes);

    // Create Solana connection
    const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
    const wallet = new anchor.Wallet(owner);
    provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    // Set provider before accessing program
    anchor.setProvider(provider);

    // Create Program with real IDL; program ID is read from IDL.address by Anchor.
    // Cast IDL via unknown: VotingIDL is readonly, Anchor's Idl expects mutable; runtime is correct.
    program = new Program(VotingIDL as unknown as anchor.Idl, provider);

    // Setup cluster account
    clusterAccount = getClusterAccAddress(CLUSTER_OFFSET);

    // Get MXE public key with retry
    mxePublicKey = await getMXEPublicKeyWithRetry(
      provider,
      program.programId,
      20,
      500
    );

    if (!clusterAccount || !mxePublicKey) {
      throw new Error("ERR-ARCIUM-006: Failed to initialize cluster or MXE");
    }

    arciumInitialized = true;
    console.log("ARCIUM: Interface initialized successfully");
    console.log("ARCIUM: Program ID:", program.programId.toBase58());
    console.log("ARCIUM: Cluster account:", clusterAccount.toBase58());
    console.log("ARCIUM: MXE x25519 pubkey:", mxePublicKey);
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Unknown initialization error";
    console.error("ERR-ARCIUM-005: Error initializing Arcium interface:", err);
    throw new Error(`ERR-ARCIUM-005: ${errorMsg}`);
  }
}

/**
 * Gets the MXE public key with retry logic.
 */
async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 20,
  retryDelayMs: number = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePubKey = await getMXEPublicKey(provider, programId);
      if (mxePubKey) {
        return mxePubKey;
      }
    } catch (error) {
      console.log(
        `ERR-ARCIUM-006: Attempt ${attempt} failed to fetch MXE public key:`,
        error
      );
    }

    if (attempt < maxRetries) {
      console.log(
        `ARCIUM: Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    `ERR-ARCIUM-007: Failed to fetch MXE public key after ${maxRetries} attempts`
  );
}

/**
 * Gets the next Arcium poll ID by finding the highest existing arcium_poll_id
 * in questions_repo and adding 1. Returns null on error.
 */
export async function getNextArciumPollId(): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("questions_repo")
      .select("arcium_poll_id")
      .not("arcium_poll_id", "is", null)
      .order("arcium_poll_id", { ascending: false })
      .limit(1);

    if (error) {
      console.error(
        "ERR-ARCIUM-008: Error fetching max arcium_poll_id:",
        error
      );
      return null;
    }

    if (!data || data.length === 0) {
      // No existing arcium_poll_id found, start at 1
      return 1;
    }

    const maxId = data[0]?.arcium_poll_id as number | undefined;

    if (typeof maxId !== "number") {
      console.error("ERR-ARCIUM-009: Invalid max arcium_poll_id:", maxId);
      return null;
    }

    console.log("ARCIUM: current max arcium_poll_id >>>>", maxId);

    return maxId + 1;
  } catch (err) {
    console.error("ERR-ARCIUM-010: Error in getNextArciumPollId:", err);
    return null;
  }
}

/**
 * Creates a new on-chain Arcium poll for a daily question.
 * @param newPollId - The Arcium poll ID (integer)
 * @param pollQuestion - The poll question text (will be truncated to first 10 chars)
 * @param questionDbId - The database ID of the question
 * @returns Object with poll signature, finalized signature, and error status
 */
export async function createNewOnChainArciumPoll(
  newPollId: number,
  pollQuestion: string,
  questionDbId: number
): Promise<{
  polSig: string;
  finalizedPolSig: string;
  error?: boolean;
  errorMessage?: string;
}> {
  try {
    // Initialize Arcium interface if not already done
    await initArciumInterface();

    if (!owner || !provider || !program || !clusterAccount || !mxePublicKey) {
      throw new Error(
        "ERR-ARCIUM-011: Arcium interface not properly initialized"
      );
    }

    console.log("ARCIUM: Creating new on-chain poll >>>>", {
      newPollId,
      questionDbId,
      pollQuestion: pollQuestion.substring(0, 10),
    });

    // Format poll question: "db_id-first_10_chars"
    const first10Chars = pollQuestion
      .substring(0, 10)
      .replace(/[^a-zA-Z0-9]/g, "");
    const formattedQuestion = `${questionDbId}-${first10Chars}`;

    // Generate random nonce for poll
    const pollNonce = randomBytes(16);
    const pollComputationOffsetBytes = randomBytes(8);
    const pollComputationOffset = new anchor.BN(
      Array.from(pollComputationOffsetBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      "hex"
    );

    // Deserialize nonce to BN
    const nonceBN = new anchor.BN(deserializeLE(pollNonce).toString());

    // Get required account addresses
    const computationAccount = getComputationAccAddress(
      CLUSTER_OFFSET,
      pollComputationOffset
    );
    const mxeAccount = getMXEAccAddress(program.programId);
    const mempoolAccount = getMempoolAccAddress(CLUSTER_OFFSET);
    const executingPool = getExecutingPoolAccAddress(CLUSTER_OFFSET);
    const compDefAccount = getCompDefAccAddress(
      program.programId,
      Buffer.from(getCompDefAccOffset("init_vote_stats")).readUInt32LE()
    );

    console.log("ARCIUM: Account addresses:", {
      computationAccount: computationAccount.toBase58(),
      clusterAccount: clusterAccount.toBase58(),
      mxeAccount: mxeAccount.toBase58(),
      mempoolAccount: mempoolAccount.toBase58(),
      executingPool: executingPool.toBase58(),
    });

    // Create the poll transaction
    const pollSig = await program.methods
      .createNewPoll(
        pollComputationOffset,
        newPollId,
        formattedQuestion,
        nonceBN
      )
      .accountsPartial({
        computationAccount,
        clusterAccount,
        mxeAccount,
        mempoolAccount,
        executingPool,
        compDefAccount,
      })
      .rpc({
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      });

    console.log(`ARCIUM: Poll ${newPollId} created with signature:`, pollSig);

    // Wait for computation finalization (max 120s); on timeout return specific error so caller can revert to non-Arcium daily
    let finalizedPolSig: string;
    try {
      finalizedPolSig = await Promise.race([
        awaitComputationFinalization(
          provider,
          pollComputationOffset,
          program.programId,
          "confirmed"
        ),
        new Promise<string>((_, reject) =>
          setTimeout(
            () => reject(new Error(ARCIUM_FINALIZATION_TIMEOUT_MSG)),
            ARCIUM_FINALIZATION_TIMEOUT_MS
          )
        ),
      ]);
    } catch (finalizationErr) {
      if (
        finalizationErr instanceof Error &&
        finalizationErr.message === ARCIUM_FINALIZATION_TIMEOUT_MSG
      ) {
        console.warn(
          `ARCIUM: Finalization timed out after ${
            ARCIUM_FINALIZATION_TIMEOUT_MS / 1000
          }s for poll ${newPollId}, returning so caller can revert to non-Arcium daily`
        );
        return {
          polSig: pollSig,
          finalizedPolSig: "",
          error: true,
          errorMessage: ARCIUM_FINALIZATION_TIMEOUT_MSG,
        };
      }
      throw finalizationErr;
    }

    console.log(
      `ARCIUM: Finalized poll ${newPollId} signature:`,
      finalizedPolSig
    );

    return {
      polSig: pollSig,
      finalizedPolSig,
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Unknown error creating Arcium poll";
    console.error(
      "ERR-ARCIUM-012: Error creating new on-chain Arcium poll:",
      err
    );
    return {
      polSig: "",
      finalizedPolSig: "",
      error: true,
      errorMessage: `ERR-ARCIUM-012: ${errorMsg}`,
    };
  }
}
