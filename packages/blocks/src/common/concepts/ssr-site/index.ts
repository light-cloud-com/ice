import { ssrSiteConceptBlueprint } from './blueprint';
import { ssrSiteInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(ssrSiteConceptBlueprint.iceType, ssrSiteConceptBlueprint.visualFamily);
registerInfo(ssrSiteConceptBlueprint.iceType, ssrSiteInfo);

export { ssrSiteConceptBlueprint, ssrSiteInfo };
