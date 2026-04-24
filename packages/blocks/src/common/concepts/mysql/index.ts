import { mysqlConceptBlueprint } from './blueprint';
import { mysqlInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(mysqlConceptBlueprint.iceType, mysqlConceptBlueprint.visualFamily);
registerInfo(mysqlConceptBlueprint.iceType, mysqlInfo);

export { mysqlConceptBlueprint, mysqlInfo };
