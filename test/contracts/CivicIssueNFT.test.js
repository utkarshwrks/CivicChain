import { expect } from 'chai';
import hre from 'hardhat';

const { ethers } = hre;
const URI_1 = 'ipfs://bafkreimetadataone';
const URI_2 = 'ipfs://bafkreimetadatatwo';
const URI_3 = 'ipfs://bafkreimetadatathree';

describe('CivicIssueNFT', function () {
  async function deploy() {
    const [owner, minter, citizen, other, newMinter] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('CivicIssueNFT');
    const nft = await Factory.deploy(owner.address, minter.address);
    await nft.waitForDeployment();
    return { nft, owner, minter, citizen, other, newMinter };
  }

  it('has the CivicChain name and CIVIC symbol', async function () {
    const { nft } = await deploy();
    expect(await nft.name()).to.equal('CivicChain Civic Issue');
    expect(await nft.symbol()).to.equal('CIVIC');
  });

  it('sets the owner', async function () {
    const { nft, owner } = await deploy();
    expect(await nft.owner()).to.equal(owner.address);
  });

  it('sets the initial authorised minter', async function () {
    const { nft, minter } = await deploy();
    expect(await nft.minter()).to.equal(minter.address);
  });

  it('rejects a zero-address initial minter', async function () {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('CivicIssueNFT');
    await expect(Factory.deploy(owner.address, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(Factory, 'ZeroAddress');
  });

  it('reverts with NotMinter when an unauthorised account mints', async function () {
    const { nft, other, citizen } = await deploy();
    await expect(nft.connect(other).mintCivicIssueNFT(citizen.address, URI_1))
      .to.be.revertedWithCustomError(nft, 'NotMinter')
      .withArgs(other.address);
  });

  it('owner cannot mint unless it is the minter', async function () {
    const { nft, owner, citizen } = await deploy();
    await expect(nft.connect(owner).mintCivicIssueNFT(citizen.address, URI_1))
      .to.be.revertedWithCustomError(nft, 'NotMinter');
  });

  it('mints token 1 and emits CivicIssueNFTMinted with the right args', async function () {
    const { nft, minter, citizen } = await deploy();
    const tokenId = await nft.connect(minter).mintCivicIssueNFT.staticCall(citizen.address, URI_1);
    expect(tokenId).to.equal(1n);
    await expect(nft.connect(minter).mintCivicIssueNFT(citizen.address, URI_1))
      .to.emit(nft, 'CivicIssueNFTMinted')
      .withArgs(1n, citizen.address, URI_1);
  });

  it('stores the tokenURI and assigns ownership to the recipient', async function () {
    const { nft, minter, citizen } = await deploy();
    await nft.connect(minter).mintCivicIssueNFT(citizen.address, URI_1);
    expect(await nft.tokenURI(1)).to.equal(URI_1);
    expect(await nft.ownerOf(1)).to.equal(citizen.address);
    expect(await nft.balanceOf(citizen.address)).to.equal(1n);
  });

  it('increments token ids 1, 2, 3 and tracks totalMinted', async function () {
    const { nft, minter, citizen, other } = await deploy();
    expect(await nft.totalMinted()).to.equal(0n);
    await nft.connect(minter).mintCivicIssueNFT(citizen.address, URI_1);
    await nft.connect(minter).mintCivicIssueNFT(other.address, URI_2);
    await nft.connect(minter).mintCivicIssueNFT(citizen.address, URI_3);
    expect(await nft.ownerOf(1)).to.equal(citizen.address);
    expect(await nft.ownerOf(2)).to.equal(other.address);
    expect(await nft.ownerOf(3)).to.equal(citizen.address);
    expect(await nft.tokenURI(3)).to.equal(URI_3);
    expect(await nft.totalMinted()).to.equal(3n);
  });

  it('reverts on a zero-address recipient', async function () {
    const { nft, minter } = await deploy();
    await expect(nft.connect(minter).mintCivicIssueNFT(ethers.ZeroAddress, URI_1))
      .to.be.revertedWithCustomError(nft, 'ZeroAddress');
  });

  it('reverts on an empty token URI', async function () {
    const { nft, minter, citizen } = await deploy();
    await expect(nft.connect(minter).mintCivicIssueNFT(citizen.address, ''))
      .to.be.revertedWithCustomError(nft, 'EmptyTokenURI');
  });

  it('owner can change the minter and MinterUpdated is emitted', async function () {
    const { nft, owner, minter, newMinter } = await deploy();
    await expect(nft.connect(owner).setMinter(newMinter.address))
      .to.emit(nft, 'MinterUpdated')
      .withArgs(minter.address, newMinter.address);
    expect(await nft.minter()).to.equal(newMinter.address);
  });

  it('setMinter rejects the zero address', async function () {
    const { nft, owner } = await deploy();
    await expect(nft.connect(owner).setMinter(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(nft, 'ZeroAddress');
  });

  it('non-owner cannot change the minter (OwnableUnauthorizedAccount)', async function () {
    const { nft, other, newMinter } = await deploy();
    await expect(nft.connect(other).setMinter(newMinter.address))
      .to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
  });

  it('the old minter can no longer mint after a minter change', async function () {
    const { nft, owner, minter, newMinter, citizen } = await deploy();
    await nft.connect(owner).setMinter(newMinter.address);
    await expect(nft.connect(minter).mintCivicIssueNFT(citizen.address, URI_1))
      .to.be.revertedWithCustomError(nft, 'NotMinter')
      .withArgs(minter.address);
    await expect(nft.connect(newMinter).mintCivicIssueNFT(citizen.address, URI_1))
      .to.emit(nft, 'CivicIssueNFTMinted');
  });

  it('mints to a plain EOA that the minter does not control', async function () {
    const { nft, minter } = await deploy();
    const eoa = ethers.Wallet.createRandom().address;
    await nft.connect(minter).mintCivicIssueNFT(eoa, URI_1);
    expect(await nft.ownerOf(1)).to.equal(eoa);
  });

  it('tokens stay transferable (standard ERC-721)', async function () {
    const { nft, minter, citizen, other } = await deploy();
    await nft.connect(minter).mintCivicIssueNFT(citizen.address, URI_1);
    await nft.connect(citizen).transferFrom(citizen.address, other.address, 1);
    expect(await nft.ownerOf(1)).to.equal(other.address);
  });

  it('supports ERC-721 and ERC-4906 interfaces', async function () {
    const { nft } = await deploy();
    expect(await nft.supportsInterface('0x80ac58cd')).to.equal(true); // ERC-721
    expect(await nft.supportsInterface('0x5b5e139f')).to.equal(true); // ERC-721 Metadata
    expect(await nft.supportsInterface('0x49064906')).to.equal(true); // ERC-4906
  });
});
