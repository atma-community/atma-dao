use cardano/transaction.{Transaction, placeholder}
use dao/types.{GOVDatum, Proposal, Votes, ShardsDatum, ChangeBasketFeePercent}
use dao/create_shards.{handle_create_shards}
use dao/test_helpers.{
  mock_params, mock_oref, mock_basket_state, mock_gov_state,
  dao_nft_value, gov_script_input, gov_script_output,
  shard_script_output_with_datum, mock_validity_range,
}

// effective_delay = 50_000, proposal.start_time = 1000
// => shards must be created before 51_000

fn base_proposal() -> Proposal {
  Proposal {
    start_time: 1000,
    action: ChangeBasketFeePercent { new_fee_percent: 10 },
    votes: Votes { yes: 0, no: 0 },
    shards_created: 0,
  }
}

fn datum_with_proposal(proposal: Proposal) -> GOVDatum {
  GOVDatum {
    basket_state: mock_basket_state(),
    gov_state: mock_gov_state(),
    ongoing_proposal: Some(proposal),
  }
}

fn empty_shard() -> ShardsDatum {
  ShardsDatum { votes: Votes { yes: 0, no: 0 } }
}

// --- Success cases ---

test create_shards_success_single_shard() {
  let params = mock_params()
  let proposal = base_proposal()
  let datum = datum_with_proposal(proposal)
  let oref = mock_oref(0)

  let updated_proposal =
    Proposal { ..proposal, shards_created: 1 }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(updated_proposal),
    }

  // ub = 2000 < 51_000 (start_time + effective_delay)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [
        gov_script_output(dao_nft_value(), expected_datum),
        shard_script_output_with_datum(empty_shard()),
      ],
      validity_range: mock_validity_range(1000, 2000),
    }

  handle_create_shards(params, datum, oref, tx)
}

test create_shards_success_multiple_shards() {
  let params = mock_params()
  let proposal = base_proposal()
  let datum = datum_with_proposal(proposal)
  let oref = mock_oref(0)

  let updated_proposal =
    Proposal { ..proposal, shards_created: 3 }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(updated_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [
        gov_script_output(dao_nft_value(), expected_datum),
        shard_script_output_with_datum(empty_shard()),
        shard_script_output_with_datum(empty_shard()),
        shard_script_output_with_datum(empty_shard()),
      ],
      validity_range: mock_validity_range(1000, 2000),
    }

  handle_create_shards(params, datum, oref, tx)
}

test create_shards_success_incremental() {
  let params = mock_params()
  // Already has 2 shards, creating 2 more
  let proposal =
    Proposal { ..base_proposal(), shards_created: 2 }
  let datum = datum_with_proposal(proposal)
  let oref = mock_oref(0)

  let updated_proposal =
    Proposal { ..proposal, shards_created: 4 }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(updated_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [
        gov_script_output(dao_nft_value(), expected_datum),
        shard_script_output_with_datum(empty_shard()),
        shard_script_output_with_datum(empty_shard()),
      ],
      validity_range: mock_validity_range(1000, 2000),
    }

  handle_create_shards(params, datum, oref, tx)
}

// --- Failure cases ---

test create_shards_fails_too_late() fail {
  let params = mock_params()
  let proposal = base_proposal()
  let datum = datum_with_proposal(proposal)
  let oref = mock_oref(0)

  let updated_proposal =
    Proposal { ..proposal, shards_created: 1 }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(updated_proposal),
    }

  // ub = 52_000 > 51_000 (start_time + effective_delay)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [
        gov_script_output(dao_nft_value(), expected_datum),
        shard_script_output_with_datum(empty_shard()),
      ],
      validity_range: mock_validity_range(50_000, 52_000),
    }

  handle_create_shards(params, datum, oref, tx)
}

test create_shards_fails_wrong_shard_count_in_datum() fail {
  let params = mock_params()
  let proposal = base_proposal()
  let datum = datum_with_proposal(proposal)
  let oref = mock_oref(0)

  // Says 5 shards but only 1 shard output
  let wrong_proposal =
    Proposal { ..proposal, shards_created: 5 }

  let wrong_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(wrong_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [
        gov_script_output(dao_nft_value(), wrong_datum),
        shard_script_output_with_datum(empty_shard()),
      ],
      validity_range: mock_validity_range(1000, 2000),
    }

  handle_create_shards(params, datum, oref, tx)
}
