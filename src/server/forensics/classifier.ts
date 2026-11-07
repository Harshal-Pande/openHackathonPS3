import { NormalizedTransaction, NormalizedReceipt } from '../providers/chainstack.js';
import { FailureDiagnosis, DecodedRevert, EvidenceItem } from './types.js';
import { ParsedTraceResult } from './traceParser.js';

export function classifyFailure(
  tx: NormalizedTransaction | null,
  receipt: NormalizedReceipt | null,
  trace: ParsedTraceResult | null,
  revert: DecodedRevert | null,
  evidence: EvidenceItem[]
): FailureDiagnosis {
  const citations = evidence.map((e) => e.id);
  const provenFacts: string[] = [];
  const likelyExplanations: string[] = [];
  const unknowns: string[] = [];
  const safeNextSteps: string[] = [];

  // If receipt status is SUCCESS
  if (receipt && receipt.status === 'SUCCESS') {
    provenFacts.push(`Receipt status confirms the transaction succeeded on-chain at block ${receipt.blockNumber}.`);
    return {
      category: 'CAUGHT_CHILD_REVERT',
      confidence: 'HIGH',
      headline: 'Transaction Executed Successfully',
      narrative: 'The transaction was successfully mined and executed without top-level revert.',
      evidenceCitations: citations,
      provenFacts,
      likelyExplanations: ['All operations completed within the gas limit.'],
      unknowns: [],
      safeNextSteps: ['No action required. Transaction succeeded.']
    };
  }

  // Transaction reverted
  if (receipt) {
    provenFacts.push(`The on-chain transaction receipt explicitly confirms execution failure (status: 0) at block ${receipt.blockNumber}.`);
    provenFacts.push(`Gas consumed: ${receipt.gasUsed} gas units.`);
  }

  // Check out of gas
  if (tx && receipt) {
    const gasLimit = BigInt(tx.gas);
    const gasUsed = BigInt(receipt.gasUsed);
    if (gasUsed > 0n && gasLimit > 0n && gasUsed >= gasLimit - 1000n) {
      provenFacts.push(`Gas consumed (${receipt.gasUsed}) matched or reached the transaction gas limit (${tx.gas}).`);
      likelyExplanations.push('The execution ran out of gas before finishing all contract operations.');
      safeNextSteps.push('Check if complex loop or state updates require a higher gas limit, or optimize contract gas consumption.');
      return {
        category: 'OUT_OF_GAS',
        confidence: 'HIGH',
        headline: 'Transaction Reverted: Out of Gas',
        narrative: `The transaction exhausted its allocated gas limit of ${tx.gas} units during execution, leading to an immediate out-of-gas revert.`,
        evidenceCitations: citations,
        provenFacts,
        likelyExplanations,
        unknowns,
        safeNextSteps
      };
    }
  }

  // Panic errors
  if (revert && revert.type === 'PANIC') {
    provenFacts.push(`The contract raised a standard Solidity Panic code: ${revert.panicExplanation || revert.panicCode}.`);
    likelyExplanations.push('An internal arithmetic invariant, array bounds check, or assert statement failed.');
    safeNextSteps.push('Review the target contract source code for the line where this arithmetic or boundary assertion is checked.');
    return {
      category: 'PANIC',
      confidence: 'HIGH',
      headline: `Solidity Panic: ${revert.panicExplanation || 'Panic Error'}`,
      narrative: `Execution failed due to a Solidity Panic check (${revert.panicExplanation}). This occurs when an internal mathematical invariant (such as overflow, division by zero, or array index out of bounds) is violated.`,
      evidenceCitations: citations,
      provenFacts,
      likelyExplanations,
      unknowns,
      safeNextSteps
    };
  }

  // Propagated child call failure from trace
  if (trace && trace.deepestFailingFrame && trace.deepestFailingFrame.depth > 0) {
    const frame = trace.deepestFailingFrame;
    provenFacts.push(`Execution trace reveals a nested ${frame.type} call to ${frame.to || 'contract'} failed at call depth ${frame.depth}.`);
    provenFacts.push(`The nested error propagated up through ${frame.depth} parent frame(s) to the top-level transaction.`);

    const childReason = frame.decodedRevert?.reason || frame.error || 'Nested call reverted';
    likelyExplanations.push(`The target contract invoked an external dependency or child contract (${frame.to}) which rejected the call with: "${childReason}".`);
    safeNextSteps.push(`Inspect the child contract at ${frame.to} and check why it rejected the call with input ${frame.input.slice(0, 10)}...`);
    safeNextSteps.push('Verify token allowance, pool liquidity, or slippage limits if this was a DEX or token transfer operation.');

    return {
      category: 'PROPAGATED_CHILD_REVERT',
      confidence: 'HIGH',
      headline: `Nested Call Failure at Depth ${frame.depth}: ${childReason}`,
      narrative: `The transaction failed because a nested sub-call to contract ${frame.to} reverted with error "${childReason}". The trace confirms this error was not handled by parent contracts and propagated to cause the root transaction failure.`,
      evidenceCitations: citations,
      provenFacts,
      likelyExplanations,
      unknowns,
      safeNextSteps
    };
  }

  // Explicit string revert
  if (revert && revert.reason) {
    provenFacts.push(`The contract execution returned an explicit revert reason: "${revert.reason}".`);
    likelyExplanations.push(`The contract requirement or require() condition evaluated to false with message "${revert.reason}".`);
    safeNextSteps.push(`Check the parameters passed to the function and confirm contract preconditions for "${revert.reason}" are satisfied.`);

    return {
      category: 'EXPLICIT_REVERT',
      confidence: 'HIGH',
      headline: `Contract Reverted: "${revert.reason}"`,
      narrative: `The transaction was rejected by the smart contract with the revert message: "${revert.reason}". This indicates an intentional condition check in the smart contract failed.`,
      evidenceCitations: citations,
      provenFacts,
      likelyExplanations,
      unknowns,
      safeNextSteps
    };
  }

  // Missing or unsupported trace
  if (!trace) {
    unknowns.push('Execution trace was not available from the node; internal call frames could not be inspected.');
    safeNextSteps.push('Simulate the transaction locally using a debug-enabled archive node or Tenderly to observe internal call steps.');
    return {
      category: 'UNSUPPORTED_OR_MISSING_TRACE',
      confidence: 'MEDIUM',
      headline: 'Transaction Reverted (Execution Trace Unavailable)',
      narrative: 'The on-chain receipt confirms this transaction reverted, but internal execution trace data could not be retrieved from the provider.',
      evidenceCitations: citations,
      provenFacts,
      likelyExplanations: ['A require() statement or assertion failed inside the contract without returning a standard error string.'],
      unknowns,
      safeNextSteps
    };
  }

  // Fallback unknown
  unknowns.push('No standard Error(string) or Panic(uint256) ABI payload was decoded from the revert bytes.');
  safeNextSteps.push('Check the verified contract ABI on Celoscan to decode any custom error selectors.');

  return {
    category: 'UNKNOWN_REVERT',
    confidence: 'MEDIUM',
    headline: 'Transaction Reverted (Custom Error or Unspecified Reason)',
    narrative: 'The transaction reverted during execution, but did not return a standard ASCII error message. A custom error or empty revert statement was returned.',
    evidenceCitations: citations,
    provenFacts,
    likelyExplanations: ['A custom contract error was emitted, or an empty revert() statement was executed.'],
    unknowns,
    safeNextSteps
  };
}
