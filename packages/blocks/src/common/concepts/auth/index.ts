import { authConceptBlueprint } from './blueprint';
import { authInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(authConceptBlueprint.iceType, authConceptBlueprint.visualFamily);
registerInfo(authConceptBlueprint.iceType, authInfo);

export { authConceptBlueprint, authInfo };
