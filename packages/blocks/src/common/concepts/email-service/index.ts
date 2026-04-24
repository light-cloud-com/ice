import { emailServiceConceptBlueprint } from './blueprint';
import { emailServiceInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(emailServiceConceptBlueprint.iceType, emailServiceConceptBlueprint.visualFamily);
registerInfo(emailServiceConceptBlueprint.iceType, emailServiceInfo);

export { emailServiceConceptBlueprint, emailServiceInfo };
