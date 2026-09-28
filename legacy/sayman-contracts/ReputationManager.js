/**
 * ReputationManager — CivicChain v2.1 (Style B Object VM format)
 */

const LEVELS = [
  { label: 'Newcomer',  min: 0   },
  { label: 'Rising',    min: 10  },
  { label: 'Trusted',   min: 50  },
  { label: 'Elite',     min: 100 },
  { label: 'Champion',  min: 200 },
];

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
      require(msg.sender === owner, 'Only owner can call this method');
    },

    _requireAuthorised() {
      const owner = this._getOwner();
      if (msg.sender === owner) return;
      const authorised = getState('authorised') || {};
      require(authorised[msg.sender], 'Caller is not authorised to modify reputation');
    },

    _addHistory(address, delta, reason) {
      const history = getState('history') || {};
      if (!history[address]) history[address] = [];
      history[address].push({ delta, reason, ts: blockTimestamp });
      if (history[address].length > 50) {
        history[address] = history[address].slice(-50);
      }
      setState('history', history);
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

    revokeAuthorisation(args) {
      this._requireOwner();
      const { address } = args;
      require(address, 'address required');
      const authorised = getState('authorised') || {};
      delete authorised[address];
      setState('authorised', authorised);
      return { success: true };
    },

    award(args) {
      this._requireAuthorised();
      const { address, points, reason } = args;
      require(address, 'address required');
      require(points && points > 0, 'points must be positive');

      const reputation = getState('reputation') || {};
      const current = reputation[address] || 0;
      const newScore = current + Math.floor(points);
      reputation[address] = newScore;
      setState('reputation', reputation);

      this._addHistory(address, Math.floor(points), reason || 'award');
      emit('ReputationAwarded', { address, points, newScore });
      return { success: true, newScore };
    },

    slash(args) {
      this._requireAuthorised();
      const { address, points, reason } = args;
      require(address, 'address required');
      require(points && points > 0, 'points must be positive');

      const reputation = getState('reputation') || {};
      const current = reputation[address] || 0;
      const newScore = Math.max(0, current - Math.floor(points));
      reputation[address] = newScore;
      setState('reputation', reputation);

      this._addHistory(address, -Math.floor(points), reason || 'slash');
      emit('ReputationSlashed', { address, points, newScore });
      return { success: true, newScore };
    },

    getScore(args) {
      const { address } = args;
      require(address, 'address required');
      const reputation = getState('reputation') || {};
      const score = reputation[address] || 0;
      const level = [...LEVELS].reverse().find(l => score >= l.min) || LEVELS[0];
      return { address, score, level: level.label };
    },

    getLeaderboard(args) {
      const limit = Math.min(50, parseInt(args.limit || 20));
      const reputation = getState('reputation') || {};
      const board = Object.entries(reputation)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([address, score]) => {
          const level = [...LEVELS].reverse().find(l => score >= l.min) || LEVELS[0];
          return { address, score, level: level.label };
        });
      return { leaderboard: board };
    },

    getHistory(args) {
      const { address } = args;
      require(address, 'address required');
      const history = getState('history') || {};
      return { history: history[address] || [] };
    },

    getLevels() {
      return { levels: LEVELS };
    }
  }
};