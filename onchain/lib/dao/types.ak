use cardano/assets.{AssetName, PolicyId}
use aiken/crypto.{VerificationKeyHash, ScriptHash}

pub type AssetClass {
  policy_id: PolicyId,
  asset_name: AssetName,
}
pub type PoolPubKeyHash = VerificationKeyHash
pub type PoolComposition = Pairs<PoolPubKeyHash, Int>
pub type Lovelace = Int
pub type POSIXTime = Int

pub type GOVParams {
  voting_token: AssetClass,
  voting_period: POSIXTime,
  basket_nft: AssetClass,
  max_tx_validity_duration: POSIXTime,
  dao_nft: AssetClass,
  shards_manager_script_hash: ScriptHash,
  vote_position_manager_script_hash: ScriptHash
}

pub type ProposalAction {
  ChangePoolComposition { new_composition: PoolComposition }
  ChangeBasketFeePercent { new_fee_percent: Int }
  ChangeGovState { new_gov_state: GOVState }
}

pub type Votes {
  yes: Int,
  no: Int
}

pub type Proposal {
  start_time: POSIXTime,
  action: ProposalAction,
  shards_created: Int,
  votes: Votes,
}

pub type GOVState {

  proposal_deposit: Lovelace,
  max_shards_amt: Int,

  voting_period: POSIXTime,
  effective_delay: POSIXTime,
  expiration_period: POSIXTime,
  quorum_threshold: Int,

}

pub type BasketState {
    basket_pool_composition: PoolComposition
  , basket_fee_percent: Int
}

pub type GOVDatum {
    basket_state: BasketState
  , gov_state: GOVState
  , ongoing_proposal: Option<Proposal> 
}

pub type VotePositionDatum {
    owner: VerificationKeyHash, unlock_time: Int 
}

pub type ActionRedeemer {}

pub type VoteAction {
  VoteYes
  VoteNo
}

pub type GOVRedeemer {
  CreateProposal { action: ProposalAction }
  CreateShards
  MergeShardsGOV
  EndProposal
}


pub type ShardsDatum {
  votes: Votes
}

pub type ShardsRedeemer {
  Vote(VoteAction) 
  MergeShards
}

pub type VotePositionRedeemer {
  UnlockPosition
}
