/**
 * Offline tests for DAO endpoints using MeshJS OfflineFetcher + OfflineEvaluator.
 *
 * Run: npx tsx tests/offline_test.ts   (from offchain/)
 */

import {
  MeshTxBuilder, MeshWallet, SLOT_CONFIG_NETWORK,
  conStr0, conStr1, conStr2, conStr3, integer, builtinByteString,
  deserializeDatum, deserializeAddress,
  applyParamsToScript, serializePlutusScript, resolveScriptHash,
  type UTxO, type Asset, type BlockInfo,
  slotToBeginUnixTime, unixTimeToEnclosingSlot,
} from "@meshsdk/core";
import { OfflineFetcher } from "@meshsdk/provider";
import { OfflineEvaluator, builderDataToCbor } from "@meshsdk/core-csl";
import * as fs from "fs";

// ─── Datum serialisation helper ────────────────────────────────────
// conStr0 etc. produce JSON format ({ constructor, fields }).
// builderDataToCbor with type:"Mesh" needs ({ alternative, fields }).
// Convert recursively before serialising.
function jsonToMesh(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(jsonToMesh);
  if ("constructor" in obj && "fields" in obj) {
    return { alternative: Number(obj.constructor), fields: (obj.fields as any[]).map(jsonToMesh) };
  }
  if ("int" in obj) return obj.int;
  if ("bytes" in obj) return obj.bytes;
  if ("map" in obj) {
    return obj.map.map((entry: any) => [jsonToMesh(entry.k), jsonToMesh(entry.v)]);
  }
  // pass through
  return obj;
}

function datumToHex(datumJson: any): string {
  return builderDataToCbor({ type: "Mesh", content: jsonToMesh(datumJson) });
}

// ─── Constants ─────────────────────────────────────────────────────
// Public BIP39 test vector (23×abandon + art). Offline-only; never fund this.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
const SLOT_CONFIG = SLOT_CONFIG_NETWORK.preview;
const MIN_ADA = "2000000";
const NOW_SLOT = 80_000_000;                                    // arbitrary test slot
const NOW_MS   = slotToBeginUnixTime(NOW_SLOT, SLOT_CONFIG);   // matching unix ms

// ─── Bootstrap scripts & addresses ────────────────────────────────
const blueprint = JSON.parse(fs.readFileSync("./src/plutus.json").toString());

const votingToken = { policyId: "aa".repeat(28), assetName: "564f5445" }; // "VOTE"
const basketNft   = { policyId: "bb".repeat(28), assetName: "4241534b4554" }; // "BASKET"
const daoNft      = { policyId: "cc".repeat(28), assetName: "44414f" }; // "DAO"
const daoNftUnit  = daoNft.policyId + daoNft.assetName;
const votingTokenUnit = votingToken.policyId + votingToken.assetName;

const VOTING_PERIOD   = 100_000n;
const TX_VALIDITY     = 600_000n;

// Voting position (no params)
const vpCompiled = blueprint.validators[6].compiledCode;
const vpHash     = resolveScriptHash(vpCompiled, "V3");
const vpAddress  = serializePlutusScript({ code: vpCompiled, version: "V3" }, undefined, 0).address;

// Shards manager & governance (parameterised)
const shardsCompiled = blueprint.validators[3].compiledCode;
const govCompiled    = blueprint.validators[0].compiledCode;

const shardsBlueprintHash = blueprint.validators[3].hash as string;

function makeGovParams(shardsHash: string) {
  return conStr0([
    conStr0([builtinByteString(votingToken.policyId), builtinByteString(votingToken.assetName)]),
    integer(VOTING_PERIOD),
    conStr0([builtinByteString(basketNft.policyId), builtinByteString(basketNft.assetName)]),
    integer(TX_VALIDITY),
    conStr0([builtinByteString(daoNft.policyId), builtinByteString(daoNft.assetName)]),
    builtinByteString(shardsHash),
    builtinByteString(vpHash),
  ]);
}

// First pass – apply with blueprint hash, derive real hash, re-apply
const pass1Params = makeGovParams(shardsBlueprintHash);
const shardsApplied1 = applyParamsToScript(shardsCompiled, [pass1Params], "JSON");
const shardsHash     = resolveScriptHash(shardsApplied1, "V3");

