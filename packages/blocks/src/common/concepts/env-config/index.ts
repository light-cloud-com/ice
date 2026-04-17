import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { envConfigConceptBlueprint } from './blueprint';
import { envConfigInfo } from './info';

registerConceptFamily(envConfigConceptBlueprint.iceType, envConfigConceptBlueprint.visualFamily);
registerInfo(envConfigConceptBlueprint.iceType, envConfigInfo);

export { envConfigConceptBlueprint, envConfigInfo };
