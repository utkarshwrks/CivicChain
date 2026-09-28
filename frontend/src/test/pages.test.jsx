import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { nftItem, CONTRACT, OWNER } from './fixtures.js';

const walletState = { wallet: null, reputation: 0, rewards: 0, nftCount: 0, role: null, isAuthenticated: false, refresh: vi.fn() };
vi.mock('../hooks/useWallet.jsx', () => ({ useWallet: () => walletState }));

const apiMock = {};
vi.mock('../utils/api.js', () => ({ api: new Proxy({}, { get: (_t, k) => apiMock[k] || (() => Promise.resolve({})) }) }));

const { default: ExplorerPage } = await import('../pages/ExplorerPage.jsx');
const { default: ProfilePage } = await import('../pages/ProfilePage.jsx');
const { default: FeedPage } = await import('../pages/FeedPage.jsx');

beforeEach(() => {
  for (const k of Object.keys(apiMock)) delete apiMock[k];
  Object.assign(walletState, { wallet: null, reputation: 0, rewards: 0, role: null, isAuthenticated: false });
  apiMock.cities = () => Promise.resolve({ cities: [{ code: 'JABALPUR', name: 'Jabalpur', state: 'MP' }] });
});

describe('ExplorerPage', () => {
  it('shows skeletons while loading, then the Sepolia strip and NFT cards', async () => {
    let resolve;
    apiMock.chainStatus = () => new Promise((r) => { resolve = r; });
    apiMock.nfts = () => Promise.resolve({ nfts: [nftItem], total: 1, pages: 1 });
    const { container } = render(<ExplorerPage />);
    expect(container.querySelectorAll('.cc-skel').length).toBeGreaterThan(0);
    resolve({ ready: true, chainId: 11155111, latestBlock: 42, contractAddress: CONTRACT, owner: OWNER, minter: OWNER, totalMinted: 1 });
    expect(await screen.findByText('Ethereum Sepolia Explorer')).toBeInTheDocument();
    expect(await screen.findByText('Token #7')).toBeInTheDocument();
    const strip = screen.getByTestId('network-strip');
    expect(strip).toHaveTextContent('Ethereum Sepolia');
    expect(strip).toHaveTextContent('11155111');
    const labels = [...strip.querySelectorAll('.l')].map((e) => e.textContent);
    expect(labels).toEqual(['Network', 'Chain ID', 'Latest block', 'NFT contract', 'Contract owner', 'Minter', 'Total NFTs minted']);
    const link = screen.getByRole('link', { name: /View on Etherscan/ });
    expect(link).toHaveAttribute('href', `https://sepolia.etherscan.io/nft/${CONTRACT}/7`);
  });

  it('empty state when no NFTs', async () => {
    apiMock.chainStatus = () => Promise.resolve({ ready: false, issues: ['NFT_CONTRACT_ADDRESS is not set'] });
    apiMock.nfts = () => Promise.resolve({ nfts: [], total: 0, pages: 0 });
    render(<ExplorerPage />);
    expect(await screen.findByText(/No Civic Issue NFTs minted yet/)).toBeInTheDocument();
    expect(screen.getByText(/minting is not ready/)).toBeInTheDocument();
  });
});

describe('ProfilePage', () => {
  it('asks to connect when there is no wallet', () => {
    render(<ProfilePage onConnect={() => {}} />);
    expect(screen.getByText('Connect your wallet')).toBeInTheDocument();
  });

  it('empty Civic NFT Collection with a CTA to Submit', async () => {
    walletState.wallet = { address: OWNER };
    apiMock.reports = () => Promise.resolve({ reports: [] });
    apiMock.nftsByOwner = () => Promise.resolve({ nfts: [], pending: [] });
    apiMock.leaderboard = () => Promise.resolve({ leaderboard: [] });
    const setTab = vi.fn();
    render(<ProfilePage setTab={setTab} />);
    expect(await screen.findByTestId('collection-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Submit a report/ }));
    expect(setTab).toHaveBeenCalledWith('Submit');
  });

  it('populated collection shows NFT cards and failed mints with Retry', async () => {
    walletState.wallet = { address: OWNER };
    const retryMint = vi.fn(() => Promise.resolve({ outcome: 'MINTED' }));
    apiMock.retryMint = retryMint;
    apiMock.reports = () => Promise.resolve({ reports: [{ reportId: 'RP-1', status: 'RESOLVED' }] });
    apiMock.nftsByOwner = () => Promise.resolve({
      nfts: [nftItem],
      pending: [{ reportId: 'RP-2', category: 'GARBAGE', severity: 'LOW', city: 'PUNE', nft: { status: 'NFT_MINT_FAILED', errorCode: 'INSUFFICIENT_FUNDS' } }],
    });
    apiMock.leaderboard = () => Promise.resolve({ leaderboard: [{ address: OWNER, score: 45, nftCount: 1 }] });
    render(<ProfilePage />);
    expect(await screen.findByTestId('collection-grid')).toBeInTheDocument();
    expect(screen.getByText('Token #7')).toBeInTheDocument();
    expect(screen.getByText('Mint failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry mint/ }));
    await waitFor(() => expect(retryMint).toHaveBeenCalledWith('RP-2'));
    expect(screen.getByText('Civic NFTs')).toBeInTheDocument();
  });
});

describe('FeedPage', () => {
  it('"NFT Minted ✓" badge opens the NFT detail modal; legacy reports show a subtle badge', async () => {
    apiMock.reports = () => Promise.resolve({ reports: [
      { id: 'RP-1', reportId: 'RP-1', category: 'ROAD_DAMAGE', severity: 'HIGH', status: 'OPEN', createdAt: Date.now(), description: 'pothole', location: { address: 'MP Nagar', city: 'BHOPAL' }, nft: { status: 'NFT_MINTED', tokenId: '7' } },
      { id: 'old', category: 'GARBAGE', severity: 'LOW', status: 'RESOLVED', createdAt: Date.now() - 1e6, description: 'old one', location: '{"city":"INDORE"}', nft: { status: 'NOT_ELIGIBLE_LEGACY' }, legacy: true },
    ], total: 2 });
    apiMock.analyticsOverview = () => Promise.resolve({ totalReports: 2 });
    apiMock.nft = vi.fn(() => Promise.resolve({ ...nftItem, verifiedOnChain: true }));
    render(<FeedPage />);
    const badge = await screen.findByRole('button', { name: /NFT Minted ✓/ });
    expect(screen.getByText('Legacy report')).toBeInTheDocument();
    expect(screen.getByText('MP Nagar · Bhopal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Verify/ })).not.toBeInTheDocument(); // citizen: no workflow actions
    fireEvent.click(badge);
    expect(await screen.findByRole('dialog', { name: /Civic Issue NFT 7/ })).toBeInTheDocument();
    await waitFor(() => expect(apiMock.nft).toHaveBeenCalledWith('7'));
    expect(await screen.findByText(/Verified on Ethereum Sepolia/)).toBeInTheDocument();
  });
});
