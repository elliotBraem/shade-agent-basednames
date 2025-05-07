import { generateAddress, networkId } from "@neardefi/shade-agent-js";
import { evm } from "../../utils/evm.js";
import { sleep } from "../../utils/common.js";
import { twitterSearchService } from "../search/twitter.js";

// Constants for processing delays and attempts
const DEPOSIT_PROCESSING_DELAY = 5000; // 5 seconds
const REFUND_PROCESSING_DELAY = 60000; // 60 seconds
const MAX_DEPOSIT_ATTEMPTS = 12 * 60; // 12 per minute * 60 mins = 12 hours

// Types for the EVM name service
export interface BasenameInfo {
  basename: string;
  isValid: boolean;
  isAvailable: boolean;
  price?: bigint;
  priceChecked?: boolean;
  error?: string;
}

interface BasenameCheckResult {
  basename: string;
  isValid?: boolean;
  isAvailable?: boolean;
  price?: bigint;
  priceChecked?: boolean;
  error?: string;
}

export interface DepositItem {
  id: string;
  author_id: string;
  conversation_id: string;
  basename: string;
  path: string;
  address: string;
  price: bigint;
  depositAttempt: number;
  onItReplyId?: string;
}

export interface RefundItem {
  id: string;
  author_id?: string;
  path: string;
  address: string;
}

export type ConversationStatus = 
  | "new" 
  | "instruction_sent" 
  | "awaiting_deposit" 
  | "processing_deposit" 
  | "resolved" 
  | "error_invalid_basename" 
  | "error_unavailable_basename" 
  | "error_registration_failed"
  | "error_processing_deposit"
  | "error_max_attempts";

export interface ConversationState {
  status: ConversationStatus;
  lastProcessedTweetId: string;
  basename?: string;
  author_id?: string;
  depositAddress?: string;
  path?: string;
  price?: bigint;
  attempts: number;
}

class EvmNameService {
  // In-memory queues and state
  private pendingDeposit: DepositItem[] = [];
  private pendingRefund: RefundItem[] = [];
  private refundedItems: RefundItem[] = [];
  private activeConversations: Map<string, ConversationState> = new Map();
  
  // Processing flags to prevent multiple simultaneous processing loops
  private isProcessingDeposits = false;
  private isProcessingRefunds = false;

  constructor() {
    // Initialization logic
    console.log("EVM Name Service initialized");
  }

  /**
   * Get the list of refunded items
   */
  getRefundedItems(): RefundItem[] {
    return [...this.refundedItems]; // Return a copy to prevent external modification
  }

  /**
   * Add an item to the refunded items list
   */
  addRefundedItem(item: RefundItem): void {
    this.refundedItems.push(item);
  }

  /**
   * Get the active conversation state for a conversation ID
   */
  getConversationState(conversationId: string): ConversationState | undefined {
    return this.activeConversations.get(conversationId);
  }

  /**
   * Update the state of a conversation
   */
  updateConversationState(conversationId: string, state: Partial<ConversationState>): void {
    const currentState = this.activeConversations.get(conversationId) || {
      status: "new",
      lastProcessedTweetId: "",
      attempts: 0
    };
    
    this.activeConversations.set(conversationId, {
      ...currentState,
      ...state
    });
  }

