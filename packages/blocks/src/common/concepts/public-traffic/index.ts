import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { publicTrafficConceptBlueprint } from './blueprint';
import { publicTrafficInfo } from './info';

registerConceptFamily(publicTrafficConceptBlueprint.iceType, publicTrafficConceptBlueprint.visualFamily);
registerInfo(publicTrafficConceptBlueprint.iceType, publicTrafficInfo);

export { publicTrafficConceptBlueprint, publicTrafficInfo };
