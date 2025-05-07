import { Hono } from "hono";
import { evmNameService } from "../services/evm/nameService.js"; // Assuming .js due to other route imports

const router = new Hono();

/**
 * Get the list of items processed for refunds.
 * This corresponds to the logic from pages/api/refund.js
 */
router.get("/refunded-items", (c) => {
  try {
    const refunds = evmNameService.getRefundedItems();
    return c.json({ refunds });
  } catch (error) {
    console.error("Error fetching refunded items:", error);
    // TODO: Define a more specific error type/response for the API
    return c.json({ error: "Failed to fetch refunded items", details: (error as Error).message }, 500);
  }
});

// Other EVM related routes will be added here.
// For example, endpoints to trigger deposit processing or refund processing
// if they are to be exposed via API for an external scheduler.
// e.g., router.post("/process-deposits", async (c) => { /* ... */ });
// e.g., router.post("/process-refunds", async (c) => { /* ... */ });


export default router;
