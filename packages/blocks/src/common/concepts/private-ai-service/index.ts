import { privateAiServiceConceptBlueprint } from './blueprint';
import { privateAiServiceInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(privateAiServiceConceptBlueprint.iceType, privateAiServiceConceptBlueprint.visualFamily);
registerInfo(privateAiServiceConceptBlueprint.iceType, privateAiServiceInfo);

export { privateAiServiceConceptBlueprint, privateAiServiceInfo };
