import { sha256 } from '@noble/hashes/sha2';
import { generateNonce, uint8ArrayToBase64 } from "near-sign-verify";
import * as borsh from "borsh";
import * as nearAPI from 'near-api-js';
import { CrosspostClient } from "@crosspost/sdk";
import { Platform } from "@crosspost/types"; 

let client = null; 

/**
 * @typedef {object} TweetObject
 * @property {string} id - The ID of the tweet.
 * @property {string} author_id - The author ID of the tweet.
 */

/**
 * Sends a reply to a tweet using the crossposting service.
 * @param {string} text - The text content of the reply.
 * @param {TweetObject} tweetToReplyTo - An object containing the id and author_id of the tweet to reply to.
 * @param {boolean} [fakeReply=false] - If true, simulates the reply without actually sending.
 * @returns {Promise<object>} - The response from the crossposting service.
 */
export const crosspostReply = async (text, tweetToReplyTo, fakeReply = false) => {
    console.log('crosspostReply to tweet ID:', tweetToReplyTo.id);

    if (fakeReply) {
        console.log(`FAKE_REPLY: Would reply to ${tweetToReplyTo.id} with: ${text}`);
        return { data: { id: "fake_reply_id" } };
    }

    const message = "Post"; // This might need to be "Reply" or configurable
    const nonce = generateNonce(); // Returns Uint8Array
    const recipient = "crosspost.near"; // Target contract for signature verification
    const accountId = process.env.CROSSPOST_SIGNER_ID;
    const keyPairString = process.env.CROSSPOST_KEYPAIR;

    if (!accountId || !keyPairString) {
        console.error("CROSSPOST_SIGNER_ID or CROSSPOST_KEYPAIR environment variables are not set.");
        throw new Error("Crossposting credentials not configured.");
    }

    let authData;

    try {
        const signer = nearAPI.KeyPair.fromString(keyPairString);
      
        const TAG = 2147484061; // Magic number for verification
      
        const payload = {
            tag: TAG,
            message,
            nonce: Array.from(nonce), // Borsh expects a plain array of numbers for u8 arrays
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
        const payloadHash = sha256(serializedPayload); // sha256 from @noble/hashes returns Uint8Array
        const signedMessage = signer.sign(payloadHash);
      
        authData = {
            message,
            nonce: uint8ArrayToBase64(nonce), // Nonce for NearAuthData is base64 string
            recipient,
            callback_url: "", // Assuming empty string if null for NearAuthData
            signature: uint8ArrayToBase64(signedMessage.signature),
            account_id: accountId,
            public_key: signedMessage.publicKey.toString(),
        };
    } catch (e) {
        console.log("Error creating auth token for crossposting...", e);
        throw new Error("Error creating crossposting auth token.");
    }

    try {
        if (!client) {
            client = new CrosspostClient(); 
        }
        
        await client.setAuthentication(authData);

        const replyRequest = {
            targets: [{
                platform: Platform.TWITTER,
                userId: process.env.BOT_TWITTER_USER_ID,
            }],
            platform: Platform.TWITTER,
            postId: tweetToReplyTo.id,
            content: [{
                text: text,
                // media: [] // Optional: include if sending media
            }],
        };

        if (!process.env.BOT_TWITTER_USER_ID) {
            console.warn("BOT_TWITTER_USER_ID environment variable is not set. Crossposting target userId might be incorrect.");
            throw new Error(`Bot twitter user id must be provided: ${process.env.BOT_TWITTER_USER_ID}`);
        }
        
        console.log('replyToPost with request:', JSON.stringify(replyRequest, null, 2));
        const res = await client.replyToPost(replyRequest);
        console.log('Crosspost reply response:', res);
        
        return { data: { id: res?.id } }; 
    } catch (e) {
        console.log("Error crossposting reply...", e);
        throw new Error("Error crossposting reply.");
    }
};
