import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NftRewardCard from '../components/NftRewardCard.jsx';
import { mintedResult, CONTRACT, TX } from './fixtures.js';

describe('NftRewardCard', () => {
  it('success: exact headings and every link points to the right URL', () => {
    render(<NftRewardCard result={mintedResult} />);
    expect(screen.getAllByText('Civic Issue Verified')).toHaveLength(2); // heading + checklist
    expect(screen.getByText(/NFT Reward — Civic Issue RP-1790000000000/)).toBeInTheDocument();
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText('ROAD DAMAGE')).toBeInTheDocument();
    expect(screen.getByText('96%')).toBeInTheDocument();
    expect(screen.getByText('Ethereum Sepolia')).toBeInTheDocument();
    expect(screen.getByText('Civic NFT Minted')).toBeInTheDocument();

    const href = (name) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href(/View on Sepolia Etherscan/)).toBe(`https://sepolia.etherscan.io/tx/${TX}`);
    expect(href(/View NFT on Etherscan/)).toBe(`https://sepolia.etherscan.io/nft/${CONTRACT}/7`);
    expect(href(/View NFT Metadata/)).toBe('https://gateway.pinata.cloud/ipfs/bafkmeta1234567890abcdefghijk');
    expect(href(/View Evidence/)).toBe('https://gateway.pinata.cloud/ipfs/bafkimage1234567890abcdefghij');
    for (const a of screen.getAllByRole('link')) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
    expect(screen.getByText(/testnet asset with no monetary value/)).toBeInTheDocument();
    expect(screen.getByText(/Also earned \(off-chain\)/)).toBeInTheDocument();
  });

  it('pending: spinner, tx link and "Check again" — never claims minted', () => {
    const onCheck = vi.fn();
    const result = { ...mintedResult, status: 'NFT_MINT_PENDING', nft: { status: 'NFT_MINT_PENDING', transactionHash: TX } };
    render(<NftRewardCard result={result} onCheck={onCheck} />);
    expect(screen.queryByText('Civic NFT Minted')).not.toBeInTheDocument();
    expect(screen.getByText(/Minting Civic NFT on Ethereum Sepolia/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Live transaction/ })).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${TX}`);
    fireEvent.click(screen.getByRole('button', { name: /Check again/ }));
    expect(onCheck).toHaveBeenCalled();
  });

  it('failed: "Report saved — NFT mint failed", reason, Retry calls the API handler', () => {
    const onRetry = vi.fn();
    const result = { ...mintedResult, status: 'NFT_MINT_FAILED', nft: { status: 'NFT_MINT_FAILED', errorCode: 'INSUFFICIENT_FUNDS', errorMessage: 'Minter wallet is out of test ETH' } };
    render(<NftRewardCard result={result} onRetry={onRetry} />);
    expect(screen.getByText('Report saved — NFT mint failed')).toBeInTheDocument();
    expect(screen.getByText(/out of test ETH/)).toBeInTheDocument();
    expect(screen.queryByText('Civic NFT Minted')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry mint/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['NOT_CIVIC_ISSUE', 'Not a civic issue'],
    ['FRAUD_BLOCKED', 'Report blocked'],
    ['DUPLICATE', 'Already reported'],
    ['AI_FAILED', 'AI verification unavailable'],
    ['IPFS_FAILED', 'Evidence storage failed'],
  ])('rejection %s shows a human message and no blockchain claims', (status, title) => {
    const onTry = vi.fn();
    render(<NftRewardCard result={{ status, existingReportId: 'RP-1', error: 'x' }} onTryAnother={onTry} />);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByText(/Etherscan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Minted/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try another photo/ }));
    expect(onTry).toHaveBeenCalled();
    if (status === 'DUPLICATE') expect(screen.getByText('RP-1')).toBeInTheDocument();
  });
});
