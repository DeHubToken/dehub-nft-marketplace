import ethers from "ethers";
import { fromRpcSig, bufferToHex, toBuffer } from "ethereumjs-util";

const EIP712Domain = [
  {
    name: "name",
    type: "string",
  },
  {
    name: "version",
    type: "string",
  },
  {
    name: "chainId",
    type: "uint256",
  },
  {
    name: "verifyingContract",
    type: "address",
  },
];

const Order = [
  {
    name: "makerAddress",
    type: "address",
  },
  {
    name: "takerAddress",
    type: "address",
  },
  {
    name: "royaltiesAddress",
    type: "address",
  },
  {
    name: "senderAddress",
    type: "address",
  },
  {
    name: "makerAssetAmount",
    type: "uint256",
  },
  {
    name: "takerAssetAmount",
    type: "uint256",
  },
  {
    name: "royaltiesAmount",
    type: "uint256",
  },
  {
    name: "expirationTimeSeconds",
    type: "uint256",
  },
  {
    name: "salt",
    type: "uint256",
  },
  {
    name: "makerAssetData",
    type: "bytes",
  },
  {
    name: "takerAssetData",
    type: "bytes",
  },
];

// /**
//  *   @send - send message to and open metamask
//  */
// const send = (provider: ethers.providers.Provider, data: any) =>
//   new Promise((resolve, reject) =>
//     provider
//       .sendTransaction(data)
//       .then((value: ethers.providers.TransactionResponse) => {
//         resolve(value);
//       })
//       .catch((err: any) => reject(err))
//   );

/**
 *   @signTypedData - function that handles signing and metamask interaction
 */
const signTypedData = async (
  provider: ethers.providers.JsonRpcProvider,
  address: string,
  payload: any
): Promise<string> => {
  // const typedData = {
  //   id: "44",
  //   params: [address, payload],
  //   jsonrpc: "2.0",
  //   method: "eth_signTypedData",
  // };
  // return send(provider, typedData);

  return provider.send("eth_signTypedData_v4", [address, payload]);
};

const signTyped = async (
  provider: ethers.providers.JsonRpcProvider,
  order: any,
  from: string,
  verifyingContract: any
) => {
  const typedData = {
    types: {
      EIP712Domain,
      Order,
    },
    domain: {
      name: "DeHub Marketplace",
      version: "2.0",
      chainId: order.chainId,
      verifyingContract,
    },
    message: order,
    primaryType: "Order",
  };

  const signature = await signTypedData(provider, from, typedData);

  const { v, r, s } = fromRpcSig(signature);
  const ecSignature = {
    v,
    r: bufferToHex(r),
    s: bufferToHex(s),
  };
  const signatureBuffer = Buffer.concat([
    toBuffer(ecSignature.v),
    toBuffer(ecSignature.r),
    toBuffer(ecSignature.s),
    toBuffer(2),
  ]);
  const signatureHex = `0x${signatureBuffer.toString("hex")}`;

  return { ...order, signature: signatureHex };
};

export { signTyped };
