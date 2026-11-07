import { toDataSuffix, fromDataSuffix, ERC_8021_MARKER } from '@celo/attribution-tags';
import { encodeFunctionData, isAddress, concat, type Hex } from 'viem';

export const OFFICIAL_CELO_ATTRIBUTION_TAG = 'celo_235f6ef56f5b';
export const REQUIRED_CELO_CHAIN_ID = 42220;
export const ERC8004_IDENTITY_REGISTRY_CELO_MAINNET = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
export const ERC8004_REPUTATION_REGISTRY_CELO_MAINNET = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

export const ERC8004_IDENTITY_REGISTRY_ABI = [
  {
    inputs: [{ internalType: 'string', name: 'agentURI', type: 'string' }],
    name: 'register',
    outputs: [{ internalType: 'uint256', name: 'agentId', type: 'uint256' }],
    stateMutability: 'external',
    type: 'function'
  }
] as const;

export interface OutgoingTransactionRequest {
  to: `0x${string}`;
  value?: bigint | string;
  data?: `0x${string}`;
  chainId: number;
  from?: `0x${string}`;
  gasLimit?: bigint | string;
}

export interface TaggedTransactionPayload {
  to: `0x${string}`;
  from?: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
  chainId: 42220;
  gasLimit?: bigint;
  attributionTag: string;
  dataSuffix: `0x${string}`;
  verifiedCodes: string[];
}

export interface Erc8004AgentMetadata {
  type: string;
  name: string;
  description: string;
  image?: string;
  network: string;
  chainId: number;
  agentWallet: `0x${string}`;
  attributionTag: string;
  services: Array<{
    name: string;
    endpoint: string;
    version: string;
  }>;
  supportedTrust: string[];
}

export class AttributionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AttributionError';
  }
}

/**
 * CeloAttributionService
 * 
 * Enforces official ERC-8021 attribution tagging for all outgoing Celo Mainnet transactions.
 * Strict Invariants:
 * 1. Only allows Celo Mainnet (chain ID 42220).
 * 2. Injects the immutable official hackathon tag ('celo_235f6ef56f5b').
 * 3. Never modifies read-only RPC calls (eth_call, eth_getTransactionReceipt, etc.).
 * 4. Verifies the appended data suffix via fromDataSuffix() before returning payload.
 */
export class CeloAttributionService {
  private readonly officialTag: string;

  constructor(customTag?: string) {
    // Preserves exact official hackathon tag
    this.officialTag = customTag || OFFICIAL_CELO_ATTRIBUTION_TAG;
    if (this.officialTag !== OFFICIAL_CELO_ATTRIBUTION_TAG) {
      throw new AttributionError(
        `Attribution tag '${this.officialTag}' does not match official hackathon tag '${OFFICIAL_CELO_ATTRIBUTION_TAG}'.`,
        'INVALID_ATTRIBUTION_TAG'
      );
    }
  }

  public getOfficialTag(): string {
    return this.officialTag;
  }

  public getDataSuffix(): `0x${string}` {
    return toDataSuffix(this.officialTag) as `0x${string}`;
  }

  /**
   * Prepares and cryptographically verifies an outgoing Celo transaction with the official ERC-8021 data suffix.
   */
  public prepareTaggedTransaction(tx: OutgoingTransactionRequest): TaggedTransactionPayload {
    // 1. Validate Chain ID
    if (tx.chainId !== REQUIRED_CELO_CHAIN_ID) {
      throw new AttributionError(
        `Invalid chain ID ${tx.chainId}. Attribution service strictly requires Celo Mainnet (${REQUIRED_CELO_CHAIN_ID}).`,
        'INVALID_CHAIN_ID'
      );
    }

    // 2. Validate 'to' address
    if (!tx.to || !isAddress(tx.to)) {
      throw new AttributionError(`Invalid or missing destination address: '${tx.to}'.`, 'INVALID_RECIPIENT');
    }

    // 3. Validate 'from' address if provided
    if (tx.from && !isAddress(tx.from)) {
      throw new AttributionError(`Invalid sender address: '${tx.from}'.`, 'INVALID_SENDER');
    }

    // 4. Construct Calldata with ERC-8021 suffix
    const baseData: `0x${string}` = tx.data && tx.data.startsWith('0x') ? tx.data : '0x';
    const suffix = this.getDataSuffix();
    const taggedData = concat([baseData, suffix]) as `0x${string}`;

    // 5. Verify Tag is present and decodable in the output calldata
    const decoded = fromDataSuffix(taggedData);
    if (!decoded || !decoded.codes || !decoded.codes.includes(this.officialTag)) {
      throw new AttributionError(
        `Failed to verify attribution tag in tagged calldata. Decoded: ${JSON.stringify(decoded)}`,
        'TAG_VERIFICATION_FAILED'
      );
    }

    const valueBigInt = typeof tx.value === 'bigint' ? tx.value : BigInt(tx.value || '0');
    const gasLimitBigInt = tx.gasLimit ? (typeof tx.gasLimit === 'bigint' ? tx.gasLimit : BigInt(tx.gasLimit)) : undefined;

    return {
      to: tx.to,
      from: tx.from,
      value: valueBigInt,
      data: taggedData,
      chainId: REQUIRED_CELO_CHAIN_ID,
      gasLimit: gasLimitBigInt,
      attributionTag: this.officialTag,
      dataSuffix: suffix,
      verifiedCodes: decoded.codes
    };
  }

