import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { redisCacheConceptBlueprint } from './blueprint';
import { redisCacheInfo } from './info';

registerConceptFamily(redisCacheConceptBlueprint.iceType, redisCacheConceptBlueprint.visualFamily);
registerInfo(redisCacheConceptBlueprint.iceType, redisCacheInfo);

export { redisCacheConceptBlueprint, redisCacheInfo };
