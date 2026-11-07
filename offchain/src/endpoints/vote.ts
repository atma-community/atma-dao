
import { conStr0, conStr1, deserializeDatum, Unit, deserializeAddress, slotToBeginUnixTime, unixTimeToEnclosingSlot } from "@meshsdk/core";
import { BUFFER_SLOT, MIN_ADA } from "../utils";

import { DAOContext, ShardsDatum, VotePositionDatum, Votes } from "../daoContext";

export async function make_vote(vote: "Yes" | "No", amt: bigint, ctx: DAOContext) {

  const { utxos, walletAddress, collateral } = await ctx.getWalletInfoForTx();
  const { input: collateralInput, output: collateralOutput } = collateral;

  // Fetch the shard UTxO to vote on
  const shardUtxos = await ctx.provider.fetchAddressUTxOs(ctx.daoParams.shards_manager_address);
  const shardUTxO = shardUtxos[0];

  // Fetch governance UTxO as reference input
  const daoUTxO = await ctx.daoParams.daoUTxO(ctx.provider);

  const govDatum = deserializeDatum(daoUTxO.output.plutusData!);
  const proposalPlutus = govDatum.fields[2].fields[0];
  const proposalStartTime = proposalPlutus.fields[0].int;
  const govStatePlutus = govDatum.fields[1];
  const effectiveDelay = govStatePlutus.fields[3].int;
  const govVotingPeriod = govStatePlutus.fields[2].int;

  // Read shard votes and update
  const shardDatum = deserializeDatum(shardUTxO.output.plutusData!);
  const shardVotes = shardDatum.fields[0]; // ShardsDatum.votes
  let yesVotes = shardVotes.fields[0].int;
  let noVotes = shardVotes.fields[1].int;

  console.log(yesVotes)

  if (vote == "Yes") {
    yesVotes += BigInt(amt);
  } else {
    noVotes += BigInt(amt);
  }

  // Updated shard output datum is just Votes (as per on-chain handler)
  const newShardVotes = new ShardsDatum(new Votes(yesVotes, noVotes));

  const { pubKeyHash } = deserializeAddress(walletAddress);

  const votingToken: Unit = ctx.daoParams.voting_token.toUnit();

  // unlock_time = proposal.start_time + gov_state.effective_delay + gov_state.voting_period
  const unlockTime = proposalStartTime + effectiveDelay + govVotingPeriod;

  const votePosition = new VotePositionDatum(pubKeyHash, unlockTime);

  const nowTime = await ctx.provider.fetchLatestBlock().then(x => slotToBeginUnixTime(Number(x.slot) - BUFFER_SLOT, ctx.daoParams.slot_config));
  const txValidEndSlot = unixTimeToEnclosingSlot(nowTime + Number(ctx.daoParams.tx_validity_time), ctx.daoParams.slot_config) - 1;

  // ShardsRedeemer: Vote(VoteYes) = ConStr0([ConStr0([])]), Vote(VoteNo) = ConStr0([ConStr1([])])
  const voteRedeemer = vote == "Yes" ? conStr0([conStr0([])]) : conStr0([conStr1([])]);

  const unsignedTx = await ctx.txBuilder
    // Spend shard UTxO from shards_manager
    .spendingPlutusScript("V3")
    .txIn(shardUTxO.input.txHash, shardUTxO.input.outputIndex, shardUTxO.output.amount, ctx.daoParams.shards_manager_address)
    .txInRedeemerValue(voteRedeemer, "JSON")
    .txInInlineDatumPresent()
    .txInScript(ctx.daoParams.shards_manager_validator)
    // Reference input: governance UTxO with dao_nft
    .readOnlyTxInReference(daoUTxO.input.txHash, daoUTxO.input.outputIndex)
    // Output: updated shard at shards_manager address
    .txOut(ctx.daoParams.shards_manager_address, [{unit: "lovelace", quantity: MIN_ADA.toString()}])
    .txOutInlineDatumValue(newShardVotes.toPlutus(), "JSON")
    // Output: vote position at voting_position address with locked voting tokens
    .txOut(ctx.daoParams.voting_position_address, [{unit: "lovelace", quantity: MIN_ADA.toString()}, {unit: votingToken, quantity: amt.toString()}])
    .txOutInlineDatumValue(votePosition.toPlutus(), "JSON")
    .changeAddress(walletAddress)
    .selectUtxosFrom(utxos)
    .txInCollateral(collateralInput.txHash, collateralInput.outputIndex, collateralOutput.amount, collateralOutput.address)
    .invalidBefore(unixTimeToEnclosingSlot(nowTime, ctx.daoParams.slot_config))
    .invalidHereafter(txValidEndSlot)
    .setNetwork("preview")
    .complete();

  const signedTx = await ctx.wallet.signTx(unsignedTx);
  const txhash = await ctx.wallet.submitTx(signedTx);
  console.log(txhash);
}
