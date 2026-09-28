// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  CivicIssueNFT — CivicChain Civic Issue reward token (Ethereum Sepolia)
 * @notice One ERC-721 token is minted to a citizen for every civic report that
 *         passed CivicChain's validation pipeline: Gemini AI verification, the
 *         fraud gate and the duplicate check, with the evidence image and the
 *         token metadata pinned to IPFS.
 * @dev    The token certifies that a validated report was SUBMITTED. It does NOT
 *         certify that the issue was resolved — the governance workflow
 *         (OPEN → VERIFIED → IN_PROGRESS → RESOLVED) lives off-chain and never
 *         rewrites a token. Only the authorised backend minter wallet can mint;
 *         the citizen never pays gas. Tokens are standard, transferable ERC-721s.
 *         No upgradeability, no ERC-20, no payable functions.
 *         Sepolia is a test network: these tokens have no monetary value.
 */
contract CivicIssueNFT is ERC721URIStorage, Ownable {
    /// @dev Monotonically increasing token id; the first token is #1.
    uint256 private _nextTokenId = 1;

    /// @notice The authorised backend minter wallet.
    address public minter;

    /// @notice Emitted on every mint; the backend reads the token id from it.
    event CivicIssueNFTMinted(uint256 indexed tokenId, address indexed recipient, string tokenURI);

    /// @notice Emitted when the owner changes the authorised minter.
    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    /// @notice Caller is not the authorised minter.
    error NotMinter(address caller);
    /// @notice Recipient or new minter is the zero address.
    error ZeroAddress();
    /// @notice The supplied token URI is empty.
    error EmptyTokenURI();

    /**
     * @param initialOwner  Account allowed to change the minter (the deployer).
     * @param initialMinter Backend wallet allowed to mint Civic Issue NFTs.
     */
    constructor(address initialOwner, address initialMinter)
        ERC721("CivicChain Civic Issue", "CIVIC")
        Ownable(initialOwner)
    {
        if (initialMinter == address(0)) revert ZeroAddress();
        minter = initialMinter;
        emit MinterUpdated(address(0), initialMinter);
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        _;
    }

    /**
     * @notice Mint the next Civic Issue NFT to `recipient`.
     * @param recipient Citizen wallet that submitted the validated report.
     * @param tokenURI_ ipfs://<metadataCid> of the pinned NFT metadata JSON.
     * @return tokenId  The id of the newly minted token.
     */
    function mintCivicIssueNFT(address recipient, string calldata tokenURI_)
        external
        onlyMinter
        returns (uint256 tokenId)
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (bytes(tokenURI_).length == 0) revert EmptyTokenURI();

        tokenId = _nextTokenId++;
        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        emit CivicIssueNFTMinted(tokenId, recipient, tokenURI_);
    }

    /**
     * @notice Change the authorised minter. Owner only.
     * @param newMinter New backend minter wallet.
     */
    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) revert ZeroAddress();
        address previous = minter;
        minter = newMinter;
        emit MinterUpdated(previous, newMinter);
    }

    /// @notice Number of Civic Issue NFTs minted so far.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
