import { describe, it, expect } from 'vitest';
import {
  CeloAttributionService,
  OFFICIAL_CELO_ATTRIBUTION_TAG,
  REQUIRED_CELO_CHAIN_ID,
  ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
  AttributionError
} from '../src/server/services/celoAttributionService.js';
import { fromDataSuffix, ERC_8021_MARKER } from '@celo/attribution-tags';
import { encodeFunctionData, parseAbi } from 'viem';
import { loadConfig } from '../src/server/config.js';

describe('Celo Attribution & Transaction Tagging (ERC-8021)', () => {
  const service = new CeloAttributionService();
  const validAgentWallet = '0x3e1bef07824cd0E076F4907641F0A0EF27898e52';

  it('uses the exact official hackathon attribution tag', () => {
    expect(service.getOfficialTag()).toBe('celo_235f6ef56f5b');
    expect(OFFICIAL_CELO_ATTRIBUTION_TAG).toBe('celo_235f6ef56f5b');
  });

  it('rejects initialization with unauthorized or substituted tag', () => {
    expect(() => new CeloAttributionService('celo_unauthorized_tag')).toThrowError(
      /does not match official hackathon tag/
    );
  });

  it('appends verified ERC-8021 data suffix to outgoing Celo Mainnet transaction', () => {
    const prepared = service.prepareTaggedTransaction({
      to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
      from: validAgentWallet,
      value: 0n,
      data: '0x12345678',
      chainId: 42220
    });

    expect(prepared.chainId).toBe(42220);
    expect(prepared.attributionTag).toBe('celo_235f6ef56f5b');
    expect(prepared.data.startsWith('0x12345678')).toBe(true);

    // Verify ERC-8021 marker is present at the end of the calldata
    const decoded = fromDataSuffix(prepared.data);
    expect(decoded.codes).toContain('celo_235f6ef56f5b');
    expect(prepared.verifiedCodes).toContain('celo_235f6ef56f5b');
  });

  it('preserves base calldata and contract parameters without corruption', () => {
    const abi = parseAbi(['function swap(address tokenIn, uint256 amountIn) returns (uint256)']);
    const originalCalldata = encodeFunctionData({
      abi,
      functionName: 'swap',
      args: ['0xcebA9300f2b948710d2653dD7B07f33A8B32118C', 1000000n]
    });

    const prepared = service.prepareTaggedTransaction({
      to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
      data: originalCalldata,
      chainId: 42220
    });

    // Original calldata is strictly preserved as prefix
    expect(prepared.data.startsWith(originalCalldata)).toBe(true);

    // Suffix is appended after original calldata
    const suffix = service.getDataSuffix();
    expect(prepared.data.endsWith(suffix.slice(2))).toBe(true);
  });

  it('tags empty calldata transactions safely', () => {
    const prepared = service.prepareTaggedTransaction({
      to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
      chainId: 42220
    });

    const suffix = service.getDataSuffix();
    expect(prepared.data).toBe(suffix);
    const decoded = fromDataSuffix(prepared.data);
    expect(decoded.codes).toContain('celo_235f6ef56f5b');
  });

  it('rejects transactions targeting wrong chain IDs (non-42220)', () => {
    expect(() =>
      service.prepareTaggedTransaction({
        to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
        chainId: 1 // Ethereum Mainnet
      })
    ).toThrowError(/strictly requires Celo Mainnet \(42220\)/);

    expect(() =>
      service.prepareTaggedTransaction({
        to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
        chainId: 44787 // Alfajores Testnet
      })
    ).toThrowError(/strictly requires Celo Mainnet \(42220\)/);
  });

  it('rejects transactions with invalid or malformed recipient address', () => {
    expect(() =>
      service.prepareTaggedTransaction({
        // @ts-expect-error testing invalid address
        to: 'not-an-address',
        chainId: 42220
      })
    ).toThrowError(/Invalid or missing destination address/);
  });

  it('builds valid tagged ERC-8004 identity registration transaction', () => {
    const regTx = service.buildErc8004RegistrationTransaction({
      agentURI: 'https://revertlens.onrender.com/api/agent/metadata',
      from: validAgentWallet
    });

    expect(regTx.to.toLowerCase()).toBe(ERC8004_IDENTITY_REGISTRY_CELO_MAINNET.toLowerCase());
    expect(regTx.chainId).toBe(REQUIRED_CELO_CHAIN_ID);
    expect(regTx.value).toBe(0n);
    expect(regTx.attributionTag).toBe('celo_235f6ef56f5b');

    // Check function selector for register(string) (0xf2c298be)
    expect(regTx.data.startsWith('0xf2c298be')).toBe(true);

    // Verify ERC-8021 tag is present in the calldata
    const decoded = fromDataSuffix(regTx.data);
    expect(decoded.codes).toContain('celo_235f6ef56f5b');
  });

  it('generates compliant ERC-8004 agent metadata payload', () => {
    const metadata = service.generateErc8004Metadata({
      agentWallet: validAgentWallet,
      baseUrl: 'https://revertlens.onrender.com'
    });

    expect(metadata.name).toBe('RevertLens');
    expect(metadata.chainId).toBe(42220);
    expect(metadata.network).toBe('Celo Mainnet');
    expect(metadata.agentWallet).toBe(validAgentWallet);
    expect(metadata.attributionTag).toBe('celo_235f6ef56f5b');
    expect(metadata.services.length).toBeGreaterThanOrEqual(2);
    expect(metadata.supportedTrust).toContain('erc8004-identity-v1');
  });

  it('strictly protects read-only RPC calls from attribution suffix injection', () => {
    const readOnlyPayload = '0x12345678' + ERC_8021_MARKER;
    expect(() =>
      CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', readOnlyPayload)
    ).toThrowError(/Attempted to inject attribution data suffix into read-only RPC method/);

    expect(() =>
      CeloAttributionService.assertReadOnlyRpcUntagged('debug_traceTransaction', readOnlyPayload)
    ).toThrowError(/Attempted to inject attribution data suffix into read-only RPC method/);

    // Normal payload should pass without exception
    expect(() =>
      CeloAttributionService.assertReadOnlyRpcUntagged('eth_call', '0x12345678')
    ).not.toThrow();
  });

  it('keeps the same agent wallet configured consistently in AppConfig', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.AGENT_WALLET_ADDRESS).toBe('0x3e1bef07824cd0E076F4907641F0A0EF27898e52');
    expect(config.CELO_ATTRIBUTION_TAG).toBe('celo_235f6ef56f5b');
  });
});
