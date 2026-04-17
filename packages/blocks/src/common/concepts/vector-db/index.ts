import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { vectorDbConceptBlueprint } from './blueprint';
import { vectorDbInfo } from './info';

registerConceptFamily(vectorDbConceptBlueprint.iceType, vectorDbConceptBlueprint.visualFamily);
registerInfo(vectorDbConceptBlueprint.iceType, vectorDbInfo);

export { vectorDbConceptBlueprint, vectorDbInfo };
