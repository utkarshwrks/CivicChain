/**
 * ReportRegistry — CivicChain v2.1 (Style B Object VM format)
 */

const VALID_CATEGORIES = [
  'ROAD_DAMAGE', 'FLOOD', 'FIRE', 'STREETLIGHT',
  'GARBAGE', 'WATER_LEAK', 'UNSAFE_BUILDING', 'OTHER',
];

const contract = {
  methods: {
    createReport(args) {
      const { description, category, location } = args;

      require(description, 'Missing required field: description');
      require(category,    'Missing required field: category');
      require(location,    'Missing required field: location');

      require(VALID_CATEGORIES.includes(category), `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
      require(description.length >= 10, 'Description must be at least 10 characters');
      require(description.length <= 1000, 'Description too long (max 1000 chars)');

      const count = getState('count') || 0;
      const reports = getState('reports') || {};
      const reportIds = getState('reportIds') || [];

      const id = `rpt_${blockTimestamp}_${count}`;
      
      const locationStr = typeof location === 'string'
        ? location.slice(0, 200)
        : JSON.stringify(location).slice(0, 200);

      const report = {
        id,
        reporter:    msg.sender,
        description: description.slice(0, 1000),
        category,
        location:    locationStr,
        status:      'OPEN',
        createdAt:   blockTimestamp,
        updatedAt:   blockTimestamp,
        verifiedBy:  null,
        resolvedBy:  null,
        aiCategory:  args.aiCategory  || null,
        aiConfidence: args.aiConfidence || null,
      };

      reports[id] = report;
      reportIds.push(id);

      setState('reports', reports);
      setState('reportIds', reportIds);
      setState('count', count + 1);

      emit('ReportCreated', { id, reporter: msg.sender, category, location: locationStr });

      return { success: true, report };
    },

    verifyReport(args) {
      const { reportId } = args;
      require(reportId, 'Missing required field: reportId');

      const reports = getState('reports') || {};
      const report = reports[reportId];
      require(report, `Report not found: ${reportId}`);
      require(report.status === 'OPEN', 'Report is not OPEN');
      require(report.reporter !== msg.sender, 'Reporter cannot verify their own report');

      report.status     = 'VERIFIED';
      report.verifiedBy = msg.sender;
      report.updatedAt  = blockTimestamp;

      reports[reportId] = report;
      setState('reports', reports);

      emit('ReportVerified', { id: reportId, verifiedBy: msg.sender });

      return { success: true, report };
    },

    resolveReport(args) {
      const { reportId } = args;
      require(reportId, 'Missing required field: reportId');

      const reports = getState('reports') || {};
      const report = reports[reportId];
      require(report, `Report not found: ${reportId}`);
      require(report.status !== 'RESOLVED', 'Report already resolved');

      report.status     = 'RESOLVED';
      report.resolvedBy = msg.sender;
      report.updatedAt  = blockTimestamp;

      reports[reportId] = report;
      setState('reports', reports);

      emit('ReportResolved', { id: reportId, resolvedBy: msg.sender });

      return { success: true, report };
    },

    getReport(args) {
      const { reportId } = args;
      require(reportId, 'Missing required field: reportId');
      const reports = getState('reports') || {};
      const report = reports[reportId];
      require(report, `Report not found: ${reportId}`);
      return { report };
    },

    getReports(args) {
      const page     = Math.max(0, parseInt(args.page  || 0));
      const pageSize = Math.min(50, parseInt(args.pageSize || 20));
      const category = args.category || null;
      const status   = args.status   || null;
      const reporter = args.reporter || null;

      const reports = getState('reports') || {};
      const reportIds = getState('reportIds') || [];
      let ids = [...reportIds].reverse(); // newest first

      if (category || status || reporter) {
        ids = ids.filter(id => {
          const r = reports[id];
          if (!r) return false;
          if (category && r.category !== category) return false;
          if (status   && r.status   !== status)   return false;
          if (reporter && r.reporter !== reporter) return false;
          return true;
        });
      }

      const total   = ids.length;
      const slice   = ids.slice(page * pageSize, (page + 1) * pageSize);
      const resultReports = slice.map(id => reports[id]).filter(Boolean);

      return { reports: resultReports, total, page, pageSize, pages: Math.ceil(total / pageSize) };
    },

    getStats() {
      const reports = getState('reports') || {};
      const all = Object.values(reports);
      const byStatus   = {};
      const byCategory = {};
      for (const r of all) {
        byStatus[r.status]     = (byStatus[r.status]     || 0) + 1;
        byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      }
      const count = getState('count') || 0;
      return { total: count, byStatus, byCategory };
    }
  }
};