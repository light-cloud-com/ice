import { secretStoreConceptBlueprint } from './blueprint';
import { secretStoreInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(secretStoreConceptBlueprint.iceType, secretStoreConceptBlueprint.visualFamily);
registerInfo(secretStoreConceptBlueprint.iceType, secretStoreInfo);

export { secretStoreConceptBlueprint, secretStoreInfo };