  /**
   * Check if a basename is valid and available
   */
  async checkBasename(basename: string): Promise<BasenameInfo> {
    try {
      const result = await evm.checkBasename(basename) as BasenameCheckResult;
      
      // Ensure the result conforms to BasenameInfo interface
      return {
        basename: result.basename,
        isValid: result.isValid ?? false,
        isAvailable: result.isAvailable ?? false,
        price: result.price,
        priceChecked: result.priceChecked ?? false,
        error: result.error
      };
    } catch (error) {
      console.error(`Error checking basename ${basename}:`, error);
      return {
        basename,
        isValid: false,
        isAvailable: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Process a new basename registration request
   */
  async processRegistrationRequest(
    tweet: { 
      id: string; 
      author_id: string; 
      conversation_id: string;
      basename: string;
    }
  ): Promise<void> {
    console.log(`Processing registration request for tweet ${tweet.id}, basename: ${tweet.basename}`);
    
    // Generate a unique path for this request
    const path = `${tweet.author_id}-${tweet.basename}`;
    
    try {
      const publicKey = networkId === "testnet"
        ? process.env.MPC_PUBLIC_KEY_TESTNET || ""
        : process.env.MPC_PUBLIC_KEY_MAINNET || "";
      
      if (!publicKey) {
        throw new Error(`MPC public key not configured for ${networkId} network`);
      }
      
      const contractId = process.env.NEXT_PUBLIC_contractId || "";
      if (!contractId) {
        throw new Error("Contract ID not configured");
      }
      
      // Generate deposit address
      const { address } = await generateAddress({
        publicKey,
        accountId: contractId,
        path,
        chain: "evm",
      });
      
      // Check if basename is valid and available
      const basenameInfo = await this.checkBasename(tweet.basename);
      
      // Get or create conversation state
      const conversationState = this.activeConversations.get(tweet.conversation_id) || {
        status: "new",
        lastProcessedTweetId: tweet.id,
        basename: tweet.basename,
        author_id: tweet.author_id,
        attempts: 0
      };
      
      // Update attempts
      conversationState.attempts = (conversationState.attempts || 0) + 1;
      
      // Check basename validity
      if (!basenameInfo.isValid) {
        // Update conversation state
        this.updateConversationState(tweet.conversation_id, {
          status: "error_invalid_basename",
          lastProcessedTweetId: tweet.id
        });
        
        // Send reply about invalid basename
        await twitterSearchService.reply(
          `Sorry! 😬\n\n"${tweet.basename}" is not a valid basename! Must be 3+ alphanumeric characters.`,
          tweet
        );
        
        return;
      }
      
      // Check basename availability
      if (!basenameInfo.isAvailable) {
        // Update conversation state
        this.updateConversationState(tweet.conversation_id, {
          status: "error_unavailable_basename",
          lastProcessedTweetId: tweet.id
        });
        
        // Send reply about unavailable basename
        await twitterSearchService.reply(
          `Sorry! 😬\n\nBasename "${tweet.basename}.base.eth" is not available!`,
          tweet
        );
        
        return;
      }
      
      // Calculate price based on basename length
      // 1100000000000000n 5+ char
      // 11000000000000000n 4 char
      // 110000000000000000n 3 char
      let price = BigInt(1100000000000000);
      if (tweet.basename.length === 4) {
        price = BigInt(11000000000000000);
      }
      if (tweet.basename.length === 3) {
        price = BigInt(110000000000000000);
      }
      
      const formattedPrice = evm.formatBalance(price).substring(0, 7);
      console.log(`Price for ${tweet.basename}: ${formattedPrice} ETH`);
      
      // Send reply with deposit instructions
      const replyResult = await twitterSearchService.reply(
        `On it! 😎\n\nTo register "${tweet.basename}.base.eth", send ${formattedPrice} ETH (Base) to: ${address}\n\nYou have 10 minutes. Late? You might miss out & risk funds.\n\nTerms in Bio.`,
        tweet
      );
      
      // Update conversation state
      this.updateConversationState(tweet.conversation_id, {
        status: "instruction_sent",
        depositAddress: address,
        path,
        price,
        lastProcessedTweetId: tweet.id
      });
      
      // Add to pending deposit queue
      this.pendingDeposit.push({
        id: tweet.id,
        author_id: tweet.author_id,
        conversation_id: tweet.conversation_id,
        basename: tweet.basename,
        path,
        address,
        price,
        depositAttempt: 0,
        onItReplyId: replyResult?.data?.id
      });
      
      // Start deposit processing if not already running
      if (!this.isProcessingDeposits) {
        this.processDeposits();
      }
      
    } catch (error) {
      console.error(`Error processing registration request for tweet ${tweet.id}:`, error);
      
      // Update conversation state to error
      this.updateConversationState(tweet.conversation_id, {
        status: "error_processing_deposit",
        lastProcessedTweetId: tweet.id
      });
    }
  }

  /**
   * Process the deposit queue
   */
  async processDeposits(): Promise<void> {
    if (this.isProcessingDeposits) {
      return;
    }
    
    this.isProcessingDeposits = true;
    
    try {
      while (true) {
        const tweet = this.pendingDeposit.shift();
        
        if (!tweet) {
          console.log("No more pending deposits to process");
          await sleep(DEPOSIT_PROCESSING_DELAY);
          continue;
        }
        
        if (tweet.depositAttempt >= MAX_DEPOSIT_ATTEMPTS) {
          console.log(`Max deposit attempts reached for ${tweet.id}, moving to refund queue`);
          this.pendingRefund.push(tweet);
          
          // Update conversation state
          this.updateConversationState(tweet.conversation_id, {
            status: "error_max_attempts"
          });
          
          // Start refund processing if not already running
          if (!this.isProcessingRefunds) {
            this.processRefunds();
          }
          
          continue;
        }
        
        console.log(`Processing deposit attempt ${tweet.depositAttempt} for address ${tweet.address}`);
        
        try {
          // Check balance
          const balance = await evm.getBalance({ address: tweet.address });
          console.log(`Balance for ${tweet.address}: ${evm.formatBalance(balance)} ETH`);
          
          // If we have the correct deposit amount
          if (balance && balance >= tweet.price) {
            // Get transaction details
            const tx = await this.getTransactionsForAddress(tweet.address);
            
            if (tx) {
              try {
                // Register the basename
                const nameRes = await evm.getBasenameTx(
                  tweet.path,
                  tweet.basename,
                  tweet.address,
                  tx.from
                );
                
                if (nameRes?.success && nameRes?.explorerLink) {
                  // Update conversation state
                  this.updateConversationState(tweet.conversation_id, {
                    status: "resolved"
                  });
                  
                  // Send success reply
                  await twitterSearchService.reply(
                    `Done! 😎\n\nRegistered ${tweet.basename}.base.eth to ${tx.from}\n\ntx: ${nameRes.explorerLink}`,
                    { id: tweet.id, author_id: tweet.author_id }
                  );
                } else {
                  // Update conversation state for failed registration
                  this.updateConversationState(tweet.conversation_id, {
                    status: "error_registration_failed"
                  });
                }
              } catch (e) {
                console.error(`Error during basename registration for ${tweet.basename}:`, e);
                
                // Update conversation state
                this.updateConversationState(tweet.conversation_id, {
                    status: "error_processing_deposit"
                });
              }
              
              // Check for leftover balance to refund
              try {
                const remainingBalance = await evm.getBalance({
                  address: tweet.address
                });
                
                if (remainingBalance > BigInt(0)) {
                  console.log(`Leftover balance for ${tweet.address}: ${evm.formatBalance(remainingBalance)} ETH`);
                  this.pendingRefund.push(tweet);
                  
                  // Start refund processing if not already running
                  if (!this.isProcessingRefunds) {
                    this.processRefunds();
                  }
                }
              } catch (e) {
                console.error(`Error checking leftover balance for ${tweet.address}:`, e);
              }
              
              await sleep(DEPOSIT_PROCESSING_DELAY);
              continue;
            }
            
            // Check internal transactions
            const txInternal = await this.getTransactionsForAddress(tweet.address, "txlistinternal");
            if (txInternal) {
              console.log(`Found internal transaction for ${tweet.address}, moving to refund queue`);
              this.pendingRefund.push(tweet);
              
              // Start refund processing if not already running
              if (!this.isProcessingRefunds) {
                this.processRefunds();
              }
              
              await sleep(DEPOSIT_PROCESSING_DELAY);
              continue;
            }
          }
          
          // Increment attempt counter and push back to queue
          tweet.depositAttempt++;
          this.pendingDeposit.push(tweet);
          
        } catch (error) {
          console.error(`Error processing deposit for ${tweet.address}:`, error);
          
          // Increment attempt counter and push back to queue
          tweet.depositAttempt++;
          this.pendingDeposit.push(tweet);
        }
        
        await sleep(DEPOSIT_PROCESSING_DELAY);
      }
    } finally {
      this.isProcessingDeposits = false;
    }
  }

  /**
   * Process the refund queue
   */
  async processRefunds(): Promise<void> {
    if (this.isProcessingRefunds) {
      return;
    }
    
    this.isProcessingRefunds = true;
    
    try {
      while (true) {
        const tweet = this.pendingRefund.shift();
        
        if (!tweet) {
          console.log("No more pending refunds to process");
          await sleep(REFUND_PROCESSING_DELAY);
          continue;
        }
        
        console.log(`Processing refund for tweet ${tweet.id}, address ${tweet.address}`);
        
        // Store this tweet in refunded items for manual resolution if needed
        this.addRefundedItem(tweet);
        
        let internal = false;
        let tx = await this.getTransactionsForAddress(tweet.address);
        
        // Check transactions for smart contract wallets
        if (!tx) {
          tx = await this.getTransactionsForAddress(tweet.address, "txlistinternal");
          internal = true;
        }
        
        if (tx) {
          try {
            const balance = await evm.getBalance({
              address: tweet.address
            });
            
            // Ensure balance is not null before proceeding
            if (!balance) {
              console.log(`No balance found for ${tweet.address}, skipping refund`);
              continue;
            }
            
            const feeData = await evm.getGasPrice();
            const gasPrice = BigInt(feeData.maxFeePerGas || 0) + BigInt(feeData.maxPriorityFeePerGas || 0);
            const gasLimit = internal ? BigInt(500000) : BigInt(21000);
            const gasFee = gasPrice * gasLimit;
            
            // Make sure we don't overshoot the total available
            const adjust = BigInt(5000000000000);
            const amount = evm.formatBalance(balance - gasFee - adjust);
            
            await evm.send({
              path: tweet.path,
              from: tweet.address,
              to: tx.from,
              amount,
              gasLimit,
            });
            
            console.log(`Refund sent to ${tx.from} for amount ${amount} ETH`);
          } catch (e) {
            console.error(`Error processing refund for ${tweet.address}:`, e);
          }
        }
        
        await sleep(REFUND_PROCESSING_DELAY);
      }
    } finally {
      this.isProcessingRefunds = false;
    }
  }

  /**
   * Get transactions for an address
   */
  private async getTransactionsForAddress(
    address: string, 
    action: string = "txlist"
  ): Promise<any> {
    try {
      const res = await fetch(
        `https://api${
          networkId === "testnet" ? "-sepolia" : ""
        }.basescan.org/api?module=account&action=${action}&address=${address}&startblock=0&endblock=latest&page=1&offset=10&sort=asc&apikey=${
          process.env.BASE_API_KEY
        }`
      );
      
      if (!res.ok) {
        console.error(`Error fetching transactions: ${res.status} ${res.statusText}`);
        return;
      }
      
      const data = await res.json();
      
      if (!data.result || data.result.length === 0) {
        return;
      }
      
      const tx = data.result[0];
      if (tx?.isError === "1" || !tx?.from) {
        return;
      }
      
      return tx;
    } catch (e) {
      console.error(`Error fetching transactions for ${address}:`, e);
      return;
    }
  }

  /**
   * Start processing queues
   */
  startProcessing(): void {
    if (!this.isProcessingDeposits && this.pendingDeposit.length > 0) {
      this.processDeposits();
    }
    
    if (!this.isProcessingRefunds && this.pendingRefund.length > 0) {
      this.processRefunds();
    }
  }

  /**
   * Manually trigger a refund
   */
  triggerManualRefund(address: string, path: string): void {
    console.log(`Manual refund triggered for address ${address} with path ${path}`);
    
    this.pendingRefund.push({
      id: "FORCED REFUND TRY",
      address,
      path
    });
    
    if (!this.isProcessingRefunds) {
      this.processRefunds();
    }
  }
}

export const evmNameService = new EvmNameService();
