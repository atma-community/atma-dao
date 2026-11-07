import { Unit } from "@meshsdk/core";
import { MIN_ADA } from "../utils";
import { DAOContext, GOVDatum, GOVState, BasketState, PoolComposition } from "../daoContext";

export async function initialize_contract(ctx: DAOContext) {

  const { utxos, walletAddress, collateral } = await ctx.getWalletInfoForTx();
  const { input: collateralInput, output: collateralOutput } = collateral;

  const govDatum = new GOVDatum(
    new BasketState(new PoolComposition([]), 0n),
    new GOVState(
      100_000_000n,  // proposal_deposit
      10n,           // max_shards_amt
      ctx.daoParams.voting_period,  // voting_period
      720_000n,       // effective_delay
      720_000n,      // expiration_period
      1000n          // quorum_threshold
    ),
    null
  ).toPlutus();

  const govNFT: Unit = ctx.daoParams.dao_nft.toUnit();

  const unsignedTx = await ctx.txBuilder
    .txOut(ctx.daoParams.governance_address, [
      { unit: "lovelace", quantity: MIN_ADA.toString() },
      { unit: govNFT, quantity: "1" },
    ])
    .txOutInlineDatumValue(govDatum, "JSON")
    .changeAddress(walletAddress)
    .selectUtxosFrom(utxos)
    .setNetwork("preview")
    .complete();

  const signedTx = await ctx.wallet.signTx(unsignedTx);
  const txhash = await ctx.wallet.submitTx(signedTx);
  console.log(`Tx submitted: ${txhash}`);
}
