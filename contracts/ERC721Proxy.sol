// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {LibBytes} from "./libs/LibBytes.sol";
import {Authorizable} from "./Authorizable.sol";
import {IAssetProxy} from "./interfaces/IAssetProxy.sol";

contract ERC721Proxy is Authorizable, IAssetProxy {
  using LibBytes for bytes;
  // Id of this proxy.
  bytes4 internal constant PROXY_ID =
    bytes4(keccak256("ERC721Token(address,uint256)"));

  function transferFrom(
    bytes calldata assetData,
    address from,
    address to,
    uint256 amount
  ) external override onlyAuthorized {
    // Decode params from `assetData`
    // solhint-disable indent
    (address erc721TokenAddress, uint256 tokenId) = abi.decode(
      assetData.sliceDestructive(4, assetData.length),
      (address, uint256)
    );
    // solhint-enable indent

    // Execute `transferFrom` call
    // Either succeeds or throws
    IERC721(erc721TokenAddress).transferFrom(from, to, tokenId);
  }

  /// @dev Gets the proxy id associated with the proxy address.
  /// @return Proxy id.
  function getProxyId() external pure override returns (bytes4) {
    return PROXY_ID;
  }
}
