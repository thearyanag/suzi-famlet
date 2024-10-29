import axios from 'axios';
import NodeCache from 'node-cache';

interface TokenProfile {
    url: string;
    chainId: string;
    tokenAddress: string;
    icon: string;
    header: string;
    openGraph: string;
    description: string;
    links: Array<{
        type?: string;
        label?: string;
        url: string;
    }>;
}

interface HolderData {
    address: string;
    balance: string;
}

class TokenProvider {
    private apiUrl: string = 'https://api.dexscreener.com/token-profiles/latest/v1';
    public token_address: string;
    private cache: NodeCache;

    constructor(token_address: string) {
        this.token_address = token_address;
        // Initialize NodeCache with a default TTL of 1 hour and check period of 10 minutes
        this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
    }

    /**
     * Fetches token profiles from the API and returns an array of token addresses for the Solana chain.
     */
    public async getSolanaTokenAddresses(): Promise<string[]> {
        try {
            const response = await axios.get<TokenProfile[]>(this.apiUrl);
            const solanaTokens = response.data.filter(token => token.chainId.toLowerCase() === 'solana');
            const solanaTokenAddresses = solanaTokens.map(token => token.tokenAddress);
            return solanaTokenAddresses;
        } catch (error) {
            console.error('Error fetching token profiles:', error);
            return [];
        }
    }

    /**
     * Fetches the list of holders for the given token address using the Helius API.
     * Implements caching to improve efficiency and reduce redundant API calls.
     */
    public async fetchHolderList(): Promise<HolderData[]> {
        const cacheKey = `holderList_${this.token_address}`;
        const cachedData = this.getCachedData<HolderData[]>(cacheKey);
        if (cachedData) {
            console.log("Returning cached holder list.");
            return cachedData;
        }

        const allHoldersMap = new Map<string, number>();
        let page = 1;
        const limit = 1000;
        let cursor: string | undefined;
        const heliusApiKey = process.env.HELIOUS_API_KEY || ""; // Ensure you have your API key in environment variables
        const url = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
        console.log({ url });

        try {
            while (true) {
                const params: any = {
                    limit: limit,
                    displayOptions: {},
                    mint: this.token_address,
                    cursor: cursor,
                };
                if (cursor) {
                    params.cursor = cursor;
                }
                console.log(`Fetching holders - Page ${page}`);

                // Optional: Remove or adjust the page limit as needed
                if (page > 100) { // Example limit to prevent excessive paging
                    console.warn(`Page limit reached at ${page}. Stopping fetch.`);
                    break;
                }

                const response = await axios.post(url, {
                    jsonrpc: "2.0",
                    id: "helius-fetch-holders",
                    method: "getTokenAccounts",
                    params: params,
                }, {
                    headers: {
                        "Content-Type": "application/json",
                    },
                });

                const data = response.data;

                if (
                    !data ||
                    !data.result ||
                    !data.result.token_accounts ||
                    data.result.token_accounts.length === 0
                ) {
                    console.log(
                        `No more holders found. Total pages fetched: ${page - 1}`
                    );
                    break;
                }

                console.log(
                    `Processing ${data.result.token_accounts.length} holders from page ${page}`
                );

                data.result.token_accounts.forEach((account: any) => {
                    const owner = account.owner;
                    const balance = parseFloat(account.amount);

                    if (allHoldersMap.has(owner)) {
                        allHoldersMap.set(owner, allHoldersMap.get(owner)! + balance);
                    } else {
                        allHoldersMap.set(owner, balance);
                    }
                });
                cursor = data.result.cursor;
                page++;
            }

            const holders: HolderData[] = Array.from(allHoldersMap.entries()).map(
                ([address, balance]) => ({
                    address,
                    balance: balance.toString(),
                })
            );

            console.log(`Total unique holders fetched: ${holders.length}`);

            // Cache the result with a TTL of 1 hour (3600 seconds)
            this.setCachedData(cacheKey, holders, 3600);

            return holders;
        } catch (error) {
            console.error("Error fetching holder list from Helius:", error);
            throw new Error("Failed to fetch holder list from Helius.");
        }
    }

    /**
     * Retrieves cached data for a given key.
     * @param key The cache key.
     * @returns The cached data or undefined if not found.
     */
    private getCachedData<T>(key: string): T | undefined {
        return this.cache.get<T>(key);
    }

    /**
     * Caches data with a given key and TTL.
     * @param key The cache key.
     * @param data The data to cache.
     * @param ttl Time To Live in seconds.
     */
    private setCachedData<T>(key: string, data: T, ttl?: number): void {
        if (ttl) {
            this.cache.set(key, data, ttl);
        } else {
            this.cache.set(key, data);
        }
    }
}

export default TokenProvider;
