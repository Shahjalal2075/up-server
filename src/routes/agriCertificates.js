import { certRoutes } from './certRouter.js';
import { personCert } from './personCert.js';

export default certRoutes({ page: 'agriculture-certificates', table: 'agri_certificates', label: 'প্রত্যয়নপত্র', ...personCert });
