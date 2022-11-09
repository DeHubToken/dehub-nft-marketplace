// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {LibEIP712} from "./libs/LibEIP712.sol";

contract LibEIP712ExchangeDomain is Initializable {
  // EIP712 Exchange Domain Name value
  string internal constant DOMAIN_NAME = "DeHub Marketplace";

  // EIP712 Exchange Domain Version value
  string internal constant DOMAIN_VERSION = "2.0";

  // solhint-disable var-name-mixedcase
  /// @dev Hash of the EIP712 Domain Separator data
  /// @return 0 Domain hash.
  bytes32 public DOMAIN_HASH;

  // solhint-enable var-name-mixedcase

  /// @param chainId Chain ID of the network this contract is deployed on.
  function __LibEIP712ExchangeDomain_init(
    uint256 chainId
  ) internal onlyInitializing {
    DOMAIN_HASH = LibEIP712.hashDomain(
      DOMAIN_NAME,
      DOMAIN_VERSION,
      chainId,
      address(this)
    );
  }
}