const finalParams      = makeGovParams(shardsHash);
const shardsValidator  = applyParamsToScript(shardsCompiled, [finalParams], "JSON");
const shardsAddress    = serializePlutusScript({ code: shardsValidator, version: "V3" }, undefined, 0).address;
const govValidator     = applyParamsToScript(govCompiled, [finalParams], "JSON");
const govAddress       = serializePlutusScript({ code: govValidator, version: "V3" }, undefined, 0).address;

// ─── Datum builders ───────────────────────────────────────────────
function govStatePlutus() {
  return conStr0([
    integer(100_000_000n),   // proposal_deposit
    integer(10n),            // max_shards_amt
    integer(VOTING_PERIOD),  // voting_period
    integer(50_000n),        // effective_delay
    integer(200_000n),       // expiration_period
    integer(1000n),          // quorum_threshold
  ]);
}

function basketStatePlutus() {
  return conStr0([
    { map: [] },             // empty pool composition
    integer(0n),             // basket_fee_percent
  ]);
}

function govDatumNoProposal() {
  return conStr0([ basketStatePlutus(), govStatePlutus(), conStr1([]) ]);
}

function proposalPlutus(startTime: bigint) {
  return conStr0([
    integer(startTime),
    conStr1([integer(10n)]),      // ChangeBasketFeePercent(10)
    integer(0n),                  // shards_created
    conStr0([integer(0n), integer(0n)]),  // votes
  ]);
}

function govDatumWithProposal(startTime: bigint, shardsCreated: bigint = 0n, yesVotes: bigint = 0n, noVotes: bigint = 0n) {
  const proposal = conStr0([
    integer(startTime),
    conStr1([integer(10n)]),
    integer(shardsCreated),
    conStr0([integer(yesVotes), integer(noVotes)]),
  ]);
  return conStr0([ basketStatePlutus(), govStatePlutus(), conStr0([proposal]) ]);
}

function shardDatumPlutus(yes: bigint, no: bigint) {
  return conStr0([ conStr0([integer(yes), integer(no)]) ]);
}

function votePositionDatumPlutus(owner: string, unlockTime: bigint) {
  return conStr0([ builtinByteString(owner), integer(unlockTime) ]);
}

// ─── Mock UTxO factory ────────────────────────────────────────────
let txCounter = 0;
function fakeTxHash(): string {
  txCounter++;
  return txCounter.toString(16).padStart(64, "0");
}

function mockUtxo(address: string, assets: Asset[], datumJson?: any, txHash?: string): UTxO {
  return {
    input: { txHash: txHash ?? fakeTxHash(), outputIndex: 0 },
    output: {
      address,
      amount: assets,
      plutusData: datumJson ? datumToHex(datumJson) : undefined,
    },
  };
}

