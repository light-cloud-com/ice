import { objectStorageConceptBlueprint } from './blueprint';
import { objectStorageInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(objectStorageConceptBlueprint.iceType, objectStorageConceptBlueprint.visualFamily);
registerInfo(objectStorageConceptBlueprint.iceType, objectStorageInfo);

export { objectStorageConceptBlueprint, objectStorageInfo };
