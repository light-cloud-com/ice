import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { mysqlConceptBlueprint } from './blueprint';
import { mysqlInfo } from './info';

registerConceptFamily(mysqlConceptBlueprint.iceType, mysqlConceptBlueprint.visualFamily);
registerInfo(mysqlConceptBlueprint.iceType, mysqlInfo);

export { mysqlConceptBlueprint, mysqlInfo };