// ─── Test harness ─────────────────────────────────────────────────
let passed = 0, failed = 0;
async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message ?? e}`);
  }
}

// ─── Provider + Wallet setup ──────────────────────────────────────
async function setup() {
  const fetcher = new OfflineFetcher("preview");

  // Wallet
  const wallet = new MeshWallet({
    networkId: 0,
    fetcher: fetcher as any,
    key: { type: "mnemonic", words: TEST_MNEMONIC.split(" ") },
  });
  await wallet.init();
  const walletAddress = wallet.getAddresses().baseAddressBech32!;
  const { pubKeyHash } = deserializeAddress(walletAddress);

  // Seed the wallet with ADA + dao_nft + voting tokens
  const walletAda: UTxO = mockUtxo(walletAddress, [{ unit: "lovelace", quantity: "500000000000" }]);
  const walletNft: UTxO = mockUtxo(walletAddress, [
    { unit: "lovelace", quantity: "5000000" },
    { unit: daoNftUnit, quantity: "1" },
  ]);
  const walletVote: UTxO = mockUtxo(walletAddress, [
    { unit: "lovelace", quantity: "5000000" },
    { unit: votingTokenUnit, quantity: "1000" },
  ]);
  const walletCollateral: UTxO = mockUtxo(walletAddress, [{ unit: "lovelace", quantity: "10000000" }]);

  fetcher.addUTxOs([walletAda, walletNft, walletVote, walletCollateral]);

  // We skip addBlock — slot timing is computed directly in each test.

  return { fetcher, wallet, walletAddress, pubKeyHash };
}

function newTxBuilder(fetcher: OfflineFetcher) {
  return new MeshTxBuilder({
    fetcher: fetcher as any,
    verbose: false,
  });
}

// ─── TESTS ────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== DAO Offline Transaction Build Tests ===\n");

  const { fetcher, wallet, walletAddress, pubKeyHash } = await setup();
  const utxos = await wallet.getUtxos();
  const collateral = (await wallet.getCollateral())[0];

  // ── 1. Initialize ───────────────────────────────────────────────
  await runTest("initialize_contract – sends GOV UTxO with dao_nft & datum", async () => {
    const txb = newTxBuilder(fetcher);
    const datum = govDatumNoProposal();

    const unsignedTx = await txb
      .txOut(govAddress, [{ unit: "lovelace", quantity: MIN_ADA }, { unit: daoNftUnit, quantity: "1" }])
      .txOutInlineDatumValue(datum, "JSON")
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .setNetwork("preview")
      .complete();

    if (!unsignedTx) throw new Error("tx build returned empty");
    const signed = await wallet.signTx(unsignedTx);
    if (!signed) throw new Error("signing returned empty");
  });

  // Put gov UTxO on-chain for subsequent tests
  const govUtxo = mockUtxo(
    govAddress,
    [{ unit: "lovelace", quantity: MIN_ADA }, { unit: daoNftUnit, quantity: "1" }],
    govDatumNoProposal(),
  );
  fetcher.addUTxOs([govUtxo]);

  // ── 2. Create Proposal ──────────────────────────────────────────
  await runTest("create_proposal – spends GOV UTxO, outputs proposal datum", async () => {
    const txb = newTxBuilder(fetcher);
    const inDatum = deserializeDatum(govUtxo.output.plutusData!);
    const proposal = proposalPlutus(BigInt(NOW_MS));
    inDatum.fields[2] = conStr0([proposal]);

    const validStart = unixTimeToEnclosingSlot(NOW_MS, SLOT_CONFIG);
    const validEnd   = unixTimeToEnclosingSlot(NOW_MS + Number(TX_VALIDITY), SLOT_CONFIG) - 1;

    const unsignedTx = await txb
      .spendingPlutusScript("V3")
      .txIn(govUtxo.input.txHash, govUtxo.input.outputIndex, govUtxo.output.amount, govAddress)
      .txInRedeemerValue(conStr0([conStr1([integer(10n)])]), "JSON")  // CreateProposal{ChangeBasketFeePercent(10)}
      .txInInlineDatumPresent()
      .txInScript(govValidator)
      .txOut(govAddress, [{ unit: "lovelace", quantity: MIN_ADA }, { unit: daoNftUnit, quantity: "1" }])
      .txOutInlineDatumValue(inDatum, "JSON")
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address)
      .invalidBefore(validStart)
      .invalidHereafter(validEnd)
      .setNetwork("preview")
      .complete();

    if (!unsignedTx) throw new Error("tx build returned empty");
  });

  // Replace gov UTxO with one that has an active proposal
  const proposalStart = BigInt(NOW_MS);
  const govUtxoWithProposal = mockUtxo(
    govAddress,
    [{ unit: "lovelace", quantity: MIN_ADA }, { unit: daoNftUnit, quantity: "1" }],
    govDatumWithProposal(proposalStart),
  );
  fetcher.addUTxOs([govUtxoWithProposal]);

  // ── 3. Create Shards ────────────────────────────────────────────
  await runTest("create_shards – outputs shard UTxOs at shards_manager address", async () => {
    const txb = newTxBuilder(fetcher);
    const inDatum = deserializeDatum(govUtxoWithProposal.output.plutusData!);
    // Update shards_created: 0 → 2
    inDatum.fields[2].fields[0].fields[2] = integer(2n);

    const emptyShardDatum = shardDatumPlutus(0n, 0n);
    const validStart = unixTimeToEnclosingSlot(NOW_MS, SLOT_CONFIG);
    const validEnd   = unixTimeToEnclosingSlot(NOW_MS + Number(TX_VALIDITY), SLOT_CONFIG) - 1;

    const unsignedTx = await txb
      .spendingPlutusScript("V3")
      .txIn(govUtxoWithProposal.input.txHash, govUtxoWithProposal.input.outputIndex, govUtxoWithProposal.output.amount, govAddress)
      .txInRedeemerValue(conStr1([]), "JSON")  // CreateShards
      .txInInlineDatumPresent()
      .txInScript(govValidator)
      .txOut(govAddress, [{ unit: "lovelace", quantity: MIN_ADA }, { unit: daoNftUnit, quantity: "1" }])
      .txOutInlineDatumValue(inDatum, "JSON")
      .txOut(shardsAddress, [{ unit: "lovelace", quantity: MIN_ADA }])
      .txOutInlineDatumValue(emptyShardDatum, "JSON")
      .txOut(shardsAddress, [{ unit: "lovelace", quantity: MIN_ADA }])
      .txOutInlineDatumValue(emptyShardDatum, "JSON")
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address)
      .invalidBefore(validStart)
      .invalidHereafter(validEnd)
      .setNetwork("preview")
      .complete();

    if (!unsignedTx) throw new Error("tx build returned empty");
  });

  // Add shard UTxOs for vote/merge tests
  const shard1 = mockUtxo(shardsAddress, [{ unit: "lovelace", quantity: MIN_ADA }], shardDatumPlutus(0n, 0n));
  const shard2 = mockUtxo(shardsAddress, [{ unit: "lovelace", quantity: MIN_ADA }], shardDatumPlutus(0n, 0n));
  fetcher.addUTxOs([shard1, shard2]);

  // Update gov UTxO to reflect 2 shards
  const govUtxo2Shards = mockUtxo(
    govAddress,
    [{ unit: "lovelace", quantity: MIN_ADA }, { unit: daoNftUnit, quantity: "1" }],
    govDatumWithProposal(proposalStart, 2n),
  );
  fetcher.addUTxOs([govUtxo2Shards]);

  // ── 4. Vote ─────────────────────────────────────────────────────
  await runTest("vote – spends shard, adds reference gov input, outputs vote position", async () => {
    const txb = newTxBuilder(fetcher);
    const updatedShardVotes = conStr0([integer(100n), integer(0n)]); // VoteYes 100 tokens

    // unlock_time = start + effective_delay + gov_state.voting_period
    const unlockTime = proposalStart + 50_000n + VOTING_PERIOD;
    const vpDatum = votePositionDatumPlutus(pubKeyHash, unlockTime);

    const validStart = unixTimeToEnclosingSlot(NOW_MS, SLOT_CONFIG);
    const validEnd   = unixTimeToEnclosingSlot(NOW_MS + Number(TX_VALIDITY), SLOT_CONFIG) - 1;

    const unsignedTx = await txb
      .spendingPlutusScript("V3")
      .txIn(shard1.input.txHash, shard1.input.outputIndex, shard1.output.amount, shardsAddress)
      .txInRedeemerValue(conStr0([conStr0([])]), "JSON")  // Vote(VoteYes)
      .txInInlineDatumPresent()
      .txInScript(shardsValidator)
      .readOnlyTxInReference(govUtxo2Shards.input.txHash, govUtxo2Shards.input.outputIndex)
      // Updated shard output
      .txOut(shardsAddress, [{ unit: "lovelace", quantity: MIN_ADA }])
      .txOutInlineDatumValue(updatedShardVotes, "JSON")
      // Vote position output
      .txOut(vpAddress, [{ unit: "lovelace", quantity: MIN_ADA }, { unit: votingTokenUnit, quantity: "100" }])
      .txOutInlineDatumValue(vpDatum, "JSON")
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address)
      .invalidBefore(validStart)
      .invalidHereafter(validEnd)
      .setNetwork("preview")
      .complete();

    if (!unsignedTx) throw new Error("tx build returned empty");
  });

  // ── 5. Merge Shards ─────────────────────────────────────────────
  await runTest("merge_shards – spends gov + all shards, outputs merged gov datum", async () => {
    const txb = newTxBuilder(fetcher);
    // After voting, shards have some votes
    const shard1Voted = mockUtxo(shardsAddress, [{ unit: "lovelace", quantity: MIN_ADA }], shardDatumPlutus(100n, 50n));
    const shard2Voted = mockUtxo(shardsAddress, [{ unit: "lovelace", quantity: MIN_ADA }], shardDatumPlutus(200n, 30n));
    fetcher.addUTxOs([shard1Voted, shard2Voted]);

    // Merged votes: yes=300, no=80
    const mergedGovDatum = govDatumWithProposal(proposalStart, 2n, 300n, 80n);

    // Must be after voting period ends
    const afterVotingMs = Number(proposalStart + VOTING_PERIOD) + 1000;
    const afterVotingSlot = unixTimeToEnclosingSlot(afterVotingMs, SLOT_CONFIG);

    const unsignedTx = await txb
      // Governance spend
      .spendingPlutusScript("V3")
      .txIn(govUtxo2Shards.input.txHash, govUtxo2Shards.input.outputIndex, govUtxo2Shards.output.amount, govAddress)
      .txInRedeemerValue(conStr2([]), "JSON")  // MergeShardsGOV
      .txInInlineDatumPresent()
      .txInScript(govValidator)
      // Shard 1 spend
      .spendingPlutusScript("V3")
      .txIn(shard1Voted.input.txHash, shard1Voted.input.outputIndex, shard1Voted.output.amount, shardsAddress)
      .txInRedeemerValue(conStr1([]), "JSON")  // MergeShards
      .txInInlineDatumPresent()
      .txInScript(shardsValidator)
      // Shard 2 spend
      .spendingPlutusScript("V3")
      .txIn(shard2Voted.input.txHash, shard2Voted.input.outputIndex, shard2Voted.output.amount, shardsAddress)
      .txInRedeemerValue(conStr1([]), "JSON")  // MergeShards
      .txInInlineDatumPresent()
      .txInScript(shardsValidator)
      // Output: governance with merged votes
      .txOut(govAddress, [{ unit: "lovelace", quantity: MIN_ADA }, { unit: daoNftUnit, quantity: "1" }])
      .txOutInlineDatumValue(mergedGovDatum, "JSON")
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address)
      .invalidBefore(afterVotingSlot)
      .setNetwork("preview")
      .complete();

    if (!unsignedTx) throw new Error("tx build returned empty");
  });

  // ── 6. End Proposal ─────────────────────────────────────────────
  await runTest("end_proposal – applies passed proposal changes, clears proposal", async () => {
    const txb = newTxBuilder(fetcher);
    // Gov UTxO with merged votes (yes > no → proposal passed)
    const govMerged = mockUtxo(
      govAddress,
      [{ unit: "lovelace", quantity: MIN_ADA }, { unit: daoNftUnit, quantity: "1" }],
      govDatumWithProposal(proposalStart, 2n, 300n, 80n),
    );
    fetcher.addUTxOs([govMerged]);

    // Apply ChangeBasketFeePercent(10): update basket_state.fee_percent
    const resultDatum = deserializeDatum(datumToHex(govDatumWithProposal(proposalStart, 2n, 300n, 80n)));
    resultDatum.fields[0].fields[1] = integer(10n); // update fee
    resultDatum.fields[2] = conStr1([]);              // clear proposal

    const afterVotingMs = Number(proposalStart + VOTING_PERIOD) + 1000;
    const afterVotingSlot = unixTimeToEnclosingSlot(afterVotingMs, SLOT_CONFIG);

    const unsignedTx = await txb
      .spendingPlutusScript("V3")
      .txIn(govMerged.input.txHash, govMerged.input.outputIndex, govMerged.output.amount, govAddress)
      .txInRedeemerValue(conStr3([]), "JSON")  // EndProposal
      .txInInlineDatumPresent()
      .txInScript(govValidator)
      .txOut(govAddress, [{ unit: "lovelace", quantity: MIN_ADA }, { unit: daoNftUnit, quantity: "1" }])
      .txOutInlineDatumValue(resultDatum, "JSON")
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address)
      .invalidBefore(afterVotingSlot)
      .setNetwork("preview")
      .complete();

    if (!unsignedTx) throw new Error("tx build returned empty");
  });

  // ── 7. Unlock Position ──────────────────────────────────────────
  await runTest("unlock_position – spends vote position after unlock time", async () => {
    const txb = newTxBuilder(fetcher);

    const unlockTime = proposalStart + 50_000n + VOTING_PERIOD;
    const vpUtxo = mockUtxo(
      vpAddress,
      [{ unit: "lovelace", quantity: MIN_ADA }, { unit: votingTokenUnit, quantity: "100" }],
      votePositionDatumPlutus(pubKeyHash, unlockTime),
    );
    fetcher.addUTxOs([vpUtxo]);

    const afterUnlockSlot = unixTimeToEnclosingSlot(Number(unlockTime) + 1000, SLOT_CONFIG);

    const unsignedTx = await txb
      .spendingPlutusScript("V3")
      .txIn(vpUtxo.input.txHash, vpUtxo.input.outputIndex, vpUtxo.output.amount, vpAddress)
      .txInRedeemerValue(conStr0([]), "JSON")  // UnlockPosition
      .txInInlineDatumPresent()
      .txInScript(vpCompiled)
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address)
      .invalidBefore(afterUnlockSlot)
      .requiredSignerHash(pubKeyHash)
      .setNetwork("preview")
      .complete();

    if (!unsignedTx) throw new Error("tx build returned empty");
  });

  // ── Summary ─────────────────────────────────────────────────────
  console.log(`\n  ${passed + failed} tests | ${passed} passed | ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
