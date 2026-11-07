use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction, OutputReference}
use cardano/script_context.{ScriptContext}

use dao/types.{GOVParams, GOVDatum, GOVRedeemer, ActionRedeemer, CreateProposal, EndProposal, CreateShards, MergeShardsGOV}
use dao/create_proposal.{handle_create_proposal}
use dao/end_proposal.{handle_end_proposal}
use dao/create_shards.{handle_create_shards}
use dao/merge_shards.{handle_merge_shards}

validator main(params: GOVParams) {

  mint(_redeemer: ActionRedeemer, _policy_id: PolicyId, _self: Transaction) {
    False
  }

  spend(op_datum: Option<GOVDatum>, r: GOVRedeemer, utxo: OutputReference, self: Transaction) {
    expect Some(datum) = op_datum

    when r is {
      CreateProposal { action } -> handle_create_proposal(params, datum, action, utxo, self)
      CreateShards -> handle_create_shards(params, datum, utxo, self)
      MergeShardsGOV -> handle_merge_shards(params, datum, utxo, self)
      EndProposal -> handle_end_proposal(params, datum, utxo, self)
    }
    
  }

  else(_ctx: ScriptContext) {
    False
  }
  
}
