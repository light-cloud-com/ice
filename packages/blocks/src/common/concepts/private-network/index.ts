import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { privateNetworkConceptBlueprint } from './blueprint';
import { privateNetworkInfo } from './info';

registerConceptFamily(privateNetworkConceptBlueprint.iceType, privateNetworkConceptBlueprint.visualFamily);
registerInfo(privateNetworkConceptBlueprint.iceType, privateNetworkInfo);

export { privateNetworkConceptBlueprint, privateNetworkInfo };
