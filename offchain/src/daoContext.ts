import { builtinByteString, conStr0, integer, applyParamsToScript, serializePlutusScript, UTxO, Unit, MeshValue, BlockfrostProvider, assocMap, BuiltinByteString, Integer, conStr1, conStr2, conStr3, MeshWallet, MeshTxBuilder, SlotConfig, SLOT_CONFIG_NETWORK, resolveScriptHash } from "@meshsdk/core";

import * as fs from 'fs';

export class AssetClass {
  constructor( public policyId: string , public assetname: string) {}

  toPlutus() {
	  return conStr0([builtinByteString(this.policyId), builtinByteString(this.assetname)]);
  }
  toUnit() {
	  return this.policyId + this.assetname;
  }
}

export class DAOParams {
  public governance_validator: string;
  public governance_address: string;
  public shards_manager_validator: string;
  public shards_manager_address: string;
  public voting_position_validator: string;
  public voting_position_address: string;
  public slot_config: SlotConfig;

  constructor(
    public voting_token: AssetClass,
    public voting_period: bigint,
    public basket_nft: AssetClass,
    public tx_validity_time: bigint,
    public dao_nft: AssetClass
  ) {
      const blueprint = JSON.parse(fs.readFileSync("./src/plutus.json").toString());

      // voting_position has no params — use compiled code directly
      const vp_compiled = blueprint.validators[6].compiledCode; // voting_position.main.mint
      this.voting_position_validator = vp_compiled;
      this.voting_position_address = serializePlutusScript({code: vp_compiled, version: "V3"}, undefined, 0).address;
      const vp_hash = resolveScriptHash(vp_compiled, "V3");

      // shards_manager and governance are parameterized with GOVParams
      // GOVParams includes shards_manager_script_hash which creates a bootstrapping issue.
      // We resolve it by using the blueprint hash as the initial shards_manager_script_hash.
      const shards_compiled = blueprint.validators[3].compiledCode; // shards_manager.main.mint
      const gov_compiled = blueprint.validators[0].compiledCode; // governance.main.mint

      const shards_blueprint_hash = blueprint.validators[3].hash;

      // Build GOVParams with blueprint hash, then apply
      const params_plutus = conStr0([
        this.voting_token.toPlutus(),
        integer(this.voting_period),
        this.basket_nft.toPlutus(),
        integer(this.tx_validity_time),
        this.dao_nft.toPlutus(),
        builtinByteString(shards_blueprint_hash),
        builtinByteString(vp_hash),
      ]);

      this.shards_manager_validator = applyParamsToScript(shards_compiled, [params_plutus], "JSON");
      this.shards_manager_address = serializePlutusScript({code: this.shards_manager_validator, version: "V3"}, undefined, 0).address;
      const shards_applied_hash = resolveScriptHash(this.shards_manager_validator, "V3");

      // Re-apply with the correct shards_manager hash
      const final_params = conStr0([
        this.voting_token.toPlutus(),
        integer(this.voting_period),
        this.basket_nft.toPlutus(),
        integer(this.tx_validity_time),
        this.dao_nft.toPlutus(),
        builtinByteString(shards_applied_hash),
        builtinByteString(vp_hash),
      ]);

      // this.shards_manager_validator = applyParamsToScript(shards_compiled, [final_params], "JSON");
      // this.shards_manager_address = serializePlutusScript({code: this.shards_manager_validator, version: "V3"}, undefined, 0).address;

      this.governance_validator = applyParamsToScript(gov_compiled, [final_params], "JSON");
      this.governance_address = serializePlutusScript({code: this.governance_validator, version: "V3"}, undefined, 0).address;

      this.slot_config = SLOT_CONFIG_NETWORK.preview;
    }

	 daoUTxO = async (provider: BlockfrostProvider): Promise<UTxO> =>  {
		const govNFT: Unit = this.dao_nft.policyId + this.dao_nft.assetname;
		const utxos = await provider.fetchAddressUTxOs(this.governance_address);
		const [daoUTxO] = utxos.filter(utxo => MeshValue.fromAssets(utxo.output.amount).get(govNFT) == 1n)
		return daoUTxO;
	}

	shardUTxOs = async (provider: BlockfrostProvider): Promise<UTxO[]> => {
		return await provider.fetchAddressUTxOs(this.shards_manager_address);
	}

	votePositionUTxOs = async (provider: BlockfrostProvider): Promise<UTxO[]> => {
		return await provider.fetchAddressUTxOs(this.voting_position_address);
	}
}

// --- BasketState ---
export class BasketState {
  constructor(
    public basket_pool_composition: PoolComposition,
    public basket_fee_percent: bigint
  ) {}

  toPlutus() {
    return conStr0([
      this.basket_pool_composition.toPlutus(),
      integer(this.basket_fee_percent),
    ]);
  }

  static fromPlutus(data: any): BasketState {
    return new BasketState(
      PoolComposition.fromPlutus(data.fields[0]),
      data.fields[1].int
    );
  }
}

// --- GOVState ---
export class GOVState {
  constructor(
    public proposal_deposit: bigint,
    public max_shards_amt: bigint,
    public voting_period: bigint,
    public effective_delay: bigint,
    public expiration_period: bigint,
    public quorum_threshold: bigint
  ) {}

  toPlutus() {
    return conStr0([
      integer(this.proposal_deposit),
      integer(this.max_shards_amt),
      integer(this.voting_period),
      integer(this.effective_delay),
      integer(this.expiration_period),
      integer(this.quorum_threshold),
    ]);
  }

  static fromPlutus(data: any): GOVState {
    return new GOVState(
      data.fields[0].int,
      data.fields[1].int,
      data.fields[2].int,
      data.fields[3].int,
      data.fields[4].int,
      data.fields[5].int
    );
  }
}

