import { workerConceptBlueprint } from './blueprint';
import { workerInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(workerConceptBlueprint.iceType, workerConceptBlueprint.visualFamily);
registerInfo(workerConceptBlueprint.iceType, workerInfo);

export { workerConceptBlueprint, workerInfo };
