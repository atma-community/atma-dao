import { deserializeAddress, deserializeDatum, MeshValue } from "@meshsdk/core";
import { DAOContext, BasketState, GOVState, GOVDatum, PoolComposition, Proposal, ProposalAction, Votes } from "../daoContext";


// Get the basket_fee and current pool composition
export const get_basket_state = async (ctx: DAOContext): Promise<BasketState> => {

  const daoUTxO = await ctx.daoParams.daoUTxO(ctx.provider);
  const govDatum = deserializeDatum(daoUTxO.output.plutusData!);

  return BasketState.fromPlutus(govDatum.fields[0]);
}

// Get the current governance state
export const get_gov_state = async (ctx: DAOContext): Promise<GOVState> => {

  const daoUTxO = await ctx.daoParams.daoUTxO(ctx.provider);
  const govDatum = deserializeDatum(daoUTxO.output.plutusData!);

  return GOVState.fromPlutus(govDatum.fields[1]);
}

// Return the active proposal, this contains all the information related to the proposal
// like current votes, when it was started, what this proposal is about, etc
export const get_active_proposal = async (ctx: DAOContext): Promise<Proposal | null> => {

  const daoUTxO = await ctx.daoParams.daoUTxO(ctx.provider);
  const govDatumData = deserializeDatum(daoUTxO.output.plutusData!);
  const govDatum = GOVDatum.fromPlutus(govDatumData);

  return govDatum.ongoing_proposal;
}

// get the total votes for the given user, 0 means user has not voted.
export const get_user_vote = async (ctx: DAOContext): Promise<bigint> => {

  const { walletAddress } = await ctx.getWalletInfoForTx();
  const { pubKeyHash } = deserializeAddress(walletAddress);

  // Vote positions are now at the voting_position address
  const utxos = await ctx.provider.fetchAddressUTxOs(ctx.daoParams.voting_position_address);
  const votingToken = ctx.daoParams.voting_token.toUnit();

  // VotePositionDatum: ConStr0([owner, unlock_time])
  const userUTxOs = utxos.filter(utxo => {
    const tokenAmt = MeshValue.fromAssets(utxo.output.amount).get(votingToken);
    if (!tokenAmt || tokenAmt <= 0n) return false;
    const datum = deserializeDatum(utxo.output.plutusData!);
    return datum.fields[0].bytes == pubKeyHash;
  });

  const userVotes = userUTxOs.map(utxo => MeshValue.fromAssets(utxo.output.amount).get(votingToken));

  if (userVotes.length === 0) return 0n;
  return userVotes.reduce((pv, cv) => pv + cv);
}

// Get shard vote totals
export const get_shard_votes = async (ctx: DAOContext): Promise<Votes> => {

  const shardUtxos = await ctx.daoParams.shardUTxOs(ctx.provider);

  let totalYes = 0n;
  let totalNo = 0n;
  for (const shard of shardUtxos) {
    const datum = deserializeDatum(shard.output.plutusData!);
    const votes = datum.fields[0]; // ShardsDatum.votes
    totalYes += votes.fields[0].int;
    totalNo += votes.fields[1].int;
  }

  return new Votes(totalYes, totalNo);
}
