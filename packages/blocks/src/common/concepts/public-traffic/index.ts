import { publicTrafficConceptBlueprint } from './blueprint';
import { publicTrafficInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(publicTrafficConceptBlueprint.iceType, publicTrafficConceptBlueprint.visualFamily);
registerInfo(publicTrafficConceptBlueprint.iceType, publicTrafficInfo);

export { publicTrafficConceptBlueprint, publicTrafficInfo };
