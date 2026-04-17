import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { secretStoreConceptBlueprint } from './blueprint';
import { secretStoreInfo } from './info';

registerConceptFamily(secretStoreConceptBlueprint.iceType, secretStoreConceptBlueprint.visualFamily);
registerInfo(secretStoreConceptBlueprint.iceType, secretStoreInfo);

export { secretStoreConceptBlueprint, secretStoreInfo };
