#!/usr/bin/env npx tsx
/**
 * ATMA DAO CLI
 *
 * Usage:  npx tsx app/cli.ts <command> [options]
 * Run from the offchain/ directory.
 */

import { Command } from "commander";
import config from "../config.json";
import { BlockfrostProvider, MeshWallet, MeshTxBuilder, slotToBeginUnixTime, SLOT_CONFIG_NETWORK } from "@meshsdk/core";

import { initialize_contract } from "../src/endpoints/initialize";
import { create_proposal } from "../src/endpoints/create_proposal";
import { create_shards } from "../src/endpoints/create_shards";
import { make_vote } from "../src/endpoints/vote";
import { merge_shards } from "../src/endpoints/merge_shards";
import { end_proposal } from "../src/endpoints/end_proposal";
import { unlock_position } from "../src/endpoints/unlock_position";
import {
  get_active_proposal,
  get_basket_state,
  get_gov_state,
  get_user_vote,
  get_shard_votes,
} from "../src/endpoints/stats";
import {
  DAOParams,
  AssetClass,
  DAOContext,
  ProposalAction,
  PoolComposition,
} from "../src/daoContext";

// ─── Bootstrap context ────────────────────────────────────────────

async function buildContext(): Promise<DAOContext> {
  const provider = new BlockfrostProvider(config.setup.blockfrostKey);

  const wallet = new MeshWallet({
    networkId: 0,
    fetcher: provider,
    submitter: provider,
    key: { type: "mnemonic", words: config.setup.adminSeed.split(" ") },
  });
  await wallet.init();

  const txBuilder = new MeshTxBuilder({ fetcher: provider, verbose: false });

  const daoParams = new DAOParams(
    new AssetClass("d53989cc7e67573fb917b0d42f1b2053dbf93886c0817d7f8a43452d", "c382544d41"),
    1000n * 720n,
    new AssetClass("c450b3e21b1e98bb559bfbaf3b9fd9df60d7df9e0ce62cedd56912ea", "000de1404049414d50415241444f58"),
    1000n * 300n,
    new AssetClass("37251152c9a667859f6fb9b696a0213eb7aaf1c7f3de19984aaab2e4", "4b61726d61"),
  );

  return new DAOContext(daoParams, wallet, txBuilder, provider);
}

// ─── Formatting helpers ───────────────────────────────────────────

function fmtMs(ms: bigint): string {
  const sec = Number(ms) / 1000;
  if (sec < 120) return `${sec.toFixed(0)}s`;
  const min = sec / 60;
  if (min < 120) return `${min.toFixed(1)}m`;
  const hr = min / 60;
  return `${hr.toFixed(1)}h`;
}

// ─── CLI definition ───────────────────────────────────────────────

const program = new Command();
program
  .name("atma-dao")
  .description("ATMA DAO governance CLI")
  .version("0.1.0");

// ── status ────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show full DAO state: basket, gov params, proposal, shard votes, your votes")
  .action(async () => {
    const ctx = await buildContext();

    console.log("\n═══ ATMA DAO Status ═══\n");

    // Addresses
    console.log("Addresses:");
    console.log(`  Governance : ${ctx.daoParams.governance_address}`);
    console.log(`  Shards Mgr : ${ctx.daoParams.shards_manager_address}`);
    console.log(`  Vote Pos.  : ${ctx.daoParams.voting_position_address}`);

    // Basket state
    try {
      const basket = await get_basket_state(ctx);
      console.log("\nBasket State:");
      console.log(`  Fee percent: ${basket.basket_fee_percent}`);
      if (basket.basket_pool_composition.composition.length === 0) {
        console.log("  Pool comp  : (empty)");
      } else {
        for (const [key, val] of basket.basket_pool_composition.composition) {
          console.log(`  Pool comp  : ${key} → ${val}`);
        }
      }
    } catch (e: any) {
      console.log("\nBasket State: (no GOV UTxO found — run 'init' first)");
    }

    // Gov state
    try {
      const gov = await get_gov_state(ctx);
      console.log("\nGovernance Parameters:");
      console.log(`  Proposal deposit  : ${gov.proposal_deposit} lovelace`);
      console.log(`  Max shards        : ${gov.max_shards_amt}`);
      console.log(`  Voting period     : ${fmtMs(gov.voting_period)}`);
      console.log(`  Effective delay   : ${fmtMs(gov.effective_delay)}`);
      console.log(`  Expiration period : ${fmtMs(gov.expiration_period)}`);
      console.log(`  Quorum threshold  : ${gov.quorum_threshold}`);
    } catch {}

    // Active proposal
    try {
      const proposal = await get_active_proposal(ctx);
      if (!proposal) {
        console.log("\nProposal: None");
      } else {
        const gov = await get_gov_state(ctx);
        const latestBlock = await ctx.provider.fetchLatestBlock();
        const nowMs = BigInt(slotToBeginUnixTime(Number(latestBlock.slot), SLOT_CONFIG_NETWORK.preview));

        const votingEndsAt = proposal.start_time + ctx.daoParams.voting_period;
        const shardDeadline = proposal.start_time + gov.effective_delay;
        const remainingVotingMs = votingEndsAt - nowMs;
        const remainingShardMs = shardDeadline - nowMs;

        console.log("\nActive Proposal:");
        console.log(`  Started at : ${proposal.start_time} ms  (${new Date(Number(proposal.start_time)).toLocaleString()})`);
        console.log(`  Shards     : ${proposal.shards_created}`);
        console.log(`  Votes      : Yes ${proposal.votes.yes}  /  No ${proposal.votes.no}`);

        if (remainingShardMs > 0n) {
          console.log(`  Shard window : ${fmtMs(remainingShardMs)} remaining  (ends ${new Date(Number(shardDeadline)).toLocaleString()})`);
        } else {
          console.log(`  Shard window : closed`);
        }

        if (remainingVotingMs > 0n) {
          console.log(`  Voting       : ${fmtMs(remainingVotingMs)} remaining  (ends ${new Date(Number(votingEndsAt)).toLocaleString()})`);
        } else {
          const overByMs = -remainingVotingMs;
          console.log(`  Voting       : ended ${fmtMs(overByMs)} ago  — ready to merge & finalize`);
        }

        if (proposal.action.kind === "ChangeBasketFeePercent") {
          console.log(`  Action     : Change fee to ${proposal.action.new_fee_percent}%`);
        } else if (proposal.action.kind === "ChangePoolComposition") {
          console.log(`  Action     : Change pool composition`);
          for (const [key, val] of proposal.action.new_composition!.composition) {
            console.log(`               ${key} → ${val}`);
          }
        } else {
          console.log(`  Action     : Change governance state`);
        }
      }
    } catch {}

    // Shard votes
    try {
      const shardVotes = await get_shard_votes(ctx);
      if (shardVotes.yes > 0n || shardVotes.no > 0n) {
        console.log(`\nShard Votes (unmerged): Yes ${shardVotes.yes}  /  No ${shardVotes.no}`);
      }
    } catch {}

    // User votes
    try {
      const userVotes = await get_user_vote(ctx);
      console.log(`\nYour locked voting tokens: ${userVotes}`);
    } catch {
      console.log(`\nYour locked voting tokens: 0`);
    }

    console.log("");
  });

