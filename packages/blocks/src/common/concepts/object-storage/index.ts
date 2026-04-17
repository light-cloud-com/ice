import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { objectStorageConceptBlueprint } from './blueprint';
import { objectStorageInfo } from './info';

registerConceptFamily(objectStorageConceptBlueprint.iceType, objectStorageConceptBlueprint.visualFamily);
registerInfo(objectStorageConceptBlueprint.iceType, objectStorageInfo);

export { objectStorageConceptBlueprint, objectStorageInfo };
