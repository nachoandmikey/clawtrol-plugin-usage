import UsageModule from './UsageModule.js';
import UsageSummary from './widgets/UsageSummary.js';
import { GET as usageGet } from './api/usage.js';
import { GET as alertGet } from './api/alert.js';

const plugin = {
  moduleId: 'usage',
  moduleName: 'Claude Usage',
  icon: '📊',
  component: UsageModule,
  widgets: [
    {
      id: 'usage-summary',
      name: 'Usage Summary',
      component: UsageSummary,
    },
  ],
  apiRoutes: {
    '/api/plugins/usage': usageGet,
    '/api/plugins/usage/alert': alertGet,
  },
};

export default plugin;
export { UsageModule, UsageSummary, usageGet, alertGet };
