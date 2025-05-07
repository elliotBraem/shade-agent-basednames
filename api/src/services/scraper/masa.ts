import { sleep } from "../../utils/common.js";

// Define interfaces for the Masa API client
export interface MasaSearchResult {
  ID: string;
  ExternalID: string;
  Content: string;
  Metadata: {
    author?: string;
    user_id?: string;
    created_at?: string;
    conversation_id?: string;
    IsReply?: boolean;
    InReplyToStatusID?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface MasaSearchOptions {
  query: string;
  maxResults?: number;
  sinceDate?: string;
}

/**
 * Client for interacting with the Masa API for social media scraping.
 */
export class MasaClient {
  private apiKey: string;
  private baseUrl: string;
  private pollingInterval: number;
  private maxPolls: number;

  constructor() {
    this.apiKey = process.env.MASA_API_KEY || "";
    this.baseUrl = process.env.MASA_BASE_URL || "https://data.dev.masalabs.ai/api/v1";
    this.pollingInterval = 10000; // 10 seconds
    this.maxPolls = 30; // Max 30 polls (5 minutes)
    
    if (!this.apiKey) {
      console.warn("MASA_API_KEY environment variable is not set. Masa API calls will fail.");
    }
  }

  /**
   * Search for content on Twitter.
   * @param options Search options including query, maxResults, and sinceDate.
   * @returns Promise resolving to an array of search results.
   */
  async search(options: MasaSearchOptions): Promise<MasaSearchResult[]> {
    const { query, maxResults = 100 } = options;
    
    if (!this.apiKey) {
      throw new Error("Masa API key not configured.");
    }
    
    console.log(`Searching Twitter with query: "${query}", maxResults: ${maxResults}`);
    
    // Submit search job
    const uuid = await this.submitSearchJob(query, maxResults);
    if (!uuid) {
      console.error("Failed to submit search job");
      return [];
    }
    
    // Poll for job completion
    let polls = 0;
    while (polls < this.maxPolls) {
      await sleep(this.pollingInterval);
      const status = await this.checkJobStatus(uuid);
      
      if (status === "done") {
        return await this.getJobResults(uuid) || [];
      }
      
      if (status === "error" || status === null || status === "error(fetching_status)") {
        console.error(`Masa job ${uuid} failed or status check error.`);
        return [];
      }
      
      // For 'processing' or 'error(retrying)', continue polling
      polls++;
    }
    
    console.error(`Masa job ${uuid} timed out after ${this.maxPolls} polls.`);
    return [];
  }

  /**
   * Submit a search job to the Masa API.
   * @param query The search query.
   * @param maxResults Maximum number of results to return.
   * @returns Promise resolving to the UUID of the search job, or null on error.
   */
  private async submitSearchJob(query: string, maxResults: number): Promise<string | null> {
    const url = `${this.baseUrl}/search/live/twitter`;
    const payload = { query, max_results: maxResults };
    
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error submitting Masa search job: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Masa API error: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      if (data.error) {
        console.error("Masa API returned an error on job submission:", data.error);
        return null;
      }
      
      console.log("Masa search job submitted, UUID:", data.uuid);
      return data.uuid;
    } catch (error) {
      console.error("Failed to submit Masa search job:", error);
      return null;
    }
  }

  /**
   * Check the status of a Masa search job.
   * @param uuid The UUID of the search job.
   * @returns Promise resolving to the status of the job.
   */
  private async checkJobStatus(uuid: string): Promise<string | null> {
    const url = `${this.baseUrl}/search/live/twitter/status/${uuid}`;
    
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error checking Masa job status: ${response.status} ${response.statusText}`, errorText);
        return "error(fetching_status)";
      }
      
      const data = await response.json();
      if (data.error && data.status !== "error" && data.status !== "error(retrying)") {
        console.warn("Masa API returned an error message with non-error status:", data.error);
      }
      
      console.log(`Masa job status for ${uuid}: ${data.status}`);
      return data.status;
    } catch (error) {
      console.error("Failed to check Masa job status:", error);
      return "error(fetching_status)";
    }
  }

  /**
   * Retrieve the results of a completed Masa search job.
   * @param uuid The UUID of the search job.
   * @returns Promise resolving to an array of search results, or null on error.
   */
  private async getJobResults(uuid: string): Promise<MasaSearchResult[] | null> {
    const url = `${this.baseUrl}/search/live/twitter/result/${uuid}`;
    
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error retrieving Masa job results: ${response.status} ${response.statusText}`, errorText);
        return null;
      }
      
      const data = await response.json();
      console.log(`Retrieved ${data?.length || 0} results for Masa job ${uuid}`);
      return data;
    } catch (error) {
      console.error("Failed to retrieve Masa job results:", error);
      return null;
    }
  }
}

// Export a singleton instance
export const masaClient = new MasaClient();
