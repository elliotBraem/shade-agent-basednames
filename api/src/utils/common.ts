/**
 * Utility functions for common operations
 */

/**
 * Sleep for the specified number of milliseconds
 * @param ms Number of milliseconds to sleep
 * @returns Promise that resolves after the specified time
 */
export const sleep = (ms: number): Promise<void> => 
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch JSON from a URL with optional parameters
 * @param url URL to fetch from
 * @param params Optional fetch parameters
 * @param noWarnings If true, suppresses warning logs
 * @returns Promise resolving to the JSON response, or undefined on error
 */
export const fetchJson = async (
  url: string, 
  params: RequestInit = {}, 
  noWarnings = false
): Promise<any> => {
  try {
    const res = await fetch(url, params);
    if (res.status !== 200) {
      if (noWarnings) return;
      console.log('Response error:', res.status, res.statusText);
      console.log(await res.text());
      throw new Error(`HTTP error: ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    if (noWarnings) return;
    console.log('fetchJson error:', e);
    return undefined;
  }
};
