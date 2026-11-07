use cardano/transaction.{Transaction, Input, Output, OutputReference, InlineDatum, placeholder}
use cardano/address
use cardano/assets.{Value}
use cardano/assets
use aiken/interval.{Finite, Interval, IntervalBound}
use dao/types.{
  AssetClass, GOVParams, GOVDatum, GOVState, BasketState, Votes, Proposal,
  ShardsDatum, VotePositionDatum, ChangeBasketFeePercent,
}

// --- Constants ---

pub const gov_script_hash =
  #"00000000000000000000000000000000000000000000000000000001"

pub const shards_script_hash =
  #"00000000000000000000000000000000000000000000000000000002"

pub const vote_position_script_hash =
  #"00000000000000000000000000000000000000000000000000000003"

pub const mock_policy =
  #"00000000000000000000000000000000000000000000000000000010"

pub const mock_owner =
  #"aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd"

pub const mock_tx_id =
  #"0000000000000000000000000000000000000000000000000000000000000000"

// --- Asset helpers ---

pub fn dao_nft() -> AssetClass {
  AssetClass { policy_id: mock_policy, asset_name: "DAO" }
}

pub fn voting_token() -> AssetClass {
  AssetClass { policy_id: mock_policy, asset_name: "VOTE" }
}

pub fn dao_nft_value() -> Value {
  assets.from_lovelace(2_000_000)
    |> assets.merge(assets.from_asset(mock_policy, "DAO", 1))
}

pub fn value_without_dao_nft() -> Value {
  assets.from_lovelace(2_000_000)
}

// --- Mock constructors ---

pub fn mock_oref(idx: Int) -> OutputReference {
  OutputReference { transaction_id: mock_tx_id, output_index: idx }
}

pub fn mock_params() -> GOVParams {
  GOVParams {
    voting_token: voting_token(),
    voting_period: 100_000,
    basket_nft: AssetClass { policy_id: mock_policy, asset_name: "BASKET" },
    max_tx_validity_duration: 10_000,
    dao_nft: dao_nft(),
    shards_manager_script_hash: shards_script_hash,
    vote_position_manager_script_hash: vote_position_script_hash,
  }
}

pub fn mock_gov_state() -> GOVState {
  GOVState {
    proposal_deposit: 100_000_000,
    max_shards_amt: 10,
    voting_period: 100_000,
    effective_delay: 50_000,
    expiration_period: 200_000,
    quorum_threshold: 1000,
  }
}

pub fn mock_basket_state() -> BasketState {
  BasketState { basket_pool_composition: [], basket_fee_percent: 5 }
}

pub fn mock_gov_datum_no_proposal() -> GOVDatum {
  GOVDatum {
    basket_state: mock_basket_state(),
    gov_state: mock_gov_state(),
    ongoing_proposal: None,
  }
}

pub fn mock_gov_datum_with_proposal(proposal: Proposal) -> GOVDatum {
  GOVDatum {
    basket_state: mock_basket_state(),
    gov_state: mock_gov_state(),
    ongoing_proposal: Some(proposal),
  }
}

pub fn mock_proposal() -> Proposal {
  Proposal {
    start_time: 1000,
    action: ChangeBasketFeePercent { new_fee_percent: 10 },
    votes: Votes { yes: 0, no: 0 },
    shards_created: 0,
  }
}

pub fn mock_proposal_with_votes(yes: Int, no: Int, shards: Int) -> Proposal {
  Proposal {
    start_time: 1000,
    action: ChangeBasketFeePercent { new_fee_percent: 10 },
    votes: Votes { yes, no },
    shards_created: shards,
  }
}

// --- Transaction building ---

pub fn mock_validity_range(lower: Int, upper: Int) {
  Interval {
    lower_bound: IntervalBound { bound_type: Finite(lower), is_inclusive: True },
    upper_bound: IntervalBound { bound_type: Finite(upper), is_inclusive: True },
  }
}

pub fn mock_tx(
  inputs: List<Input>,
  outputs: List<Output>,
  lower: Int,
  upper: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: inputs,
    outputs: outputs,
    validity_range: mock_validity_range(lower, upper),
  }
}

// --- Input/Output builders ---

pub fn gov_script_input(
  oref: OutputReference,
  value: Value,
  datum: GOVDatum,
) -> Input {
  Input {
    output_reference: oref,
    output: Output {
      address: address.from_script(gov_script_hash),
      value: value,
      datum: InlineDatum(datum),
      reference_script: None,
    },
  }
}

pub fn gov_script_output(value: Value, datum: GOVDatum) -> Output {
  Output {
    address: address.from_script(gov_script_hash),
    value: value,
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

pub fn shard_script_input(
  oref: OutputReference,
  datum: ShardsDatum,
) -> Input {
  Input {
    output_reference: oref,
    output: Output {
      address: address.from_script(shards_script_hash),
      value: assets.from_lovelace(2_000_000),
      datum: InlineDatum(datum),
      reference_script: None,
    },
  }
}

pub fn shard_script_output_with_votes(votes: ShardsDatum) -> Output {
  Output {
    address: address.from_script(shards_script_hash),
    value: assets.from_lovelace(2_000_000),
    datum: InlineDatum(votes),
    reference_script: None,
  }
}

pub fn shard_script_output_with_datum(datum: ShardsDatum) -> Output {
  Output {
    address: address.from_script(shards_script_hash),
    value: assets.from_lovelace(2_000_000),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

pub fn vote_position_output(
  voting_token_amount: Int,
  unlock_time: Int,
) -> Output {
  Output {
    address: address.from_script(vote_position_script_hash),
    value: assets.from_lovelace(2_000_000)
      |> assets.merge(assets.from_asset(mock_policy, "VOTE", voting_token_amount)),
    datum: InlineDatum(
      VotePositionDatum { owner: mock_owner, unlock_time: unlock_time },
    ),
    reference_script: None,
  }
}
