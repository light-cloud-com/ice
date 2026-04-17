import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { observabilityConceptBlueprint } from './blueprint';
import { observabilityInfo } from './info';

registerConceptFamily(observabilityConceptBlueprint.iceType, observabilityConceptBlueprint.visualFamily);
registerInfo(observabilityConceptBlueprint.iceType, observabilityInfo);

export { observabilityConceptBlueprint, observabilityInfo };
