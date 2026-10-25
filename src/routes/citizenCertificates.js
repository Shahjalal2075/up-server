import { certRoutes } from './certRouter.js';
import { personCert } from './personCert.js';

export default certRoutes({ page: 'citizen-certificates', table: 'citizen_certificates', label: 'নাগরিক সনদ', ...personCert });
