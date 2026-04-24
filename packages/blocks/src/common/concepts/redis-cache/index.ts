import { redisCacheConceptBlueprint } from './blueprint';
import { redisCacheInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(redisCacheConceptBlueprint.iceType, redisCacheConceptBlueprint.visualFamily);
registerInfo(redisCacheConceptBlueprint.iceType, redisCacheInfo);

export { redisCacheConceptBlueprint, redisCacheInfo };
