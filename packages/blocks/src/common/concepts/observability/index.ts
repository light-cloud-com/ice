import { observabilityConceptBlueprint } from './blueprint';
import { observabilityInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(observabilityConceptBlueprint.iceType, observabilityConceptBlueprint.visualFamily);
registerInfo(observabilityConceptBlueprint.iceType, observabilityInfo);

export { observabilityConceptBlueprint, observabilityInfo };
