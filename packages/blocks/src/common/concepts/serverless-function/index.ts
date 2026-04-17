import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { serverlessFunctionConceptBlueprint } from './blueprint';
import { serverlessFunctionInfo } from './info';

registerConceptFamily(serverlessFunctionConceptBlueprint.iceType, serverlessFunctionConceptBlueprint.visualFamily);
registerInfo(serverlessFunctionConceptBlueprint.iceType, serverlessFunctionInfo);

export { serverlessFunctionConceptBlueprint, serverlessFunctionInfo };