export class PoolComposition {

  constructor(public composition: [string, bigint][]) {}

  toPlutus() {
    return assocMap<BuiltinByteString,Integer>(this.composition.map(x => [builtinByteString(x[0]), integer(x[1])]));
  }

  static fromPlutus(plutus_data: any) {
    const comp = [];
    for (let i of plutus_data.map) {
      comp.push([i.k.bytes as string, i.v.int as bigint] as [string, bigint])
    }
    return new PoolComposition(comp);
  }
}


// --- ProposalAction ---
export class ProposalAction {
  kind: "ChangePoolComposition" | "ChangeBasketFeePercent" | "ChangeGovState";
  new_composition?: PoolComposition;
  new_fee_percent?: bigint;
  new_gov_state?: GOVState;

  private constructor(
    kind: "ChangePoolComposition" | "ChangeBasketFeePercent" | "ChangeGovState",
    new_composition?: PoolComposition,
    new_fee_percent?: bigint,
    new_gov_state?: GOVState
  ) {
    this.kind = kind;
    this.new_composition = new_composition;
    this.new_fee_percent = new_fee_percent;
    this.new_gov_state = new_gov_state;
  }

  static ChangePoolComposition(new_composition: PoolComposition) {
    return new ProposalAction("ChangePoolComposition", new_composition);
  }

  static ChangeBasketFeePercent(new_fee_percent: bigint) {
    return new ProposalAction("ChangeBasketFeePercent", undefined, new_fee_percent);
  }

  static ChangeGovState(new_gov_state: GOVState) {
    return new ProposalAction("ChangeGovState", undefined, undefined, new_gov_state);
  }

  toPlutus() {
    switch (this.kind) {
      case "ChangePoolComposition":
        return conStr0([this.new_composition!.toPlutus()]);
      case "ChangeBasketFeePercent":
        return conStr1([integer(this.new_fee_percent!)]);
      case "ChangeGovState":
        return conStr2([this.new_gov_state!.toPlutus()]);
    }
  }
}

// --- Votes ---
export class Votes {
  constructor(public yes: bigint, public no: bigint) {}

  toPlutus() {
    return conStr0([
      integer(this.yes),
      integer(this.no),
    ]);
  }
}

// --- Proposal ---
export class Proposal {
  constructor(
    public start_time: bigint,
    public action: ProposalAction,
    public shards_created: bigint,
    public votes: Votes
  ) {}

  toPlutus() {
    return conStr0([
      integer(this.start_time),
      this.action.toPlutus(),
      integer(this.shards_created),
      this.votes.toPlutus(),
    ]);
  }
}

// --- GOVDatum ---
export class GOVDatum {
  constructor(
    public basket_state: BasketState,
    public gov_state: GOVState,
    public ongoing_proposal: Proposal | null
  ) {}

  ongoing_proposal_to_plutus() {
    if (this.ongoing_proposal === null) {
      return conStr1([])
    } else {
      return conStr0([this.ongoing_proposal.toPlutus()])
    }
  }

  toPlutus() {
    return conStr0([
      this.basket_state.toPlutus(),
      this.gov_state.toPlutus(),
      this.ongoing_proposal_to_plutus(),
    ]);
  }

  static fromPlutus(data: any): GOVDatum {
    const basket_state = BasketState.fromPlutus(data.fields[0]);
    const gov_state = GOVState.fromPlutus(data.fields[1]);

    const proposalField = data.fields[2];
    let ongoing_proposal: Proposal | null = null;

    if (proposalField.constructor === 0n) {
      const p = proposalField.fields[0];
      const actionPlutus = p.fields[1];

      let action: ProposalAction;
      if (actionPlutus.constructor === 0n) {
        action = ProposalAction.ChangePoolComposition(PoolComposition.fromPlutus(actionPlutus.fields[0]));
      } else if (actionPlutus.constructor === 1n) {
        action = ProposalAction.ChangeBasketFeePercent(actionPlutus.fields[0].int);
      } else {
        action = ProposalAction.ChangeGovState(GOVState.fromPlutus(actionPlutus.fields[0]));
      }

      ongoing_proposal = new Proposal(
        p.fields[0].int,
        action,
        p.fields[2].int,
        new Votes(p.fields[3].fields[0].int, p.fields[3].fields[1].int)
      );
    }

    return new GOVDatum(basket_state, gov_state, ongoing_proposal);
  }
}

// --- ShardsDatum ---
export class ShardsDatum {
  constructor(public votes: Votes) {}

  toPlutus() {
    return conStr0([this.votes.toPlutus()]);
  }
}

// --- VotePositionDatum ---
export class VotePositionDatum {
  constructor(
    public owner: string,
    public unlock_time: bigint
  ) {}

  toPlutus() {
    return conStr0([
      builtinByteString(this.owner),
      integer(this.unlock_time),
    ]);
  }
}


export class DAOContext {
  constructor( public daoParams: DAOParams , public wallet: MeshWallet , public txBuilder: MeshTxBuilder , public provider: BlockfrostProvider) {}

  getWalletInfoForTx = async () => {
    console.log(await this.wallet.getBalance());
    const utxos = await this.wallet.getUtxos();
    const collateral = await this.wallet.getCollateral().then(utxos => utxos[0]);
    const walletAddress = this.wallet.getAddresses().baseAddressBech32!;
    if (!utxos || utxos?.length === 0) {
      throw new Error("No utxos found");
    }
    if (!collateral) {
      throw new Error("No collateral found");
    }
    if (!walletAddress) {
      throw new Error("No wallet address found");
    }
    return { utxos, collateral, walletAddress };
  };
}
