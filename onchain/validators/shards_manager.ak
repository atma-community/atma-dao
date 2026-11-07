use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction, OutputReference}
use cardano/script_context.{ScriptContext}
use dao/types.{ActionRedeemer, GOVParams, MergeShards, ShardsDatum, ShardsRedeemer, Vote}
use dao/vote.{handle_vote}
use dao/utils.{has_unit_value}
use aiken/collection/list


validator main(params: GOVParams) {

  mint(_redeemer: ActionRedeemer, _policy_id: PolicyId, _self: Transaction) {
    False
  }

  spend(op_datum: Option<ShardsDatum>, r: ShardsRedeemer, utxo: OutputReference, self: Transaction) {
    expect Some(datum) = op_datum

    when r is {
      Vote(choice) -> handle_vote(choice, params, datum, utxo, self)
      MergeShards  -> list.any(self.inputs, fn(input) {
        has_unit_value(input.output.value, params.dao_nft)
      })
    }
    
  }

  else(_ctx: ScriptContext) {
    False
  }
  
}
