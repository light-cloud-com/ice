import { mongodbConceptBlueprint } from './blueprint';
import { mongodbInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(mongodbConceptBlueprint.iceType, mongodbConceptBlueprint.visualFamily);
registerInfo(mongodbConceptBlueprint.iceType, mongodbInfo);

export { mongodbConceptBlueprint, mongodbInfo };
