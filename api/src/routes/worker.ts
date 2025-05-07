import { Hono } from "hono";
import { networkId, deriveWorkerAccount, registerWorker, contractCall, TappdClient } from "@neardefi/shade-agent-js";

// Create router instance
const router = new Hono();

/**
 * Get worker account ID
 * Migrated from pages/api/derive.js
 */
router.get("/derive", async (c) => {
  try {
    console.log("networkId", networkId);
    console.log("NEXT_PUBLIC_contractId", process.env.NEXT_PUBLIC_contractId);
    
    // Use dev account when running locally
    if (process.env.NEXT_PUBLIC_accountId !== undefined) {
      return c.json({
        accountId: process.env.NEXT_PUBLIC_accountId,
      });
    }

    const accountId = await deriveWorkerAccount();
    return c.json({
      accountId,
    });
  } catch (error) {
    console.error("Error deriving account ID:", error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Register worker
 */
router.get("/register", async (c) => {
  try {
    // Running locally with/without tappd simulator
    if (process.env.NEXT_PUBLIC_accountId !== undefined) {
      // Cannot register worker with simulator attestation quote
      console.log("Cannot register while running tappd simulator:", process.env.DSTACK_SIMULATOR_ENDPOINT);
      return c.json({ 
        registered: false,
        error: "Cannot register while running in simulator mode"
      });
    }

    const registered = await registerWorker();
    return c.json({ registered });
  } catch (error) {
    console.error("Error registering worker:", error);
    return c.json({
      registered: false,
      error: (error as Error).message,
    });
  }
});

/**
 * Verify worker
 */
router.get("/verify", async (c) => {
  try {
    const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;
    const client = new TappdClient(endpoint);

    // Get TCB info from tappd
    const { tcb_info } = await client.getInfo();
    const { app_compose } = JSON.parse(tcb_info);
    
    // First sha256: match of docker-compose.yaml will be codehash (arrange docker-compose.yaml accordingly)
    let [codehash] = app_compose.match(/sha256:([a-f0-9]*)/gim);
    codehash = codehash.replace("sha256:", "");

    let verified = false;
    try {
      await contractCall({
        methodName: "is_verified_by_codehash",
        args: {
          codehash,
        },
      });
      verified = true;
    } catch (e) {
      console.error("Error verifying codehash:", e);
      verified = false;
    }

    return c.json({ verified });
  } catch (error) {
    console.error("Error verifying worker:", error);
    return c.json({
      verified: false,
      error: (error as Error).message,
    });
  }
});

export default router;
