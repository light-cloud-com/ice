import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { privateAiServiceConceptBlueprint } from './blueprint';
import { privateAiServiceInfo } from './info';

registerConceptFamily(privateAiServiceConceptBlueprint.iceType, privateAiServiceConceptBlueprint.visualFamily);
registerInfo(privateAiServiceConceptBlueprint.iceType, privateAiServiceInfo);

export { privateAiServiceConceptBlueprint, privateAiServiceInfo };