  /**
   * Builds an ERC-8004 Identity Registration transaction tagged with the official attribution code.
   */
  public buildErc8004RegistrationTransaction(params: {
    agentURI: string;
    from?: `0x${string}`;
    registryAddress?: `0x${string}`;
  }): TaggedTransactionPayload {
    if (!params.agentURI || typeof params.agentURI !== 'string' || params.agentURI.trim().length === 0) {
      throw new AttributionError('agentURI must be a non-empty URI string.', 'INVALID_AGENT_URI');
    }

    const registry = params.registryAddress || (ERC8004_IDENTITY_REGISTRY_CELO_MAINNET as `0x${string}`);
    if (!isAddress(registry)) {
      throw new AttributionError(`Invalid registry address: '${registry}'.`, 'INVALID_REGISTRY_ADDRESS');
    }

    // Encode register(string agentURI)
    const calldata = encodeFunctionData({
      abi: ERC8004_IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [params.agentURI.trim()]
    });

    return this.prepareTaggedTransaction({
      to: registry,
      from: params.from,
      value: 0n,
      data: calldata,
      chainId: REQUIRED_CELO_CHAIN_ID,
      gasLimit: 350000n // Conservative estimated limit for ERC-721 mint on Celo
    });
  }

  /**
   * Generates standard ERC-8004 agent registration metadata.
   */
  public generateErc8004Metadata(params: {
    agentWallet: `0x${string}`;
    baseUrl: string;
  }): Erc8004AgentMetadata {
    if (!params.agentWallet || !isAddress(params.agentWallet)) {
      throw new AttributionError(`Invalid agent wallet address: '${params.agentWallet}'.`, 'INVALID_AGENT_WALLET');
    }

    const cleanBaseUrl = params.baseUrl.replace(/\/+$/, '');

    return {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: 'RevertLens',
      description: 'Evidence-backed forensic investigation of failed Celo transactions, including execution traces, revert reasons, causal propagation analysis and evidence-led reports.',
      image: `${cleanBaseUrl}/assets/revertlens-banner.png`,
      network: 'Celo Mainnet',
      chainId: REQUIRED_CELO_CHAIN_ID,
      agentWallet: params.agentWallet,
      attributionTag: this.officialTag,
      services: [
        {
          name: 'RevertLens Investigation API',
          endpoint: `${cleanBaseUrl}/api/investigations`,
          version: '1.0.0'
        },
        {
          name: 'RevertLens Public Health Check',
          endpoint: `${cleanBaseUrl}/api/health`,
          version: '1.0.0'
        },
        {
          name: 'RevertLens Agent Metadata',
          endpoint: `${cleanBaseUrl}/api/agent/metadata`,
          version: '1.0.0'
        }
      ],
      supportedTrust: ['erc8004-identity-v1']
    };
  }

  /**
   * Asserts that read-only RPC requests are strictly protected from modification.
   * Throws an error if any caller attempts to apply attribution tags to read-only RPC calls.
   */
  public static assertReadOnlyRpcUntagged(method: string, payload: unknown): void {
    const readOnlyMethods = [
      'eth_call',
      'eth_getBalance',
      'eth_getCode',
      'eth_getTransactionByHash',
      'eth_getTransactionReceipt',
      'eth_blockNumber',
      'eth_chainId',
      'debug_traceTransaction'
    ];

    if (readOnlyMethods.includes(method)) {
      if (typeof payload === 'string' && payload.includes(ERC_8021_MARKER)) {
        throw new AttributionError(
          `Violation: Attempted to inject attribution data suffix into read-only RPC method '${method}'.`,
          'ILLEGAL_READ_ONLY_TAGGING'
        );
      }
    }
  }
}
