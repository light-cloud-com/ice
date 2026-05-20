import { vectorDbConceptBlueprint } from './blueprint';
import { vectorDbInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(vectorDbConceptBlueprint.iceType, vectorDbConceptBlueprint.visualFamily);
registerInfo(vectorDbConceptBlueprint.iceType, vectorDbInfo);

export { vectorDbConceptBlueprint, vectorDbInfo };
