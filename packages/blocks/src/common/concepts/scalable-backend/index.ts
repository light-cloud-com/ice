import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { scalableBackendConceptBlueprint } from './blueprint';
import { scalableBackendInfo } from './info';

registerConceptFamily(scalableBackendConceptBlueprint.iceType, scalableBackendConceptBlueprint.visualFamily);
registerInfo(scalableBackendConceptBlueprint.iceType, scalableBackendInfo);

export { scalableBackendConceptBlueprint, scalableBackendInfo };
