import { config } from "../../config.js";
import { masaClient, MasaSearchResult } from "../scraper/masa.js";
import { replyToTweet } from "../social/crosspost.js";

// Define types for tweets and search results
export type Tweet = MasaSearchResult;

// In-memory cache for search results
interface SearchCacheEntry {
  timestamp: number;
  results: Tweet[];
}

// Constants (these could be moved to environment variables later)
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SEARCH_ONLY = process.env.SEARCH_ONLY === "true" || false; // Default to false if not set

class TwitterSearchService {
  private searchCache: Map<string, SearchCacheEntry>;
  private cacheTtl: number;
  private lastTweetTimestamp: number;

  constructor() {
    this.searchCache = new Map();
    this.cacheTtl = DEFAULT_CACHE_TTL_MS; // Could be made configurable via env var
    this.lastTweetTimestamp = parseInt(process.env.TWITTER_LAST_TIMESTAMP || "0", 10);
  }

  /**
   * Search for tweets using the Masa API.
   * @param query The search query (e.g., "@basednames").
   * @param limit Maximum number of results to return.
   * @param sinceTimestamp Optional timestamp to filter results.
   * @returns Promise resolving to an array of tweets.
   */
  async search(
    query: string,
    limit: number = 100,
    sinceTimestamp?: number
  ): Promise<Tweet[]> {
    // Use provided sinceTimestamp or the last processed timestamp
    const effectiveSinceTimestamp = sinceTimestamp || this.lastTweetTimestamp;
    
    const cacheKey = `${query}:${limit}:${effectiveSinceTimestamp}`;
    const cachedEntry = this.searchCache.get(cacheKey);

    if (cachedEntry && (Date.now() - cachedEntry.timestamp < this.cacheTtl)) {
      console.log(`Returning cached search results for query: ${query}`);
      return cachedEntry.results;
    }

    console.log(`Performing new search for query: ${query}, limit: ${limit}`);
    
    // Construct date filter if we have a timestamp
    let sinceDateFilter = '';
    if (effectiveSinceTimestamp > 0) {
      const sinceDate = new Date((effectiveSinceTimestamp + 1) * 1000);
      sinceDateFilter = sinceDate.toISOString().split('T')[0];
    }
    
    // Use the Masa client to search
    const results = await masaClient.search({
      query,
      maxResults: limit,
      sinceDate: sinceDateFilter || undefined
    });
    
    // Update cache
    this.searchCache.set(cacheKey, { timestamp: Date.now(), results });
    
    // Update lastTweetTimestamp if we found new tweets
    if (results.length > 0) {
      let newLatestTimestamp = this.lastTweetTimestamp;
      
      for (const tweet of results) {
        const tweetTimestamp = tweet.Metadata?.created_at 
          ? new Date(tweet.Metadata.created_at).getTime() / 1000 
          : 0;
          
        if (tweetTimestamp > newLatestTimestamp) {
          newLatestTimestamp = tweetTimestamp;
        }
      }
      
      if (newLatestTimestamp > this.lastTweetTimestamp) {
        console.log(`Updating lastTweetTimestamp from ${this.lastTweetTimestamp} to ${newLatestTimestamp}`);
        this.lastTweetTimestamp = newLatestTimestamp;
        // Note: Persistence of lastTweetTimestamp would need to be handled externally
      }
    }
    
    return results;
  }

  /**
   * Send a reply to a tweet.
   * @param text The text content of the reply.
   * @param tweetContext Context of the tweet to reply to (e.g., { id, author_id }).
   * @param dryRun If true, logs the reply but doesn't actually send it.
   * @returns Promise resolving to the result of the reply operation.
   */
  async reply(
    text: string,
    tweetContext: { id: string; author_id: string; [key: string]: any },
    dryRun: boolean = SEARCH_ONLY
  ): Promise<{ data: { id: string } }> {
    // Use the Crosspost client to reply
    return await replyToTweet(text, tweetContext, dryRun);
  }

  /**
   * Get the last processed tweet timestamp.
   * @returns The timestamp of the last processed tweet.
   */
  getLastTweetTimestamp(): number {
    return this.lastTweetTimestamp;
  }
}

export const twitterSearchService = new TwitterSearchService();
