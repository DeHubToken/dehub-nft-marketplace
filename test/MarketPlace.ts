import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect, assert } from "chai";
import { JsonRpcProvider } from "@ethersproject/providers";
import {
  DeHubMarketplace,
  ERC1155Proxy,
  ERC20Proxy,
  ERC721Proxy,
  LibAssetData,
  MockNFT,
  MockNFT1155,
  MockWETH,
  MultiAssetProxy,
} from "../types";
import { signTyped } from "./utils/signature";
import { itShouldThrow } from "./utils/itShouldThrow";

const now = () => Math.round(Date.now() / 1000);

const olderDate = () => now() + 3600;

describe("Marketplace", async () => {
  let accounts: SignerWithAddress[],
    owner: SignerWithAddress,
    buyer: SignerWithAddress,
    seller: SignerWithAddress,
    royaltiesAddress: SignerWithAddress,
    feeCollectorAddress: SignerWithAddress;

  let chainId: number;
  const NULL_ADDRESS = ethers.constants.AddressZero;

  let exchange: DeHubMarketplace,
    libAssetData: LibAssetData,
    etherToken: MockWETH,
    erc20Proxy: ERC20Proxy,
    erc721Proxy: ERC721Proxy,
    erc1155Proxy: ERC1155Proxy,
    multiAssetProxy: MultiAssetProxy,
    nft: MockNFT,
    nft1155: MockNFT1155;

  let marketplaceIdentifier: string;

  before(async () => {
    accounts = await ethers.getSigners();
    [owner, buyer, seller, royaltiesAddress, feeCollectorAddress] = accounts;

    chainId = (await ethers.provider.getNetwork()).chainId;

    const ExchangeFactory = await ethers.getContractFactory("DeHubMarketplace");
    exchange = await ExchangeFactory.deploy();
    await exchange.deployed();
    await exchange.__DeHubMarketplace_init(chainId);

    const LibAssetDataFactory = await ethers.getContractFactory("LibAssetData");
    libAssetData = await LibAssetDataFactory.deploy();
    await libAssetData.deployed();

    const EtherTokenFactory = await ethers.getContractFactory("MockWETH");
    etherToken = await EtherTokenFactory.deploy();
    await etherToken.deployed();
    const WETH_ADDRESS = etherToken.address;

    const ERC20ProxyFactory = await ethers.getContractFactory("ERC20Proxy");
    erc20Proxy = await ERC20ProxyFactory.deploy();
    await erc20Proxy.deployed();

    const ERC721ProxyFactory = await ethers.getContractFactory("ERC721Proxy");
    erc721Proxy = await ERC721ProxyFactory.deploy();
    await erc721Proxy.deployed();

    const ERC1155ProxyFactory = await ethers.getContractFactory("ERC1155Proxy");
    erc1155Proxy = await ERC1155ProxyFactory.deploy();
    await erc1155Proxy.deployed();

    const MultiAssetProxyFactory = await ethers.getContractFactory(
      "MultiAssetProxy"
    );
    multiAssetProxy = await MultiAssetProxyFactory.deploy();
    await multiAssetProxy.deployed();

    const MockNFTFactory = await ethers.getContractFactory("MockNFT");
    nft = await MockNFTFactory.deploy("NFT Test", "NFTT");
    await nft.deployed();

    const MockNFT1155Factory = await ethers.getContractFactory("MockNFT1155");
    nft1155 = await MockNFT1155Factory.deploy();
    await nft1155.deployed();

    marketplaceIdentifier = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("nfttrade")
    );

    const owner2 = await erc20Proxy.owner();

    await erc20Proxy.connect(owner).addAuthorizedAddress(exchange.address);
    await erc721Proxy.connect(owner).addAuthorizedAddress(exchange.address);
    await erc1155Proxy.addAuthorizedAddress(exchange.address);
    await multiAssetProxy.addAuthorizedAddress(exchange.address);

    // MultiAssetProxy
    await erc20Proxy.addAuthorizedAddress(multiAssetProxy.address);
    await erc721Proxy.addAuthorizedAddress(multiAssetProxy.address);
    await erc1155Proxy.addAuthorizedAddress(multiAssetProxy.address);

    await multiAssetProxy.registerAssetProxy(erc20Proxy.address);
    await multiAssetProxy.registerAssetProxy(erc721Proxy.address);
    await multiAssetProxy.registerAssetProxy(erc1155Proxy.address);

    await exchange.registerAssetProxy(erc20Proxy.address);
    await exchange.registerAssetProxy(erc721Proxy.address);
    await exchange.registerAssetProxy(erc1155Proxy.address);
    await exchange.registerAssetProxy(multiAssetProxy.address);

    await erc20Proxy.addToken(WETH_ADDRESS);

    await exchange.setProtocolFeeMultiplier(ethers.BigNumber.from(20));
    await exchange.setProtocolFeeCollectorAddress(feeCollectorAddress.address);
    await exchange.registerMarketplace(
      marketplaceIdentifier,
      50,
      accounts[7].address
    );
  });

  const createNFT = async (from: SignerWithAddress) => {
    // minting a new NFT
    console.log({ async: "minting a new NFT", from });
    const mintTransaction = await nft.connect(from).mint(from.address, "12341");
    await mintTransaction.wait();

    const tokenId = await nft.currentTokenId();
    return tokenId;
  };

  const listNFT = async (
    from: SignerWithAddress,
    forToken: string,
    price: number,
    expire: number
  ) => {
    const tokenID = await createNFT(from);
    const takerAssetData = await libAssetData.encodeERC20AssetData(forToken);
    const id = await libAssetData.decodeAssetProxyId(takerAssetData);
    console.log(id);
    const makerAssetData = await libAssetData.encodeERC721AssetData(
      nft.address,
      tokenID
    );
    const newOrder = {
      chainId,
      exchangeAddress: exchange.address,
      makerAddress: from.address,
      takerAddress: NULL_ADDRESS,
      senderAddress: NULL_ADDRESS,
      royaltiesAddress: royaltiesAddress.address,
      expirationTimeSeconds: expire,
      salt: now(),
      makerAssetAmount: "1",
      takerAssetAmount: ethers.utils.parseEther(String(price)).toString(),
      makerAssetData,
      takerAssetData,
      royaltiesAmount: ethers.utils
        .parseEther(String(price))
        .div(10)
        .toString(),
    };

    const signedOrder = await signTyped(
      from.provider as JsonRpcProvider,
      newOrder,
      from.address,
      exchange.address
    );

    await nft.connect(from).setApprovalForAll(erc721Proxy.address, true); // need to check if already isApprovedForAll

    const orderInfo = await exchange.getOrderInfo(signedOrder);

    const { orderHash } = orderInfo;

    console.log(orderInfo);

    assert.isNotEmpty(orderHash);

    const isValid = await exchange.isValidHashSignature(
      orderHash,
      from.address,
      signedOrder.signature
    );

    assert.isTrue(isValid);

    return { signedOrder, orderHash };
  };

  const createNFT1155 = async (from: SignerWithAddress) => {
    // minting a new NFT
    console.log({ async: "minting a new NFT", from });
    const mintTransaction = await nft1155.connect(from).mint(from.address);
    await mintTransaction.wait();
    const tokenId = await nft1155.currentTokenId();
    return tokenId;
  };

  const listNFT1155 = async (
    from: SignerWithAddress,
    forToken: string,
    price: number,
    expire: number
  ) => {
    const tokenID = await createNFT1155(from);
    const takerAssetData = await libAssetData.encodeERC20AssetData(forToken);
    const id = await libAssetData.decodeAssetProxyId(takerAssetData);
    console.log(id);
    const makerAssetData = await libAssetData.encodeERC1155AssetData(
      nft1155.address,
      [tokenID],
      [1],
      "0x00"
    );
    const newOrder = {
      chainId,
      exchangeAddress: exchange.address,
      makerAddress: from.address,
      takerAddress: NULL_ADDRESS,
      senderAddress: NULL_ADDRESS,
      royaltiesAddress: royaltiesAddress.address,
      expirationTimeSeconds: expire,
      salt: now(),
      makerAssetAmount: "1",
      takerAssetAmount: ethers.utils.parseEther(String(price)).toString(),
      makerAssetData,
      takerAssetData,
      royaltiesAmount: ethers.utils.parseEther(String(price)).div(10).toString(),
    };

    const signedOrder = await signTyped(
      from.provider as JsonRpcProvider,
      newOrder,
      from.address,
      exchange.address
    );

    await nft1155.connect(from).setApprovalForAll(erc1155Proxy.address, true); // need to check if already isApprovedForAll

    const orderInfo = await exchange.getOrderInfo(signedOrder);

    const { orderHash } = orderInfo;

    console.log(orderInfo);

    assert.isNotEmpty(orderHash);

    const isValid = await exchange.isValidHashSignature(
      orderHash,
      from.address,
      signedOrder.signature
    );

    assert.isTrue(isValid);

    return { signedOrder, orderHash };
  };

  describe("Exchange Flow", () => {
    it("Buying a listed asset with erc 20", async () => {
      const order = await listNFT(seller, etherToken.address, 0.1, olderDate());
      const averageGas = await ethers.provider.getGasPrice();

      const value = order.signedOrder.takerAssetAmount;
      await etherToken.connect(buyer).deposit({ value });
      await etherToken.connect(buyer).approve(erc20Proxy.address, value);

      console.log(order);

      const buyOrder = await exchange
        .connect(buyer)
        .fillOrder(
          order.signedOrder,
          order.signedOrder.signature,
          marketplaceIdentifier
        );
    });

    it("Buying a listed asset with eth", async () => {
      // const averageGas = await ethers.provider.getGasPrice();
      const order = await listNFT(
        seller,
        NULL_ADDRESS,
        0.1,
        olderDate()
      );
      const value = order.signedOrder.takerAssetAmount;

      const royaltiesBalanceBefore = await ethers.provider.getBalance(
        royaltiesAddress.address
      );
      const feeCollectorBalanceBefore = await ethers.provider.getBalance(
        feeCollectorAddress.address
      );

      const buyOrder = await exchange.connect(buyer).fillOrder(
        order.signedOrder,
        order.signedOrder.signature,
        marketplaceIdentifier,
        {
          value,
        }
      );

      const royaltiesBalanceAfter = await ethers.provider.getBalance(
        royaltiesAddress.address
      );
      const feeCollectorBalanceAfter = await ethers.provider.getBalance(
        feeCollectorAddress.address
      );

      assert.equal(
        ethers.BigNumber.from(royaltiesBalanceAfter)
          .sub(royaltiesBalanceBefore),
          // .toFixed(),
        ethers.utils.parseEther(String(0.1 * 0.1))
      );
      assert.equal(
        ethers.BigNumber.from(feeCollectorBalanceAfter)
          .sub(feeCollectorBalanceBefore),
          // .toFixed(),
        ethers.utils.parseEther(String(0.1 * 0.02 * 0.5))
      );
    });

    it("Buying a listed asset with eth as a gift", async () => {
      const order = await listNFT(
        seller,
        NULL_ADDRESS,
        0.1,
        olderDate()
      );

      const value = order.signedOrder.takerAssetAmount;

      console.log(order);

      const buyOrder = await exchange.connect(buyer).fillOrderFor(
        order.signedOrder,
        order.signedOrder.signature,
        marketplaceIdentifier,
        accounts[4].address,
        {
          value,
        }
      );
    });

    it("Buying a listed 1155 asset with erc 20", async () => {
      const order = await listNFT1155(
        seller,
        etherToken.address,
        0.1,
        olderDate()
      );
      const averageGas = await ethers.provider.getGasPrice();

      const value = order.signedOrder.takerAssetAmount;
      await etherToken.connect(buyer).deposit({ value });
      await etherToken.connect(buyer).approve(erc20Proxy.address, value);

      console.log(order);

      const buyOrder = await exchange.connect(buyer).fillOrder(
        order.signedOrder,
        order.signedOrder.signature,
        marketplaceIdentifier,
        {
          // gasPrice: averageGas,
        }
      );
    });

    it("Buying a listed 1155 asset with eth", async () => {
      // const averageGas = await ethers.provider.getGasPrice();
      const order = await listNFT1155(
        seller,
        NULL_ADDRESS,
        0.1,
        olderDate()
      );
      const value = order.signedOrder.takerAssetAmount;

      const buyOrder = await exchange.connect(buyer).fillOrder(
        order.signedOrder,
        order.signedOrder.signature,
        marketplaceIdentifier,
        {
          value,
        }
      );
    });

    it("Buying a listed 1155 asset with eth as a gift", async () => {
      const order = await listNFT1155(
        seller,
        NULL_ADDRESS,
        0.1,
        olderDate()
      );

      const value = order.signedOrder.takerAssetAmount;

      console.log(order);

      const buyOrder = await exchange.connect(buyer).fillOrderFor(
        order.signedOrder,
        order.signedOrder.signature,
        marketplaceIdentifier,
        accounts[4].address,
        {
          value,
        }
      );
    });

    it("swap", async () => {
      const makerTokens = await Promise.all([
        await createNFT(seller),
        await createNFT(seller),
      ]);
      const takerTokens = await Promise.all([
        await createNFT(buyer),
        await createNFT(buyer),
      ]);

      const makerAssets = await Promise.all(
        makerTokens.map((tokenID) =>
          libAssetData.encodeERC721AssetData(nft.address, tokenID)
        )
      );

      const makerAssetData = await libAssetData.encodeMultiAssetData(
        [1, 1],
        makerAssets
      );

      const takerAssets = await Promise.all(
        takerTokens.map((tokenID) =>
          libAssetData.encodeERC721AssetData(nft.address, tokenID)
        )
      );

      const erc20Data = await libAssetData.encodeERC20AssetData(
        etherToken.address
      );

      takerAssets.push(erc20Data);

      const takerAssetData = await libAssetData.encodeMultiAssetData(
        [1, 1, ethers.utils.parseEther("1")],
        takerAssets
      );

      const newOrder = {
        chainId,
        exchangeAddress: exchange.address,
        makerAddress: seller.address,
        takerAddress: NULL_ADDRESS,
        senderAddress: NULL_ADDRESS,
        royaltiesAddress: NULL_ADDRESS,
        expirationTimeSeconds: olderDate(),
        salt: now(),
        makerAssetAmount: "1",
        takerAssetAmount: "1",
        makerAssetData,
        takerAssetData,
        royaltiesAmount: 0,
      };

      const signedOrder = await signTyped(
        seller.provider as JsonRpcProvider,
        newOrder,
        seller.address,
        exchange.address
      );

      await nft.connect(seller).setApprovalForAll(erc721Proxy.address, true);

      const orderInfo = await exchange.getOrderInfo(signedOrder);

      const { orderHash } = orderInfo;

      console.log(orderInfo);

      assert.isNotEmpty(orderHash);

      const isValid = await exchange.isValidHashSignature(
        orderHash,
        seller.address,
        signedOrder.signature
      );

      assert.isTrue(isValid);

      const order = { signedOrder, orderHash };

      // SWAP

      await nft.connect(buyer).setApprovalForAll(erc721Proxy.address, true);
      await etherToken.connect(buyer).deposit({
        value: ethers.utils.parseEther("1"),
      });
      await etherToken.connect(buyer).approve(
        erc20Proxy.address,
        ethers.utils.parseEther("1")
      );
      const fixedFee = ethers.utils.parseEther("0.1");
      await exchange.setProtocolFixedFee(fixedFee);
      const buyOrder = await exchange.connect(buyer).fillOrder(
        order.signedOrder,
        order.signedOrder.signature,
        marketplaceIdentifier,
        {
          value: fixedFee,
        }
      );
    });

    it("offer", async () => {
      const tokenID = await createNFT(seller);

      const makerAssetData = await libAssetData.encodeERC20AssetData(
        etherToken.address
      );

      const takerAssetData = await libAssetData.encodeERC721AssetData(
        nft.address,
        tokenID
      );

      await etherToken.connect(buyer).deposit({
        value: ethers.utils.parseEther("1"),
      });
      await etherToken.connect(buyer).approve(
        erc20Proxy.address,
        ethers.utils.parseEther("1")
      );

      const price = 0.1;

      const newOrder = {
        chainId,
        exchangeAddress: exchange.address,
        makerAddress: buyer.address,
        takerAddress: NULL_ADDRESS,
        senderAddress: NULL_ADDRESS,
        royaltiesAddress: royaltiesAddress.address,
        expirationTimeSeconds: olderDate(),
        salt: now(),
        makerAssetAmount: ethers.utils.parseEther(String(price)).toString(),
        takerAssetAmount: "1",
        makerAssetData,
        takerAssetData,
        royaltiesAmount: ethers.utils.parseEther(String(0.05)).toString(),
      };

      const signedOrder = await signTyped(
        buyer.provider as JsonRpcProvider,
        newOrder,
        buyer.address,
        exchange.address
      );

      await nft.connect(seller).setApprovalForAll(erc721Proxy.address, true);

      const orderInfo = await exchange.getOrderInfo(signedOrder);

      const { orderHash } = orderInfo;

      console.log(orderInfo);

      assert.isNotEmpty(orderHash);

      const isValid = await exchange.isValidHashSignature(
        orderHash,
        buyer.address,
        signedOrder.signature
      );

      assert.isTrue(isValid);

      const order = { signedOrder, orderHash };

      // ACCEPT OFFER

      await nft.connect(seller).setApprovalForAll(erc721Proxy.address, true);
      const buyOrder = await exchange.connect(seller).fillOrder(
        order.signedOrder,
        order.signedOrder.signature,
        marketplaceIdentifier
      );
    });

    it("withdraw all balance", async () => {
      await exchange.returnAllETHToOwner();
      await exchange.returnERC20ToOwner(etherToken.address);

      const balance1 = await etherToken.balanceOf(exchange.address);
      const balance2 = await ethers.provider.getBalance(exchange.address);

      assert.equal(balance1.toString(), ethers.BigNumber.from(0).toString());
      assert.equal(balance2.toString(), ethers.BigNumber.from(0).toString());
    });

    itShouldThrow(
      "cancel order and try to fulfill",
      async () => {
        const order = await listNFT(
          seller,
          NULL_ADDRESS,
          0.1,
          olderDate()
        );
        await exchange.connect(seller).cancelOrder(order.signedOrder);

        const value = order.signedOrder.takerAssetAmount;

        const buyOrder = await exchange.connect(buyer).fillOrder(
          order.signedOrder,
          order.signedOrder.signature,
          marketplaceIdentifier,
          {
            value,
          }
        );
      },
      "EXCHANGE: status not fillable"
    );

    itShouldThrow(
      "cancel by epoc and try to fulfill",
      async () => {
        const order = await listNFT(
          seller,
          NULL_ADDRESS,
          0.1,
          olderDate()
        );
        await exchange.connect(seller).cancelOrdersUpTo(now().toString());

        const value = order.signedOrder.takerAssetAmount;

        const buyOrder = await exchange.connect(buyer).fillOrder(
          order.signedOrder,
          order.signedOrder.signature,
          marketplaceIdentifier,
          {
            value,
          }
        );
      },
      "EXCHANGE: status not fillable"
    );

    itShouldThrow(
      "try to fulfill expired",
      async () => {
        const order = await listNFT(
          seller,
          NULL_ADDRESS,
          0.1,
          now() - 1
        );

        const value = order.signedOrder.takerAssetAmount;

        const buyOrder = await exchange.connect(buyer).fillOrder(
          order.signedOrder,
          order.signedOrder.signature,
          marketplaceIdentifier,
          {
            value,
          }
        );
      },
      "EXCHANGE: status not fillable"
    );

    itShouldThrow(
      "try to fulfill filled",
      async () => {
        const order = await listNFT(
          seller,
          NULL_ADDRESS,
          0.1,
          olderDate()
        );

        const value = order.signedOrder.takerAssetAmount;

        const buyOrder = await exchange.connect(buyer).fillOrder(
          order.signedOrder,
          order.signedOrder.signature,
          marketplaceIdentifier,
          {
            value,
          }
        );

        const tx = await exchange.connect(accounts[5]).fillOrder(
          order.signedOrder,
          order.signedOrder.signature,
          marketplaceIdentifier,
          {
            value,
          }
        );
      },
      "EXCHANGE: status not fillable"
    );
  });
});
