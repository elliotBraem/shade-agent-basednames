import { Hono } from "hono";
import { twitterSearchService } from "../services/search/twitter.js";
import { evmNameService } from "../services/evm/nameService.js";

// Create router instance
const router = new Hono();

/**
 * Search endpoint for social media content.
 */
router.get("/", async (c) => {
  try {
    // Check for admin operations
    const url = new URL(c.req.url);
    const restart = url.searchParams.get("restart");
    const refund = url.searchParams.get("refund");
    const pass = url.searchParams.get("pass");
    
    // Handle admin operations if password is correct
    if (pass === process.env.RESTART_PASS) {
      if (restart === "replies" || restart === "deposits" || restart === "refunds") {
        console.log(`Restarting ${restart} processing`);
        evmNameService.startProcessing();
        return c.json({ success: true, message: `${restart} processing restarted` });
      }
      
      if (refund) {
        const args = refund.split(",");
        if (args.length >= 2) {
          const address = args[0];
          const path = args[1];
          console.log(`Manual refund triggered for address ${address} with path ${path}`);
          evmNameService.triggerManualRefund(address, path);
          return c.json({ success: true, message: `Manual refund triggered for ${address}` });
        }
      }
    }
    
    // Construct query for @basednames mentions
    const primaryQuery = "@basednames"; // This could be made configurable via env var
    console.log("Primary search query:", primaryQuery);
    
    // Perform the search
    const searchResults = await twitterSearchService.search(primaryQuery, 100);
    
    if (!searchResults || searchResults.length === 0) {
      console.log("No results from primary search or an error occurred.");
      // Still respond, queues might have items from previous runs
      return c.json({
        pendingDeposit: 0,
        activeConversations: 0,
        lastProcessedTimestamp: twitterSearchService.getLastTweetTimestamp(),
        message: "Search yielded no new results or failed."
      });
    }
    
    interface AdaptedTweet {
      id: string;
      text: string;
      author_id?: string;
      created_at?: string;
      timestamp: number;
      conversation_id?: string;
      is_reply: boolean;
      in_reply_to_status_id?: string;
      basename?: string;
    }
    
    // Process search results
    for (const masaTweet of searchResults) {
      const adaptedTweet: AdaptedTweet = {
        id: masaTweet.ExternalID || masaTweet.ID.toString(),
        text: masaTweet.Content,
        author_id: masaTweet.Metadata?.author || masaTweet.Metadata?.user_id,
        created_at: masaTweet.Metadata?.created_at,
        timestamp: masaTweet.Metadata?.created_at 
          ? new Date(masaTweet.Metadata.created_at).getTime() / 1000 
          : 0,
        conversation_id: masaTweet.Metadata?.conversation_id,
        is_reply: masaTweet.Metadata?.IsReply || (masaTweet.Metadata?.InReplyToStatusID ? true : false),
        in_reply_to_status_id: masaTweet.Metadata?.InReplyToStatusID,
      };
      
      // Skip tweets missing crucial fields
      if (!adaptedTweet.author_id || !adaptedTweet.timestamp || !adaptedTweet.conversation_id) {
        console.warn(`Tweet missing crucial fields, skipping: ${adaptedTweet.id}`);
        continue;
      }
      
      // Check conversation state
      const conversationState = evmNameService.getConversationState(adaptedTweet.conversation_id);
      
      // Skip tweets in conversations that are already in a terminal state
      if (conversationState && [
        "resolved", 
        "error_max_attempts", 
        "error_invalid_basename", 
        "error_unavailable_basename"
      ].includes(conversationState.status)) {
        console.log(`Conversation ${adaptedTweet.conversation_id} already in terminal state (${conversationState.status}), skipping tweet ${adaptedTweet.id}`);
        continue;
      }
      
      // Skip tweets that have already been processed
      if (conversationState && conversationState.lastProcessedTweetId === adaptedTweet.id) {
        console.log(`Tweet ${adaptedTweet.id} already processed for conversation ${adaptedTweet.conversation_id}, skipping`);
        continue;
      }
      
      // Extract basename from tweet text
      const basenameMatch = adaptedTweet.text.match(/[a-zA-Z0-9]{3,}\.base\.eth/gim);
      adaptedTweet.basename = basenameMatch?.[0]?.toLowerCase().split(".base.eth")[0];
      
      if (!adaptedTweet.basename) {
        console.log(`Tweet ${adaptedTweet.id} does not contain a valid basename pattern, skipping`);
        
        // Send a generic reply if no basename found
        await twitterSearchService.reply(
          "I'm good",
          { id: adaptedTweet.id, author_id: adaptedTweet.author_id }
        );
        
        // Update conversation state if it's a known conversation
        if (conversationState) {
          evmNameService.updateConversationState(adaptedTweet.conversation_id, {
            lastProcessedTweetId: adaptedTweet.id
          });
        }
        
        continue;
      }
      
      // Process the registration request
      console.log(`Processing registration request for basename: ${adaptedTweet.basename}`);
      await evmNameService.processRegistrationRequest({
        id: adaptedTweet.id,
        author_id: adaptedTweet.author_id,
        conversation_id: adaptedTweet.conversation_id,
        basename: adaptedTweet.basename
      });
    }
    
    // Return status information
    return c.json({
      success: true,
      pendingDeposit: 0, // This would need to be exposed by evmNameService
      activeConversations: 0, // This would need to be exposed by evmNameService
      lastProcessedTimestamp: twitterSearchService.getLastTweetTimestamp()
    });
    
  } catch (error) {
    console.error("Error in search endpoint:", error);
    return c.json({ 
      error: "Search operation failed", 
      details: (error as Error).message 
    }, 500);
  }
});

/**
 * Get refunded items
 */
router.get("/refunds", async (c) => {
  try {
    const refunds = evmNameService.getRefundedItems();
    return c.json({ refunds });
  } catch (error) {
    console.error("Error fetching refunds:", error);
    return c.json({ 
      error: "Failed to fetch refunds", 
      details: (error as Error).message 
    }, 500);
  }
});

export default router;
