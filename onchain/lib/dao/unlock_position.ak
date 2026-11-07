use cardano/transaction.{Transaction}
use dao/types.{VotePositionDatum}
use dao/utils.{trace_if_false, interval_finite_lower_bound, must_be_signed_by}

pub fn handle_unlock_position(datum: VotePositionDatum, tx: Transaction) {

  let Transaction{validity_range, ..} = tx
  let tx_validity_range_lb = interval_finite_lower_bound(validity_range)

  let VotePositionDatum{owner, unlock_time} = datum

  and {
    trace_if_false(@"Too early to unlock", unlock_time <= tx_validity_range_lb),
    trace_if_false(@"Not signed by the owner", must_be_signed_by(tx, owner)),
  }

}

