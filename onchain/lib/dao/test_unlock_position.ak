use cardano/transaction.{Transaction, placeholder}
use dao/types.{VotePositionDatum}
use dao/unlock_position.{handle_unlock_position}
use dao/test_helpers.{mock_owner, mock_validity_range}

const other_signer =
  #"11223344112233441122334411223344112233441122334411223344"

// --- Success cases ---

test unlock_position_success() {
  let datum = VotePositionDatum { owner: mock_owner, unlock_time: 100_000 }

  // lb = 100_001 > unlock_time (100_000), signed by owner
  let tx =
    Transaction {
      ..placeholder,
      extra_signatories: [mock_owner],
      validity_range: mock_validity_range(100_001, 100_005),
    }

  handle_unlock_position(datum, tx)
}

test unlock_position_success_exactly_at_unlock_time() {
  let datum = VotePositionDatum { owner: mock_owner, unlock_time: 100_000 }

  // lb = 100_000 == unlock_time, should pass (<=)
  let tx =
    Transaction {
      ..placeholder,
      extra_signatories: [mock_owner],
      validity_range: mock_validity_range(100_000, 100_005),
    }

  handle_unlock_position(datum, tx)
}

// --- Failure cases ---

test unlock_position_fails_too_early() fail {
  let datum = VotePositionDatum { owner: mock_owner, unlock_time: 100_000 }

  // lb = 99_000 < unlock_time (100_000)
  let tx =
    Transaction {
      ..placeholder,
      extra_signatories: [mock_owner],
      validity_range: mock_validity_range(99_000, 99_005),
    }

  handle_unlock_position(datum, tx)
}

test unlock_position_fails_not_signed_by_owner() fail {
  let datum = VotePositionDatum { owner: mock_owner, unlock_time: 100_000 }

  // Signed by someone else
  let tx =
    Transaction {
      ..placeholder,
      extra_signatories: [other_signer],
      validity_range: mock_validity_range(100_001, 100_005),
    }

  handle_unlock_position(datum, tx)
}

test unlock_position_fails_no_signature() fail {
  let datum = VotePositionDatum { owner: mock_owner, unlock_time: 100_000 }

  // No signers at all
  let tx =
    Transaction {
      ..placeholder,
      validity_range: mock_validity_range(100_001, 100_005),
    }

  handle_unlock_position(datum, tx)
}

test unlock_position_fails_too_early_and_wrong_signer() fail {
  let datum = VotePositionDatum { owner: mock_owner, unlock_time: 100_000 }

  // Both conditions fail
  let tx =
    Transaction {
      ..placeholder,
      extra_signatories: [other_signer],
      validity_range: mock_validity_range(99_000, 99_005),
    }

  handle_unlock_position(datum, tx)
}
