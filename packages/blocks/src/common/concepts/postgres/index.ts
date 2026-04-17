import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { postgresConceptBlueprint } from './blueprint';
import { postgresInfo } from './info';

registerConceptFamily(postgresConceptBlueprint.iceType, postgresConceptBlueprint.visualFamily);
registerInfo(postgresConceptBlueprint.iceType, postgresInfo);

export { postgresConceptBlueprint, postgresInfo };
