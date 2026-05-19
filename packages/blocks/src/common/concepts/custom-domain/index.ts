import { customDomainConceptBlueprint } from './blueprint';
import { customDomainInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(customDomainConceptBlueprint.iceType, customDomainConceptBlueprint.visualFamily);
registerInfo(customDomainConceptBlueprint.iceType, customDomainInfo);

export { customDomainConceptBlueprint, customDomainInfo };
