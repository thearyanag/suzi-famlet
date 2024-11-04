import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import axios from 'axios';
import { BigNumber } from 'bignumber.js';
import NodeCache from 'node-cache';

// Types for token metadata
interface TokenMetadata {
  updateAuthority: string;
  creators?: Array<{
    address: string;
    verified: boolean;
    share: number;
  }>;
}

// Types for token data
interface TokenSupply {
  amount: string;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
}

interface TokenHolder {
  publicKey: string;
  amount: bigint;
  percentage: string;
}

interface PriceData {
  price: number;
  timestamp: number;
}

interface MarketPair {
  dexId: string;
  url?: string;
  priceUsd?: string;
  volume?: {
    h24?: number;
  };
  boosts?: {
    active: boolean;
  };
  liquidity?: {
    usd?: number;
  };
}

interface TokenReport {
  tokenAddress: string;
  totalSupply: bigint;
  decimals: number;
  owner?: TokenHolder;
  creator?: TokenHolder;
  top10Holders: TokenHolder[];
  totalHolders: number;
  priceData?: PriceData;
  marketPairs: MarketPair[];
}

export default class TokenReportGenerator {
  private connection: Connection;
  private tokenPublicKey: PublicKey;
  private cache: NodeCache;

  constructor(
    tokenAddress: string,
    cache: NodeCache,
    rpcUrl: string = 'https://api.mainnet-beta.solana.com'
  ) {
    this.connection = new Connection(rpcUrl);
    this.tokenPublicKey = new PublicKey(tokenAddress);
    this.cache = cache;
  }

  private calculatePercentage(amount: bigint, total: bigint): string {
    return total > BigInt(0)
      ? (Number(amount * BigInt(10000) / total) / 100).toFixed(2)
      : '0.00';
  }

  private async getMetadataPDA(): Promise<TokenMetadata | null> {
    try {
      const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          this.tokenPublicKey.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      const accountInfo = await this.connection.getAccountInfo(metadataPDA);
      if (!accountInfo) return null;

      // Basic parsing of metadata account data
      // Note: This is a simplified version. In production, you'd want to use proper
      // borsh deserialization for the full metadata structure
      const updateAuthorityStart = 1 + 32; // After key and mint
      const updateAuthority = new PublicKey(accountInfo.data.slice(updateAuthorityStart, updateAuthorityStart + 32));

      // Return basic metadata
      return {
        updateAuthority: updateAuthority.toBase58(),
      };
    } catch (error) {
      console.error('Error fetching metadata:', error);
      return null;
    }
  }

