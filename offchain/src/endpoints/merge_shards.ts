
import { conStr0, conStr1, conStr2, deserializeDatum, slotToBeginUnixTime, Unit, unixTimeToEnclosingSlot, UTxO } from "@meshsdk/core";
import { MIN_ADA, BUFFER_SLOT } from "../utils";

import { DAOContext, Votes } from "../daoContext";
import { OfflineEvaluator } from "@meshsdk/core-csl";

export async function merge_shards(ctx: DAOContext) {

  const { utxos, walletAddress, collateral } = await ctx.getWalletInfoForTx();
  const { input: collateralInput, output: collateralOutput } = collateral;
  const daoUTxO = await ctx.daoParams.daoUTxO(ctx.provider);

  const govDatum = deserializeDatum(daoUTxO.output.plutusData!);
  const proposalPlutus = govDatum.fields[2].fields[0];
  const proposalStartTime = proposalPlutus.fields[0].int;

  // Fetch all shard UTxOs
  const shardUTxOs = await ctx.daoParams.shardUTxOs(ctx.provider);

  // Sum votes from all shards
  let totalYes = 0n;
  let totalNo = 0n;
  for (const shard of shardUTxOs) {
    const shardDatum = deserializeDatum(shard.output.plutusData!);
    let votes = shardDatum.fields[0]; // ShardsDatum.votes
    if (shardDatum.fields.length == 2) {
      votes = shardDatum;
    }
    totalYes += votes.fields[0].int;
    totalNo += votes.fields[1].int;
  }

  // Update proposal votes in governance datum
  proposalPlutus.fields[3] = new Votes(totalYes, totalNo).toPlutus();

  const govNFT: Unit = ctx.daoParams.dao_nft.toUnit();

  // Validity: must be after voting period ends
  const validFrom = proposalStartTime + ctx.daoParams.voting_period + 1n;

  // Build transaction
  let txBuilder = ctx.txBuilder
    // Spend governance UTxO with MergeShardsGOV redeemer (ConStr2([]))
    .spendingPlutusScript("V3")
    .txIn(daoUTxO.input.txHash, daoUTxO.input.outputIndex, daoUTxO.output.amount, ctx.daoParams.governance_address)
    .txInRedeemerValue(conStr2([]), "JSON")
    .txInInlineDatumPresent()
    .txInScript(ctx.daoParams.governance_validator);

  // Spend all shard UTxOs with MergeShards redeemer (ConStr1([]))
  for (const shard of shardUTxOs) {
    txBuilder = txBuilder
      .spendingPlutusScript("V3")
      .txIn(shard.input.txHash, shard.input.outputIndex, shard.output.amount, ctx.daoParams.shards_manager_address)
      .txInRedeemerValue(conStr1([]), "JSON")
      .txInInlineDatumPresent()
      .txInScript(ctx.daoParams.shards_manager_validator);
  }

  // Output: updated governance UTxO with merged votes
  txBuilder = txBuilder
    .txOut(ctx.daoParams.governance_address, [{unit: "lovelace", quantity: MIN_ADA.toString()}, {unit: govNFT, quantity: "1"}])
    .txOutInlineDatumValue(govDatum, "JSON");

  const unsignedTx = await txBuilder
    .changeAddress(walletAddress)
    .selectUtxosFrom(utxos)
    .txInCollateral(collateralInput.txHash, collateralInput.outputIndex, collateralOutput.amount, collateralOutput.address)
    .invalidBefore(unixTimeToEnclosingSlot(Number(validFrom), ctx.daoParams.slot_config))
    .setNetwork("preview")
    .complete();

  const signedTx = await ctx.wallet.signTx(unsignedTx);
  const txhash = await ctx.wallet.submitTx(signedTx);
  console.log(txhash);

  // const evaluator = new OfflineEvaluator(ctx.provider, "preview");
  // const evaluateTx = await evaluator.evaluateTx(unsignedTx,[],[]);
  // console.log(evaluateTx);
}
