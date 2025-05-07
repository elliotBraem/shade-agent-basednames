import { CrosspostClient } from "@crosspost/sdk";
import { Platform } from "@crosspost/types";
import { sha256 } from "@noble/hashes/sha2";
import * as borsh from "borsh";
import * as nearAPI from "near-api-js";
import { generateNonce, uint8ArrayToBase64 } from "near-sign-verify";

// Singleton client instance
let clientInstance: CrosspostClient | null = null;

/**
 * Get or create a CrosspostClient instance
 */
const getClient = (): CrosspostClient => {
  if (!clientInstance) {
    clientInstance = new CrosspostClient();
  }
  return clientInstance;
};

/**
 * Generate authentication data for Crosspost API
 */
const generateAuthData = async (): Promise<any> => {
  const signerId = process.env.CROSSPOST_SIGNER_ID;
  const keyPairString = process.env.CROSSPOST_KEYPAIR;

  if (!signerId || !keyPairString) {
    throw new Error("CROSSPOST_SIGNER_ID or CROSSPOST_KEYPAIR environment variables are not set");
  }

  try {
    // START : DO NOT CHANGE THIS - Authentication signature logic
    const message = "Post";
    const nonce = generateNonce();
    const recipient = "crosspost.near";
    
    const signer = nearAPI.KeyPair.fromString(keyPairString);
    const TAG = 2147484061; // Magic number for verification

    const payload = {
      tag: TAG,
      message,
      nonce: Array.from(nonce),
      receiver: recipient,
      callback_url: null,
    };

    const schema = {
      struct: {
        tag: "u32",
        message: "string",
        nonce: { array: { type: "u8", len: 32 } },
        receiver: "string",
        callback_url: { option: "string" },
      },
    };

    const serializedPayload = borsh.serialize(schema, payload);
    const payloadHash = sha256(serializedPayload);
    const signedMessage = signer.sign(payloadHash);

    return {
      message,
      nonce: nonce,
      recipient,
      callback_url: "",
      signature: uint8ArrayToBase64(signedMessage.signature),
      account_id: signerId,
      public_key: signedMessage.publicKey.toString(),
    };
    // END : DO NOT CHANGE THIS
  } catch (error) {
    console.error("Error creating auth token for crossposting:", error);
    throw new Error("Error creating crossposting auth token");
  }
};

/**
 * Higher-order function that authenticates before executing a Crosspost operation
 * @param operation Function that uses the authenticated client
 * @returns Result of the operation
 */
export const withAuth = async <T>(operation: (client: CrosspostClient) => Promise<T>): Promise<T> => {
  const client = getClient();
  const authData = await generateAuthData();
  await client.setAuthentication(authData);
  return operation(client);
};

/**
 * Reply to a post on Twitter
 * @param text The text content of the reply
 * @param tweetToReplyTo The tweet to reply to (with id and author_id)
 * @param dryRun If true, logs the reply but doesn't actually send it
 * @returns The response from the Crosspost API
 */
export const replyToTweet = async (
  text: string,
  tweetToReplyTo: { id: string; author_id: string },
  dryRun: boolean = false
): Promise<{ data: { id: string } }> => {
  console.log(`Replying to tweet ${tweetToReplyTo.id} with: "${text}"`);
  
  if (dryRun) {
    console.log(`DRY_RUN: Would reply to ${tweetToReplyTo.id} with: "${text}"`);
    return { data: { id: "dry-run-reply-id" } };
  }
  
  if (!process.env.BOT_TWITTER_USER_ID) {
    throw new Error("BOT_TWITTER_USER_ID environment variable is not set");
  }
  
  try {
    const response = await withAuth(async (client) => {
      const replyRequest = {
        targets: [
          {
            platform: Platform.TWITTER,
            userId: process.env.BOT_TWITTER_USER_ID!,
          },
        ],
        platform: Platform.TWITTER,
        postId: tweetToReplyTo.id,
        content: [
          {
            text: text,
            // media: [] // Optional: include if sending media
          },
        ],
      };
      
      console.log("Sending reply request:", JSON.stringify(replyRequest, null, 2));
      return await client.post.replyToPost(replyRequest);
    });
    
    console.log("Reply response:", response);
    return { data: { id: response?.id || "unknown-reply-id" } };
  } catch (error) {
    console.error("Error posting reply:", error);
    throw new Error(`Error posting reply: ${(error as Error).message}`);
  }
};

/**
 * Create a new post on Twitter
 * @param content The content of the post
 * @param dryRun If true, logs the post but doesn't actually send it
 * @returns The response from the Crosspost API
 */
export const createTweet = async (
  text: string,
  dryRun: boolean = false
): Promise<{ id: string }> => {
  console.log(`Creating tweet: "${text}"`);
  
  if (dryRun) {
    console.log(`DRY_RUN: Would create tweet: "${text}"`);
    return { id: "dry-run-tweet-id" };
  }
  
  if (!process.env.BOT_TWITTER_USER_ID) {
    throw new Error("BOT_TWITTER_USER_ID environment variable is not set");
  }
  
  try {
    const response = await withAuth(async (client) => {
      const createRequest = {
        targets: [
          {
            platform: Platform.TWITTER,
            userId: process.env.BOT_TWITTER_USER_ID!,
          },
        ],
        content: [
          {
            text: text,
            // media: [] // Optional: include if sending media
          },
        ],
      };
      
      console.log("Sending create request:", JSON.stringify(createRequest, null, 2));
      return await client.post.createPost(createRequest);
    });
    
    console.log("Create response:", response);
    return { id: response?.id || "unknown-tweet-id" };
  } catch (error) {
    console.error("Error creating tweet:", error);
    throw new Error(`Error creating tweet: ${(error as Error).message}`);
  }
};

// Export the raw client and auth function for advanced usage
export const crosspostClient = {
  getClient,
  withAuth,
};