  private async getAllHolders(): Promise<TokenHolder[]> {
    const accounts = await this.connection.getProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        filters: [
          { dataSize: 165 },
          {
            memcmp: {
              offset: 0,
              bytes: this.tokenPublicKey.toBase58(),
            },
          },
        ],
      }
    );

    const holders = new Map<string, bigint>();

    accounts.forEach(account => {
      const data = account.account.data;
      const amount = BigInt(
        new DataView(data.buffer, data.byteOffset + 64, 8)
          .getBigUint64(0, true)
          .toString()
      );
      const owner = new PublicKey(data.slice(32, 64)).toBase58();

      holders.set(
        owner,
        (holders.get(owner) || BigInt(0)) + amount
      );
    });

    return Array.from(holders.entries())
      .map(([publicKey, amount]) => ({
        publicKey,
        amount,
        percentage: '0' // Will be calculated later
      }))
      .sort((a, b) => Number(b.amount - a.amount));
  }

  private async getPriceData(): Promise<PriceData | undefined> {
    try {
      const response = await axios.get(
        `https://api.jup.ag/price/v2?ids=${this.tokenPublicKey.toBase58()}`
      );
      const data = response.data.data[this.tokenPublicKey.toBase58()];
      return {
        price: data.price,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Failed to fetch price data:', error);
      return undefined;
    }
  }

  private async getMarketPairs(): Promise<MarketPair[]> {
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${this.tokenPublicKey.toBase58()}`
      );
      return response.data.pairs || [];
    } catch (error) {
      console.error('Failed to fetch market pairs:', error);
      return [];
    }
  }

  public async generateReport(): Promise<TokenReport> {
    // Get token supply and decimals
    const { value: tokenSupply } = await this.connection.getTokenSupply(this.tokenPublicKey);
    const totalSupply = BigInt(tokenSupply.amount);
    const decimals = tokenSupply.decimals;

    console.log("Fetched value and total supply")

    // Get metadata
    const metadata = await this.getMetadataPDA();

    console.log("Fetched token metadata")
    
    // Get all holders
    const holders = await this.getAllHolders();

    console.log("Fetched all holders")

    // Calculate percentages for all holders
    holders.forEach(holder => {
      holder.percentage = this.calculatePercentage(holder.amount, totalSupply);
    });

    console.log("Calculated percentages for all holders")

    // Get owner and creator from holders if metadata exists
    let owner: TokenHolder | undefined;
    let creator: TokenHolder | undefined;

    if (metadata) {
      owner = holders.find(h => h.publicKey === metadata.updateAuthority);
      
      if (metadata.creators && metadata.creators.length > 0) {
        creator = holders.find(h => h.publicKey === metadata.creators?.[0]?.address);
      }
    }

    console.log("Fetched owner and creator")

    // Get top 10 holders
    const top10Holders = holders.slice(0, 10);

    console.log("Fetched top 10 holders")

    // Get price and market data
    const [priceData, marketPairs] = await Promise.all([
      this.getPriceData(),
      this.getMarketPairs()
    ]);

    console.log("Fetched price and market data")

    return {
      tokenAddress: this.tokenPublicKey.toBase58(),
      totalSupply,
      decimals,
      owner,
      creator,
      top10Holders,
      totalHolders: holders.length,
      priceData,
      marketPairs
    };
  }

  public async generateReportString(): Promise<string> {
    const report = await this.generateReport();
    let output = `Token Report for ${report.tokenAddress}\n\n`;
    
    output += `Total Supply: ${new BigNumber(report.totalSupply.toString())
      .dividedBy(10 ** report.decimals).toFixed()}\n`;
    
    if (report.owner) {
      output += `Owner Address: ${report.owner.publicKey}\n`;
      output += `Owner Balance: ${new BigNumber(report.owner.amount.toString())
        .dividedBy(10 ** report.decimals).toFixed()}\n`;
      output += `Owner Percentage: ${report.owner.percentage}%\n`;
    } else {
      output += `Owner Information: Not available\n`;
    }
    
    if (report.creator) {
      output += `Creator Address: ${report.creator.publicKey}\n`;
      output += `Creator Balance: ${new BigNumber(report.creator.amount.toString())
        .dividedBy(10 ** report.decimals).toFixed()}\n`;
      output += `Creator Percentage: ${report.creator.percentage}%\n`;
    } else {
      output += `Creator Information: Not available\n`;
    }
    
    output += `\nTop 10 Holders:\n`;
    report.top10Holders.forEach((holder, index) => {
      output += `${index + 1}. ${holder.publicKey}: ${new BigNumber(holder.amount.toString())
        .dividedBy(10 ** report.decimals).toFixed()} (${holder.percentage}%)\n`;
    });
    
    output += `\nTotal Holders: ${report.totalHolders}\n`;
    
    if (report.priceData) {
      output += `\nCurrent Price: $${report.priceData.price.toFixed(6)}\n`;
    }
    
    if (report.marketPairs.length > 0) {
      output += '\nMarket Pairs:\n';
      report.marketPairs.forEach((pair, index) => {
        output += `\nPair ${index + 1}:\n`;
        output += `- DEX: ${pair.dexId || 'Unknown'}\n`;
        output += `- URL: ${pair.url || 'N/A'}\n`;
        output += `- Price USD: ${pair.priceUsd ? `$${pair.priceUsd}` : 'N/A'}\n`;
        output += `- Volume (24h): ${pair.volume?.h24 ? `$${pair.volume.h24.toFixed(2)}` : 'N/A'}\n`;
        output += `- Liquidity USD: ${pair.liquidity?.usd ? `$${pair.liquidity.usd.toFixed(2)}` : 'N/A'}\n`;
      });
    }
    
    return output;
  }
}
