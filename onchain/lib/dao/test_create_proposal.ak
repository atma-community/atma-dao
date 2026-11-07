use cardano/transaction.{Transaction, placeholder}
use dao/types.{GOVDatum, Proposal, Votes, ChangeBasketFeePercent, ChangePoolComposition}
use dao/create_proposal.{handle_create_proposal}
use dao/test_helpers.{
  mock_params, mock_oref, mock_gov_datum_no_proposal, mock_gov_datum_with_proposal,
  mock_proposal, mock_basket_state, mock_gov_state, dao_nft_value,
  value_without_dao_nft, gov_script_input, gov_script_output, mock_validity_range,
}

// --- Helpers ---

fn success_tx() -> Transaction {
  let datum = mock_gov_datum_no_proposal()
  let oref = mock_oref(0)
  let action = ChangeBasketFeePercent { new_fee_percent: 10 }

  let expected_output_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(
        Proposal {
          start_time: 1000,
          action: action,
          votes: Votes { yes: 0, no: 0 },
          shards_created: 0,
        },
      ),
    }

  Transaction {
    ..placeholder,
    inputs: [gov_script_input(oref, dao_nft_value(), datum)],
    outputs: [gov_script_output(dao_nft_value(), expected_output_datum)],
    validity_range: mock_validity_range(1000, 1005),
  }
}

// --- Success cases ---

test create_proposal_success() {
  let params = mock_params()
  let datum = mock_gov_datum_no_proposal()
  let action = ChangeBasketFeePercent { new_fee_percent: 10 }
  handle_create_proposal(params, datum, action, mock_oref(0), success_tx())
}

test create_proposal_success_change_composition() {
  let params = mock_params()
  let datum = mock_gov_datum_no_proposal()
  let oref = mock_oref(0)
  let action = ChangePoolComposition { new_composition: [] }

  let expected_output_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(
        Proposal {
          start_time: 2000,
          action: action,
          votes: Votes { yes: 0, no: 0 },
          shards_created: 0,
        },
      ),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_output_datum)],
      validity_range: mock_validity_range(2000, 2005),
    }

  handle_create_proposal(params, datum, action, oref, tx)
}

// --- Failure cases ---

test create_proposal_fails_no_dao_nft_on_input() fail {
  let params = mock_params()
  let datum = mock_gov_datum_no_proposal()
  let action = ChangeBasketFeePercent { new_fee_percent: 10 }
  let oref = mock_oref(0)

  let expected_output_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(
        Proposal {
          start_time: 1000,
          action: action,
          votes: Votes { yes: 0, no: 0 },
          shards_created: 0,
        },
      ),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, value_without_dao_nft(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_output_datum)],
      validity_range: mock_validity_range(1000, 1005),
    }

  handle_create_proposal(params, datum, action, oref, tx)
}

test create_proposal_fails_ongoing_proposal_exists() fail {
  let params = mock_params()
  let datum = mock_gov_datum_with_proposal(mock_proposal())
  let action = ChangeBasketFeePercent { new_fee_percent: 10 }
  let oref = mock_oref(0)

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), datum)],
      validity_range: mock_validity_range(1000, 1005),
    }

  handle_create_proposal(params, datum, action, oref, tx)
}

test create_proposal_fails_no_dao_nft_on_output() fail {
  let params = mock_params()
  let datum = mock_gov_datum_no_proposal()
  let action = ChangeBasketFeePercent { new_fee_percent: 10 }
  let oref = mock_oref(0)

  let expected_output_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(
        Proposal {
          start_time: 1000,
          action: action,
          votes: Votes { yes: 0, no: 0 },
          shards_created: 0,
        },
      ),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(value_without_dao_nft(), expected_output_datum)],
      validity_range: mock_validity_range(1000, 1005),
    }

  handle_create_proposal(params, datum, action, oref, tx)
}

test create_proposal_fails_wrong_output_datum() fail {
  let params = mock_params()
  let datum = mock_gov_datum_no_proposal()
  let action = ChangeBasketFeePercent { new_fee_percent: 10 }
  let oref = mock_oref(0)

  // Output datum still has no proposal — wrong
  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), datum)],
      validity_range: mock_validity_range(1000, 1005),
    }

  handle_create_proposal(params, datum, action, oref, tx)
}

test create_proposal_fails_tx_validity_too_long() fail {
  let params = mock_params()
  let datum = mock_gov_datum_no_proposal()
  let action = ChangeBasketFeePercent { new_fee_percent: 10 }
  let oref = mock_oref(0)

  let expected_output_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(
        Proposal {
          start_time: 1000,
          action: action,
          votes: Votes { yes: 0, no: 0 },
          shards_created: 0,
        },
      ),
    }

  // Duration = 20_000 > max_tx_validity_duration (10_000)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_output_datum)],
      validity_range: mock_validity_range(1000, 21_000),
    }

  handle_create_proposal(params, datum, action, oref, tx)
}
