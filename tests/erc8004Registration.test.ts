import { describe, it, expect } from 'vitest';
import {
  CeloAttributionService,
  OFFICIAL_CELO_ATTRIBUTION_TAG,
  REQUIRED_CELO_CHAIN_ID,
  OFFICIAL_AGENT_WALLET_ADDRESS,
  ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
  ERC8004_REGISTER_FUNCTION_SELECTOR,
  ERC8004_REGISTERED_EVENT_TOPIC,
  ERC721_TRANSFER_EVENT_TOPIC,
  validateErc8004Metadata,
  verifyErc8004RegistrationReceipt,
  AttributionError,
  ERC8004_IDENTITY_REGISTRY_ABI
} from '../src/server/services/celoAttributionService.js';
import { encodeAbiParameters, decodeFunctionData, pad, toHex, type Hex } from 'viem';
import { loadConfig } from '../src/server/config.js';
import { buildApp } from '../src/server/app.js';

describe('MOD-05A: ERC-8004 Registration Preparation & Verification Suite', () => {
  const service = new CeloAttributionService();
  const validWallet = OFFICIAL_AGENT_WALLET_ADDRESS;
  const validRegistry = ERC8004_IDENTITY_REGISTRY_CELO_MAINNET;

  // =========================================================================
  // 1. Metadata Generation & Strict Schema Validation
  // =========================================================================
  describe('1. Metadata Generation & Strict Schema Validation', () => {
    it('generates valid EIP-8004 metadata for official parameters', () => {
      const metadata = service.generateErc8004Metadata({
        agentWallet: validWallet,
        baseUrl: 'https://revertlens.example.com'
      });

      expect(metadata.name).toBe('RevertLens');
      expect(metadata.network).toBe('Celo Mainnet');
      expect(metadata.chainId).toBe(REQUIRED_CELO_CHAIN_ID);
      expect(metadata.agentWallet).toBe(validWallet);
      expect(metadata.attributionTag).toBe(OFFICIAL_CELO_ATTRIBUTION_TAG);
      expect(metadata.services.length).toBe(3);
      expect(metadata.supportedTrust).toContain('erc8004-identity-v1');

      const validation = validateErc8004Metadata(metadata);
      expect(validation.valid).toBe(true);
      expect(validation.data).toBeDefined();
    });

    it('rejects invalid or non-URL base URLs during metadata generation', () => {
      expect(() =>
        service.generateErc8004Metadata({
          agentWallet: validWallet,
          baseUrl: 'not-a-valid-url'
        })
      ).toThrow(AttributionError);

      expect(() =>
        service.generateErc8004Metadata({
          agentWallet: validWallet,
          baseUrl: 'ftp://revertlens.example.com'
        })
      ).toThrow(AttributionError);
    });

    it('rejects invalid or malformed wallet address during metadata generation', () => {
      expect(() =>
        service.generateErc8004Metadata({
          agentWallet: '0xinvalid' as any,
          baseUrl: 'https://revertlens.example.com'
        })
      ).toThrow(AttributionError);
    });

    it('rejects metadata with extra or fabricated fields (strict schema validation)', () => {
      const validMeta = service.generateErc8004Metadata({
        agentWallet: validWallet,
        baseUrl: 'https://revertlens.example.com'
      });

      const fabricatedMeta = {
        ...validMeta,
        agentId: '42', // Fabricated agent ID
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      };

      const result = validateErc8004Metadata(fabricatedMeta);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Unrecognized key(s)');
      expect(result.reason).toContain('agentId');
    });

    it('rejects metadata with wrong network or chainId', () => {
      const validMeta = service.generateErc8004Metadata({
        agentWallet: validWallet,
        baseUrl: 'https://revertlens.example.com'
      });

      const wrongChain = { ...validMeta, chainId: 1 };
      expect(validateErc8004Metadata(wrongChain).valid).toBe(false);

      const wrongNetwork = { ...validMeta, network: 'Ethereum' };
      expect(validateErc8004Metadata(wrongNetwork).valid).toBe(false);
    });
  });

  // =========================================================================
  // 2. Transaction Builder & Calldata Invariants
  // =========================================================================
  describe('2. Transaction Builder & Calldata Invariants', () => {
    it('builds transaction targeting official ERC-8004 identity registry', () => {
      const tx = service.buildErc8004RegistrationTransaction({
        agentURI: 'https://revertlens.example.com/api/agent/metadata',
        from: validWallet
      });

      expect(tx.to).toBe(validRegistry);
      expect(tx.from).toBe(validWallet);
      expect(tx.chainId).toBe(REQUIRED_CELO_CHAIN_ID);
      expect(tx.value).toBe(0n);
      expect(tx.gasLimit).toBe(350000n);
    });

    it('uses exact register(string agentURI) function selector 0xf2c298be', () => {
      const tx = service.buildErc8004RegistrationTransaction({
        agentURI: 'https://revertlens.example.com/api/agent/metadata',
        from: validWallet
      });

      expect(tx.data.startsWith(ERC8004_REGISTER_FUNCTION_SELECTOR)).toBe(true);
    });

    it('embeds canonical agent URI and official attribution tag suffix', () => {
      const canonicalUri = 'https://revertlens.example.com/api/agent/metadata';
      const tx = service.buildErc8004RegistrationTransaction({
        agentURI: canonicalUri,
        from: validWallet
      });

      // Strip ERC-8021 suffix (35 bytes = 70 hex characters)
      const baseCalldata = tx.data.slice(0, tx.data.length - 70) as `0x${string}`;
      const decoded = decodeFunctionData({
        abi: ERC8004_IDENTITY_REGISTRY_ABI,
        data: baseCalldata
      });

      expect(decoded.functionName).toBe('register');
      expect(decoded.args[0]).toBe(canonicalUri);

      // Verify attribution suffix
      const attrCheck = service.hasExpectedAttribution(tx.data);
      expect(attrCheck.status).toBe('TAGGED_CORRECTLY');
      expect(attrCheck.hasExpectedTag).toBe(true);
    });
  });

  // =========================================================================
  // 3. Safe Preview Endpoint & Readiness State
  // =========================================================================
  describe('3. Safe Preview Endpoint (/api/agent/erc8004-registration-tx)', () => {
    it('returns BLOCKED_PENDING_PUBLIC_DEPLOYMENT when hosted on localhost', async () => {
      const localApp = buildApp(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_PATH: ':memory:',
          PUBLIC_BASE_URL: 'http://localhost:3000'
        })
      );

      const res = await localApp.inject({
        method: 'GET',
        url: '/api/agent/erc8004-registration-tx'
      });
      await localApp.close();

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      const data = json.data;

      expect(data.network).toBe('Celo Mainnet');
      expect(data.chainId).toBe(REQUIRED_CELO_CHAIN_ID);
      expect(data.registryAddress).toBe(validRegistry);
      expect(data.agentWallet).toBe(validWallet);
      expect(data.registrationFunction).toBe('register(string agentURI)');
      expect(data.functionSelector).toBe(ERC8004_REGISTER_FUNCTION_SELECTOR);
      expect(data.metadataUriStatus).toBe('BLOCKED_PENDING_PUBLIC_DEPLOYMENT');
      expect(data.readinessStatus).toBe('BLOCKED_PENDING_PUBLIC_DEPLOYMENT');
      expect(data.agentId).toBeNull();
      expect(data.onChainRegistrationStatus).toBe('PREPARED_NOT_REGISTERED');
      expect(data.gasEstimate.gasLimit).toBe('350000');
    });

    it('returns READY_FOR_OPERATOR_SIGNATURE when configured with a public HTTPS URL', async () => {
      const publicApp = buildApp(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_PATH: ':memory:',
          PUBLIC_BASE_URL: 'https://revertlens.example.com'
        })
      );

      const res = await publicApp.inject({
        method: 'GET',
        url: '/api/agent/erc8004-registration-tx'
      });
      await publicApp.close();

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      const data = json.data;

      expect(data.metadataUriStatus).toBe('CONFIGURED_CANONICAL_URI');
      expect(data.readinessStatus).toBe('READY_FOR_OPERATOR_SIGNATURE');
      expect(data.agentURI).toBe('https://revertlens.example.com/api/agent/metadata');
      expect(data.attributionStatus).toBe('TAGGED_CORRECTLY');
      expect(data.attributionTag).toBe(OFFICIAL_CELO_ATTRIBUTION_TAG);
    });
  });

  // =========================================================================
  // 4. Registration Receipt Verification (verifyErc8004RegistrationReceipt)
  // =========================================================================
  describe('4. Registration Receipt Verification Engine', () => {
    const canonicalUri = 'https://revertlens.example.com/api/agent/metadata';
    const validTxHash = '0x1111111111111111111111111111111111111111111111111111111111111111';

    // Helper to generate mock Registered event log
    function makeRegisteredLog(agentId: bigint, uri: string, owner: string) {
      const uriEncoded = encodeAbiParameters([{ type: 'string' }], [uri]);
      return {
        address: validRegistry,
        topics: [
          ERC8004_REGISTERED_EVENT_TOPIC,
          pad(toHex(agentId), { size: 32 }),
          pad(owner as Hex, { size: 32 })
        ],
        data: uriEncoded
      };
    }

    // Helper to generate mock Transfer event log
    function makeTransferLog(from: string, to: string, tokenId: bigint) {
      return {
        address: validRegistry,
        topics: [
          ERC721_TRANSFER_EVENT_TOPIC,
          pad(from as Hex, { size: 32 }),
          pad(to as Hex, { size: 32 }),
          pad(toHex(tokenId), { size: 32 })
        ],
        data: '0x'
      };
    }

    it('verifies valid receipt containing both Registered and Transfer events', () => {
      const agentId = 77n;
      const registeredLog = makeRegisteredLog(agentId, canonicalUri, validWallet);
      const transferLog = makeTransferLog('0x0000000000000000000000000000000000000000', validWallet, agentId);

      const tx = service.buildErc8004RegistrationTransaction({
        agentURI: canonicalUri,
        from: validWallet
      });

      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          blockNumber: 12345678,
          status: 1,
          logs: [registeredLog, transferLog]
        },
        transaction: {
          to: tx.to,
          from: tx.from,
          input: tx.data
        }
      });

      expect(result.verified).toBe(true);
      expect(result.status).toBe('VERIFIED');
      expect(result.agentId).toBe('77');
      expect(result.agentIdBigInt).toBe(77n);
      expect(result.owner).toBe(validWallet);
      expect(result.agentURI).toBe(canonicalUri);
      expect(result.hasExpectedAttribution).toBe(true);
    });

    it('verifies receipt with only Registered event', () => {
      const agentId = 101n;
      const registeredLog = makeRegisteredLog(agentId, canonicalUri, validWallet);

      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          blockNumber: 12345678,
          status: 1,
          logs: [registeredLog]
        }
      });

      expect(result.verified).toBe(true);
      expect(result.status).toBe('VERIFIED');
      expect(result.agentId).toBe('101');
      expect(result.owner).toBe(validWallet);
    });

    it('verifies receipt with only Transfer mint event (from zero address)', () => {
      const agentId = 202n;
      const transferLog = makeTransferLog('0x0000000000000000000000000000000000000000', validWallet, agentId);

      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          blockNumber: 12345678,
          status: 1,
          logs: [transferLog]
        }
      });

      expect(result.verified).toBe(true);
      expect(result.status).toBe('VERIFIED');
      expect(result.agentId).toBe('202');
      expect(result.owner).toBe(validWallet);
    });

    it('rejects reverted transaction receipt with status REVERTED', () => {
      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          blockNumber: 12345678,
          status: 0,
          logs: []
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('REVERTED');
      expect(result.agentId).toBeNull();
    });

    it('rejects receipt with invalid transaction hash format with INVALID_RECEIPT', () => {
      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: 'not-a-tx-hash',
          status: 1,
          logs: []
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('INVALID_RECEIPT');
    });

    it('rejects transaction to an unexpected target contract with INVALID_TARGET', () => {
      const wrongRegistry = '0x1234567890123456789012345678901234567890';
      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          status: 1,
          logs: []
        },
        transaction: {
          to: wrongRegistry,
          from: validWallet
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('INVALID_TARGET');
    });

    it('rejects transaction from an unauthorized sender wallet with INVALID_SENDER', () => {
      const wrongSender = '0x9999999999999999999999999999999999999999';
      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          status: 1,
          logs: []
        },
        transaction: {
          to: validRegistry,
          from: wrongSender
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('INVALID_SENDER');
    });

    it('rejects transaction input missing ERC-8021 attribution with MISSING_ATTRIBUTION', () => {
      // Input without attribution suffix
      const untaggedInput = ERC8004_REGISTER_FUNCTION_SELECTOR + '00'.repeat(32);
      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          status: 1,
          logs: []
        },
        transaction: {
          to: validRegistry,
          from: validWallet,
          input: untaggedInput
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('MISSING_ATTRIBUTION');
    });

    it('rejects transaction input with wrong function selector with INVALID_CALLDATA', () => {
      const wrongSelectorInput = service.appendAttribution('0xa9059cbb0000000000000000000000000000000000000000000000000000000000000000');
      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          status: 1,
          logs: []
        },
        transaction: {
          to: validRegistry,
          from: validWallet,
          input: wrongSelectorInput
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('INVALID_CALLDATA');
    });

    it('rejects receipt with no registration logs with NO_REGISTRATION_EVENT', () => {
      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          status: 1,
          logs: []
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('NO_REGISTRATION_EVENT');
    });

    it('rejects receipt where logs are from an unrelated contract address', () => {
      const unrelatedLog = {
        ...makeRegisteredLog(1n, canonicalUri, validWallet),
        address: '0x9999999999999999999999999999999999999999' // Not registry
      };

      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          status: 1,
          logs: [unrelatedLog]
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('NO_REGISTRATION_EVENT');
    });

    it('rejects non-mint Transfer event (from non-zero address)', () => {
      // Transfer between two existing users (not a mint)
      const secondaryTransferLog = makeTransferLog(
        '0x1111111111111111111111111111111111111111',
        validWallet,
        999n
      );

      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          status: 1,
          logs: [secondaryTransferLog]
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('NO_REGISTRATION_EVENT');
    });

    it('rejects mint Transfer event destined for an unexpected owner address', () => {
      const unexpectedOwner = '0x8888888888888888888888888888888888888888';
      const transferLog = makeTransferLog(
        '0x0000000000000000000000000000000000000000',
        unexpectedOwner,
        500n
      );

      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          status: 1,
          logs: [transferLog]
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('INVALID_SENDER');
    });

    it('rejects receipt containing multiple conflicting agent IDs with AMBIGUOUS_EVENTS', () => {
      const log1 = makeRegisteredLog(10n, canonicalUri, validWallet);
      const log2 = makeRegisteredLog(20n, canonicalUri, validWallet);

      const result = verifyErc8004RegistrationReceipt({
        receipt: {
          transactionHash: validTxHash,
          status: 1,
          logs: [log1, log2]
        }
      });

      expect(result.verified).toBe(false);
      expect(result.status).toBe('AMBIGUOUS_EVENTS');
      expect(result.reason).toContain('Multiple distinct agent IDs');
    });
  });
});
