# Project Brief: Shade Agent (Generalized Template)

## 1. Primary Purpose

This project is a **generalized template for a non-custodial worker agent** operating within a Trusted Execution Environment (TEE) like Phala Cloud. It leverages NEAR's infrastructure (smart contracts for verification, Chain Signatures for multi-chain interactions) to perform actions on EVM-compatible blockchains (e.g., Base). The agent is designed to be triggered by external inputs, typically social media interactions (e.g., Twitter mentions parsed via Masa API), to automate on-chain operations like asset purchases or name registrations.

The core of the template is to demonstrate how a verifiable, TEE-based agent can:
- Derive unique, ephemeral NEAR accounts for its operations (`deriveWorkerAccount`).
- Register itself and its codehash with a NEAR smart contract for attestation.
- Generate deterministic, operation-specific EVM-compatible addresses using NEAR Chain Signatures and a unique `path` (e.g., `generateAddress({ path: "user_id-operation_details", ... })`). These addresses are used for temporary custody (e.g., user deposits).
- Execute transactions on a target EVM chain using funds sent to these derived addresses.
- Be configurable to adapt to different social platforms, EVM chains, and specific tasks.

## 2. Key Functionalities (Template Capabilities)

*   **TEE Worker Management:**
    *   Derivation of an ephemeral NEAR account for the TEE worker instance.
    *   Registration of the worker (attestation quote, codehash) with a NEAR smart contract.
    *   Verification checks against the smart contract.
*   **Input Processing & Request Handling:**
    *   Framework for ingesting and parsing external inputs (e.g., social media mentions via configurable queries to services like Masa).
    *   Validation of requests against configurable patterns (e.g., desired name format, user intent).
*   **EVM Interaction via Derived Addresses:**
    *   Generation of unique, deterministic EVM-compatible deposit addresses tied to specific requests/users using `generateAddress` with a unique `path`.
    *   Monitoring these derived addresses for deposits.
    *   Execution of EVM transactions (e.g., smart contract calls for name registration, token transfers) using the deposited funds.
    *   Handling of refunds for excess funds or failed operations.
*   **State Management (In-Memory):**
    *   Queues for managing the lifecycle of requests (e.g., pending social reply, pending deposit check, pending EVM transaction, pending refund).
    *   Tracking active conversations/operations.
*   **Configurability & Generalization:**
    *   All critical parameters (API keys, contract IDs, social media query patterns, name validation regex, pricing logic, processing delays, target EVM network details) must be configurable via environment variables.
    *   The system should be a template, avoiding hardcoded specifics for any single use-case (like "basednames" or ".base.eth").
*   **API Structure:**
    *   Hono-based API with TypeScript.
    *   Endpoints for triggering social searches, processing queues (callable by an external scheduler), and administrative tasks.
    *   Clear separation of concerns using domain-specific services (e.g., `services/social/`, `services/evm/`, `services/worker/`).

## 3. Target User

Developers building:
*   Automated, verifiable crypto agents operating in TEEs.
*   Bots that bridge off-chain events (especially social media) to on-chain actions.
*   Non-custodial, multi-chain applications using NEAR Chain Signatures.

## 4. Core Technical Stack (as per existing project)

*   **Backend API:** Hono, TypeScript
*   **Runtime/Package Manager:** Bun
*   **TEE Deployment:** Phala Cloud (or similar)
*   **Blockchain Interaction:**
    *   NEAR: Smart contracts (Rust) for worker verification, Chain Signatures for MPC-based key derivation and EVM transaction signing.
    *   EVM Chains: e.g., Base (via RPC, ethers.js or similar).
*   **Libraries:** `@neardefi/shade-agent-js` (for `deriveWorkerAccount`, `generateAddress`, `contractCall`, etc.), Masa client, Crosspost client.
