import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { emailServiceConceptBlueprint } from './blueprint';
import { emailServiceInfo } from './info';

registerConceptFamily(emailServiceConceptBlueprint.iceType, emailServiceConceptBlueprint.visualFamily);
registerInfo(emailServiceConceptBlueprint.iceType, emailServiceInfo);

export { emailServiceConceptBlueprint, emailServiceInfo };
