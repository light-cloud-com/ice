/**
 * Static Site — barrel + registrations
 *
 * Importing this module registers Static Site's family and info content
 * into the global registries. The per-concept UI visual (if any) is
 * registered separately in @ice/ui/features/concepts/static-site.tsx.
 */

import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { staticSiteConceptBlueprint } from './blueprint';
import { staticSiteInfo } from './info';

registerConceptFamily(staticSiteConceptBlueprint.iceType, staticSiteConceptBlueprint.visualFamily);
registerInfo(staticSiteConceptBlueprint.iceType, staticSiteInfo);

export { staticSiteConceptBlueprint, staticSiteInfo };
