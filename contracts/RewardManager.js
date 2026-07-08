/**
 * RewardManager — CrowdPulse v2.1 (Style B Object VM format)
 */

const REWARD_POINTS = {
  REPORT_CREATED:  10,
  REPORT_VERIFIED: 5,
  REPORT_RESOLVED: 20,
};

const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 day

const contract = {
  methods: {
    _getOwner() {
      let owner = getState('owner');
      if (!owner) {
        owner = msg.sender;
        setState('owner', owner);
      }
      return owner;
    },

    _requireOwner() {
      const owner = this._getOwner();
      require(msg.sender === owner, 'Only owner');
    },

    _requireAuthorised() {
      const owner = this._getOwner();
      if (msg.sender === owner) return;
      const authorised = getState('authorised') || {};
      require(authorised[msg.sender], 'Caller not authorised');
    },

    authorise(args) {
      this._requireOwner();
      const { address } = args;
      require(address, 'address required');
      const authorised = getState('authorised') || {};
      authorised[address] = true;
      setState('authorised', authorised);
      return { success: true };
    },

    addPoints(args) {
      this._requireAuthorised();
      const { address, points, reason } = args;
      require(address, 'address required');
      require(points && points > 0, 'points must be positive');

      const pointsStore = getState('points') || {};
      const current = pointsStore[address] || 0;
      const total = current + Math.floor(points);
      pointsStore[address] = total;
      setState('points', pointsStore);

      emit('PointsAdded', { address, points, reason, total });
      return { success: true, total };
    },

    deductPoints(args) {
      this._requireAuthorised();
      const { address, points, reason } = args;
      require(address, 'address required');
      require(points && points > 0, 'points must be positive');

      const pointsStore = getState('points') || {};
      const current = pointsStore[address] || 0;
      const total = Math.max(0, current - Math.floor(points));
      pointsStore[address] = total;
      setState('points', pointsStore);

      emit('PointsDeducted', { address, points, reason, total });
      return { success: true, total };
    },

    awardForAction(args) {
      this._requireAuthorised();
      const { address, action } = args;
      require(address, 'address required');
      const pts = REWARD_POINTS[action];
      require(pts, `Unknown action: ${action}`);

      const pointsStore = getState('points') || {};
      const current = pointsStore[address] || 0;
      const total = current + pts;
      pointsStore[address] = total;
      setState('points', pointsStore);

      emit('ActionRewarded', { address, action, points: pts, total });
      return { success: true, points: pts, total };
    },

    claimReward(args) {
      const address = msg.sender;
      const now = blockTimestamp;
      const claimedStore = getState('claimed') || {};
      const rec = claimedStore[address] || { total: 0, lastClaim: 0 };

      require(now - rec.lastClaim >= CLAIM_COOLDOWN_MS, 'Claim cooldown active — try again tomorrow');

      const pointsStore = getState('points') || {};
      const balance = pointsStore[address] || 0;
      require(balance > 0, 'No points to claim');

      claimedStore[address] = { total: rec.total + balance, lastClaim: now };
      setState('claimed', claimedStore);

      emit('RewardClaimed', { address, points: balance, timestamp: now });
      return { success: true, claimed: balance };
    },

    getPoints(args) {
      const { address } = args;
      require(address, 'address required');
      const pointsStore = getState('points') || {};
      return { address, points: pointsStore[address] || 0 };
    },

    getRewardTable() {
      return { rewards: REWARD_POINTS };
    }
  }
};