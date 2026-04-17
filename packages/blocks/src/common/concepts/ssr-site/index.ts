import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { ssrSiteConceptBlueprint } from './blueprint';
import { ssrSiteInfo } from './info';

registerConceptFamily(ssrSiteConceptBlueprint.iceType, ssrSiteConceptBlueprint.visualFamily);
registerInfo(ssrSiteConceptBlueprint.iceType, ssrSiteInfo);

export { ssrSiteConceptBlueprint, ssrSiteInfo };
