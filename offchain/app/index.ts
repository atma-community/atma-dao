import config from '../config.json';

import { BlockfrostProvider, MeshWallet, MeshTxBuilder } from '@meshsdk/core';

import { initialize_contract } from '../src/endpoints/initialize';
import { create_proposal } from '../src/endpoints/create_proposal';
import { create_shards } from '../src/endpoints/create_shards';
import { end_proposal } from '../src/endpoints/end_proposal';
import { make_vote } from '../src/endpoints/vote';
import { merge_shards } from '../src/endpoints/merge_shards';
import { unlock_position } from '../src/endpoints/unlock_position';
import { get_active_proposal, get_basket_state, get_gov_state, get_user_vote, get_shard_votes } from '../src/endpoints/stats';
import { DAOParams, AssetClass, DAOContext, ProposalAction, PoolComposition } from '../src/daoContext';


const blockchainProvider = new BlockfrostProvider(config.setup.blockfrostKey);

const wallet = new MeshWallet({
  networkId: 0, // 0: testnet, 1: mainnet
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: 'mnemonic',
    words: config.setup.adminSeed.split(" "),
  },
});

await wallet.init()
const txBuilder = new MeshTxBuilder({ fetcher: blockchainProvider, verbose: false, });


const daoParams = new DAOParams(
  new AssetClass("d53989cc7e67573fb917b0d42f1b2053dbf93886c0817d7f8a43452d", "c382544d41"),
  1000n * 1800n,
  new AssetClass("c450b3e21b1e98bb559bfbaf3b9fd9df60d7df9e0ce62cedd56912ea", "000de1404049414d50415241444f58"),
  1000n * 300n,
  new AssetClass("37251152c9a667859f6fb9b696a0213eb7aaf1c7f3de19984aaab2e4", "4b61726d61"),
);

export const daoContext = new DAOContext( daoParams
                                        , wallet
                                        , txBuilder
                                        , blockchainProvider
                                        )

await initialize_contract(daoContext)
// await create_proposal(ProposalAction.ChangeBasketFeePercent(15n), daoContext);
// console.log(await get_user_vote(daoContext));
// console.log(await get_active_proposal(daoContext));
// console.log(await get_basket_state(daoContext));
// console.log(await get_gov_state(daoContext));
// console.log(await get_shard_votes(daoContext));

// await create_shards(3, daoContext);
// await make_vote("Yes", 100n, "TX_HASH", 0, daoContext);
// await merge_shards(daoContext);
// await end_proposal(daoContext);
// await unlock_position("TX_HASH", 0, daoContext)
