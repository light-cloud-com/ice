import { scalableBackendConceptBlueprint } from './blueprint';
import { scalableBackendInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(scalableBackendConceptBlueprint.iceType, scalableBackendConceptBlueprint.visualFamily);
registerInfo(scalableBackendConceptBlueprint.iceType, scalableBackendInfo);

export { scalableBackendConceptBlueprint, scalableBackendInfo };
