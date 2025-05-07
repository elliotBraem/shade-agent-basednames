import { serve } from "@hono/node-server";
// import { setContractId, setKey } from "@neardefi/shade-agent-js";
import * as dotenv from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "./config.js";

// Load environment variables
dotenv.config();

// Initialize configuration
config.init();

// Initialize SDK
// if (config.contractId) {
//   setContractId(config.contractId);
// }
// if (config.signerId && config.secretKey) {
//   setKey(config.signerId, config.secretKey);
// }

// Import routes
import agentRoutes from "./routes/agent.js";
import adminRoutes from "./routes/admin.js";
import balanceRoutes from "./routes/balance.js";
import searchRoutes from "./routes/search.js";
import staticRoutes from "./routes/static.js";
import workerRoutes from "./routes/worker.js";
import evmRoutes from "./routes/evm.js";

// Create Hono app
const app = new Hono();

// Middleware
app.use(logger());
app.use(cors(config.cors));

// In-memory randomness only available to this instance of TEE
const randomArray = new Uint8Array(32);
crypto.getRandomValues(randomArray);

// Mount routes
app.route("/api/agent", agentRoutes);
app.route("/api/worker", workerRoutes);
app.route("/api/balance", balanceRoutes);
app.route("/api/evm", evmRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/admin", adminRoutes);
app.route("/", staticRoutes);

// Start the server
console.log(`Server is running on port ${config.port}`);

serve({
  fetch: app.fetch,
  port: Number(config.port),
});
