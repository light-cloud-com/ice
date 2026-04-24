import { postgresConceptBlueprint } from './blueprint';
import { postgresInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(postgresConceptBlueprint.iceType, postgresConceptBlueprint.visualFamily);
registerInfo(postgresConceptBlueprint.iceType, postgresInfo);

export { postgresConceptBlueprint, postgresInfo };
