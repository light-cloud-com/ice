import { privateNetworkConceptBlueprint } from './blueprint';
import { privateNetworkInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(privateNetworkConceptBlueprint.iceType, privateNetworkConceptBlueprint.visualFamily);
registerInfo(privateNetworkConceptBlueprint.iceType, privateNetworkInfo);

export { privateNetworkConceptBlueprint, privateNetworkInfo };
