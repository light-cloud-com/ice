import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { workerConceptBlueprint } from './blueprint';
import { workerInfo } from './info';

registerConceptFamily(workerConceptBlueprint.iceType, workerConceptBlueprint.visualFamily);
registerInfo(workerConceptBlueprint.iceType, workerInfo);

export { workerConceptBlueprint, workerInfo };