// ── init ──────────────────────────────────────────────────────────
program
  .command("init")
  .description("Initialize the DAO contract — send GOV UTxO with dao_nft to governance address")
  .action(async () => {
    const ctx = await buildContext();
    console.log("Initializing DAO contract...");
    await initialize_contract(ctx);
  });

// ── propose ───────────────────────────────────────────────────────
program
  .command("propose")
  .description("Create a new governance proposal")
  .requiredOption("--type <type>", "Proposal type: fee | composition | gov-state")
  .option("--fee <percent>", "New basket fee percent (for --type fee)")
  .option("--comp <json>", 'Pool composition as JSON array: [["pkh",amount],...]')
  .action(async (opts) => {
    const ctx = await buildContext();

    let action: ProposalAction;
    switch (opts.type) {
      case "fee":
        if (!opts.fee) { console.error("--fee required for type 'fee'"); process.exit(1); }
        action = ProposalAction.ChangeBasketFeePercent(BigInt(opts.fee));
        break;
      case "composition":
        if (!opts.comp) { console.error("--comp required for type 'composition'"); process.exit(1); }
        const parsed: [string, number][] = JSON.parse(opts.comp);
        const comp = new PoolComposition(parsed.map(([k, v]) => [k, BigInt(v)]));
        action = ProposalAction.ChangePoolComposition(comp);
        break;
      default:
        console.error(`Unknown proposal type: ${opts.type}. Use: fee, composition`);
        process.exit(1);
    }

    console.log("Creating proposal...");
    await create_proposal(action, ctx);
  });

// ── create-shards ─────────────────────────────────────────────────
program
  .command("create-shards")
  .description("Create voting shard UTxOs for the active proposal")
  .requiredOption("-n, --count <number>", "Number of shards to create")
  .action(async (opts) => {
    const ctx = await buildContext();
    const count = parseInt(opts.count, 10);
    if (isNaN(count) || count < 1) { console.error("Invalid shard count"); process.exit(1); }
    console.log(`Creating ${count} shard(s)...`);
    await create_shards(count, ctx);
  });

// ── vote ──────────────────────────────────────────────────────────
program
  .command("vote")
  .description("Vote on an active proposal via a shard UTxO")
  .requiredOption("--choice <yes|no>", "Vote direction: yes or no")
  .requiredOption("--amount <tokens>", "Number of voting tokens to lock")
  .action(async (opts) => {
    const ctx = await buildContext();
    const choice = opts.choice.toLowerCase() === "yes" ? "Yes" : "No";
    const amount = BigInt(opts.amount);
    console.log(`Voting ${choice} with ${amount} tokens ...`);
    await make_vote(choice as "Yes" | "No", amount, ctx);
  });

// ── merge-shards ──────────────────────────────────────────────────
program
  .command("merge-shards")
  .description("Merge all shard votes back into the governance proposal (after voting period)")
  .action(async () => {
    const ctx = await buildContext();
    console.log("Merging shards...");
    await merge_shards(ctx);
  });

// ── end-proposal ──────────────────────────────────────────────────
program
  .command("end-proposal")
  .description("End the active proposal and apply result (after voting period)")
  .action(async () => {
    const ctx = await buildContext();
    console.log("Ending proposal...");
    await end_proposal(ctx);
  });

// ── unlock ────────────────────────────────────────────────────────
program
  .command("unlock")
  .description("Unlock a vote position and reclaim voting tokens (after unlock time)")
  .requiredOption("--tx <hash>", "Vote position UTxO transaction hash")
  .option("--index <index>", "Vote position UTxO output index", "0")
  .action(async (opts) => {
    const ctx = await buildContext();
    const txIndex = parseInt(opts.index, 10);
    console.log(`Unlocking position ${opts.tx}#${txIndex}...`);
    await unlock_position(opts.tx, txIndex, ctx);
  });

// ── Parse & run ───────────────────────────────────────────────────
program.parse();
