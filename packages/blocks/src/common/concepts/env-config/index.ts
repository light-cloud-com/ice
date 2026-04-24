import { envConfigConceptBlueprint } from './blueprint';
import { envConfigInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(envConfigConceptBlueprint.iceType, envConfigConceptBlueprint.visualFamily);
registerInfo(envConfigConceptBlueprint.iceType, envConfigInfo);

export { envConfigConceptBlueprint, envConfigInfo };
