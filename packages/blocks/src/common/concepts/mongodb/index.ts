import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { mongodbConceptBlueprint } from './blueprint';
import { mongodbInfo } from './info';

registerConceptFamily(mongodbConceptBlueprint.iceType, mongodbConceptBlueprint.visualFamily);
registerInfo(mongodbConceptBlueprint.iceType, mongodbInfo);

export { mongodbConceptBlueprint, mongodbInfo };
