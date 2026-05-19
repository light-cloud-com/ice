import { serverlessFunctionConceptBlueprint } from './blueprint';
import { serverlessFunctionInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(serverlessFunctionConceptBlueprint.iceType, serverlessFunctionConceptBlueprint.visualFamily);
registerInfo(serverlessFunctionConceptBlueprint.iceType, serverlessFunctionInfo);

export { serverlessFunctionConceptBlueprint, serverlessFunctionInfo };
