use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction, OutputReference}
use cardano/script_context.{ScriptContext}
use dao/types.{ActionRedeemer, VotePositionDatum, VotePositionRedeemer, UnlockPosition}
use dao/unlock_position.{handle_unlock_position}


validator main {

  mint(_redeemer: ActionRedeemer, _policy_id: PolicyId, _self: Transaction) {
    False
  }

  spend(op_datum: Option<VotePositionDatum>, r: VotePositionRedeemer, _utxo: OutputReference, self: Transaction) {
    expect Some(datum) = op_datum

    let UnlockPosition = r
    handle_unlock_position(datum, self)
  }

  else(_ctx: ScriptContext) {
    False
  }

}
