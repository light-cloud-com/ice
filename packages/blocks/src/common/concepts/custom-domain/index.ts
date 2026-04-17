import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { customDomainConceptBlueprint } from './blueprint';
import { customDomainInfo } from './info';

registerConceptFamily(customDomainConceptBlueprint.iceType, customDomainConceptBlueprint.visualFamily);
registerInfo(customDomainConceptBlueprint.iceType, customDomainInfo);

export { customDomainConceptBlueprint, customDomainInfo };
