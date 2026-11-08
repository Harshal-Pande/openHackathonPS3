// lib/errors.ts — Error code → {title, detail, actions} mapping per Section 13.2

export interface ErrorInfo {
  title: string;
  detail: string;
  actions: string[];
}

const ERROR_MAP: Record<string, (serverMsg?: string) => ErrorInfo> = {
  INVALID_INPUT: (serverMsg) => ({
    title: "That input isn't valid",
    detail: serverMsg || 'Check the transaction hash format: must be 0x followed by 64 hexadecimal characters.',
    actions: ['Edit input'],
  }),
  TRANSACTION_NOT_FOUND: () => ({
    title: 'Transaction not found on Celo Mainnet',
    detail: 'Check the hash and network. The transaction may be on another chain, not yet propagated, or dropped.',
    actions: ['Edit hash'],
  }),
  NOT_FOUND: () => ({
    title: 'Report not found',
    detail: 'No saved investigation has this ID.',
    actions: ['Go to History'],
  }),
  ENDPOINT_NOT_CONFIGURED: () => ({
    title: 'RPC endpoint not configured',
    detail: 'The server has no Celo RPC URL set. This is a server configuration issue; contact the operator.',
    actions: [],
  }),
  INVALID_CHAIN_ID: () => ({
    title: 'Wrong network',
    detail: 'The configured RPC is not Celo Mainnet (chain ID 42220). Contact the operator.',
    actions: [],
  }),
  TIMEOUT: () => ({
    title: 'The RPC provider timed out',
    detail: 'Try again in a moment.',
    actions: ['Try again'],
  }),
  GATEWAY_TIMEOUT: () => ({
    title: 'The RPC provider timed out',
    detail: 'Try again in a moment.',
    actions: ['Try again'],
  }),
  RATE_LIMITED: () => ({
    title: 'Rate-limited by the RPC provider',
    detail: 'Wait a little and try again.',
    actions: ['Try again'],
  }),
  PROVIDER_ERROR: (serverMsg) => ({
    title: 'RPC provider error',
    detail: serverMsg || 'The Celo RPC node returned an error.',
    actions: ['Try again'],
  }),
  PROVIDER_UNAVAILABLE: (serverMsg) => ({
    title: 'RPC provider error',
    detail: serverMsg || 'The Celo RPC node is currently unavailable.',
    actions: ['Try again'],
  }),
  METHOD_NOT_SUPPORTED: (serverMsg) => ({
    title: 'RPC method not supported',
    detail: serverMsg || 'The configured RPC does not support this method.',
    actions: [],
  }),
  UNAUTHORIZED: () => ({
    title: 'Operator authentication required',
    detail: 'Unlock the operator console.',
    actions: ['Go to Operator'],
  }),
  HASH_MISMATCH: () => ({
    title: 'Request hash did not match',
    detail: 'The quote was invalidated by the server. Request a fresh quote.',
    actions: [],
  }),
  QUOTE_EXPIRED: () => ({
    title: 'Quote expired',
    detail: 'Request a fresh quote.',
    actions: [],
  }),
  ALREADY_APPROVED: () => ({
    title: 'Already approved',
    detail: 'This quote has already been approved.',
    actions: [],
  }),
  KILL_SWITCH_ACTIVE: () => ({
    title: 'Kill switch is engaged',
    detail: 'New quotes and approvals are blocked.',
    actions: [],
  }),
  NETWORK: () => ({
    title: "Can't reach the RevertLens server",
    detail: 'Check your connection and try again.',
    actions: ['Try again'],
  }),
};

export function getErrorInfo(code: string | undefined, message?: string): ErrorInfo {
  if (code && code in ERROR_MAP) {
    return ERROR_MAP[code](message);
  }
  return {
    title: 'Something went wrong',
    detail: message || 'An unexpected error occurred during request processing.',
    actions: ['Try again'],
  };
}
